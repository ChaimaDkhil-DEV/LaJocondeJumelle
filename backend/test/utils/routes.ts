import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { INTEGRATION_ROUTE } from '../../src/auth/integration-route.decorator';
import { PARENT_ALLOWED } from '../../src/auth/parent-allowed.decorator';
import { IS_PUBLIC_KEY } from '../../src/auth/public.decorator';

/** Identifiant substitué à chaque paramètre de chemin : bien formé, mais d'aucune ligne. */
export const ROUTE_UUID = '00000000-0000-4000-8000-000000000000';

export type Verb = 'get' | 'post' | 'put' | 'patch' | 'delete';
const VERBS: Partial<Record<RequestMethod, Verb>> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.DELETE]: 'delete',
};

export interface AppRoute {
  verb: Verb;
  /** Chemin appelable, paramètres remplacés par ROUTE_UUID. */
  path: string;
  /** « VERBE /chemin », la clé des tables de droits. */
  key: string;
  /** Préfixe du contrôleur (premier segment après /api). */
  prefix: string;
  /** @Public() : sans session. */
  isPublic: boolean;
  /** @IntegrationRoute() : appel de serveur à serveur, protégé par son propre jeton. */
  isIntegration: boolean;
  /** @ParentAllowed() : seule porte d'entrée d'un compte parent. */
  parentAllowed: boolean;
}

const join = (...parts: string[]) => '/' + parts.flatMap((p) => p.split('/')).filter(Boolean).join('/');
const flag = (key: string, handler: object, type: object) =>
  Boolean(Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, type));

/** Toutes les routes HTTP de l'application, relevées sur les métadonnées Nest (même ordre que la déclaration). */
export function allRoutes(app: INestApplication): AppRoute[] {
  const routes: AppRoute[] = [];
  const seen = new Set<string>();
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const type = wrapper.metatype as (new (...args: never[]) => object) | null;
      if (!type) continue;
      const prefixes = Reflect.getMetadata(PATH_METADATA, type) as string | string[] | undefined;
      const base = (Array.isArray(prefixes) ? prefixes[0] : prefixes) ?? '';
      for (const name of Object.getOwnPropertyNames(type.prototype)) {
        const handler = (type.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        const verb = method === undefined ? undefined : VERBS[method];
        if (!verb) continue;
        const subs = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
        for (const sub of Array.isArray(subs) ? subs : [subs ?? '']) {
          const path = join('api', base, sub).replace(/:[A-Za-z]+/g, ROUTE_UUID);
          const key = `${verb.toUpperCase()} ${path}`;
          if (seen.has(key)) continue;
          seen.add(key);
          routes.push({
            verb,
            path,
            key,
            prefix: base.split('/')[0],
            isPublic: flag(IS_PUBLIC_KEY, handler, type),
            isIntegration: flag(INTEGRATION_ROUTE, handler, type),
            parentAllowed: flag(PARENT_ALLOWED, handler, type),
          });
        }
      }
    }
  }
  return routes;
}
