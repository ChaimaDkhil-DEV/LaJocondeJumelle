import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';

/** API officielle de vérification ; jamais configurable : la clé secrète n'est envoyée qu'à Cloudflare. */
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const SITEVERIFY_TIMEOUT_MS = 5_000;
/** Longueur maximale d'un jeton Turnstile (documentation Cloudflare). */
export const MAX_CAPTCHA_TOKEN_LENGTH = 2_048;
/** Un jeton Turnstile est valable 300 s : au-delà, Cloudflare le refuse de lui-même. */
export const USED_TOKEN_TTL_MS = 300_000;
const MAX_USED_TOKENS = 10_000;

/** Erreurs de Siteverify qui ne disent rien du jeton : configuration du serveur ou panne de Cloudflare. */
const SERVICE_ERRORS = new Set(['missing-input-secret', 'invalid-input-secret', 'internal-error']);

/** Jeton d'injection facultatif : les tests fournissent leur horloge directement au constructeur. */
const TURNSTILE_CLOCK = Symbol('TURNSTILE_CLOCK');

/** `EXPIRED` : expiré ou déjà utilisé (Cloudflare ne les distingue pas). */
export type CaptchaVerdict = 'VALID' | 'INVALID' | 'EXPIRED' | 'UNAVAILABLE';

interface SiteverifyResponse {
  success?: unknown;
  hostname?: unknown;
  action?: unknown;
  'error-codes'?: unknown;
}

/**
 * CAPTCHA Cloudflare Turnstile : seul endroit qui vérifie un jeton. Seule une validation explicite de Cloudflare, émise
 * pour ce site et cette action, est acceptée ; une panne, un délai dépassé ou une réponse inattendue est un refus.
 * Ni le jeton ni la clé secrète ne sont journalisés.
 */
@Injectable()
export class TurnstileService implements OnModuleInit {
  private readonly logger = new Logger(TurnstileService.name);
  private readonly hostnames: ReadonlySet<string>;
  /** Empreinte d'un jeton présenté → fin de mémorisation. En mémoire : l'API a une seule instance. */
  private readonly usedTokens = new Map<string, number>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() @Inject(TURNSTILE_CLOCK) private readonly now: () => number = Date.now,
  ) {
    this.hostnames = new Set(config.allowedOrigins.map((origin) => new URL(origin).hostname));
  }

  onModuleInit(): void {
    if (this.config.isProduction && !this.enabled) {
      this.logger.warn('CAPTCHA de connexion désactivé (TURNSTILE_SITE_KEY et TURNSTILE_SECRET_KEY vides)');
    }
  }

  get enabled(): boolean {
    return this.config.turnstile !== null;
  }

  /** Clé publique, destinée au navigateur ; null : CAPTCHA désactivé. */
  get siteKey(): string | null {
    return this.config.turnstile?.siteKey ?? null;
  }

  async verify(token: string, action: string): Promise<CaptchaVerdict> {
    const turnstile = this.config.turnstile;
    if (!turnstile) return 'UNAVAILABLE';
    // Les clés de test rendent toujours le même jeton factice : rien à mémoriser (refusées en production).
    if (!turnstile.testKeys && !this.markUsed(token)) return 'EXPIRED';

    const answer = await this.siteverify(turnstile.secretKey, token);
    if (!answer) return 'UNAVAILABLE';
    if (answer.success !== true) return this.refusal(answer);
    if (turnstile.testKeys) return 'VALID';
    const expected = typeof answer.hostname === 'string' && this.hostnames.has(answer.hostname) && answer.action === action;
    if (!expected) this.logger.warn('Jeton CAPTCHA émis pour un autre site ou une autre action : refusé');
    return expected ? 'VALID' : 'INVALID';
  }

  /** Réponse exploitable de Cloudflare (acceptation, ou refus avec ses codes), sinon null. */
  private async siteverify(secret: string, token: string): Promise<SiteverifyResponse | null> {
    let status: number;
    let body: unknown;
    try {
      const response = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Minimisation : ni l'adresse IP ni l'identifiant de la personne ne sont transmis.
        body: JSON.stringify({ secret, response: token }),
        redirect: 'error',
        signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
      });
      status = response.status;
      body = await response.json();
    } catch (error) {
      // Le nom de l'erreur suffit : son message pourrait reprendre le contenu envoyé.
      this.logger.error(`Vérification CAPTCHA impossible (${error instanceof Error ? error.name : 'erreur inconnue'})`);
      return null;
    }
    const answer = typeof body === 'object' && body !== null ? (body as SiteverifyResponse) : null;
    const usable = answer !== null && (status === 200 ? typeof answer.success === 'boolean' : status < 500 && answer.success === false);
    if (!usable) {
      this.logger.error(`Vérification CAPTCHA impossible (réponse ${status} inattendue)`);
      return null;
    }
    return answer;
  }

  private refusal(answer: SiteverifyResponse): CaptchaVerdict {
    const codes = Array.isArray(answer['error-codes']) ? answer['error-codes'].filter((code): code is string => typeof code === 'string') : [];
    const serviceErrors = codes.filter((code) => SERVICE_ERRORS.has(code));
    if (serviceErrors.length > 0) {
      this.logger.error(`Vérification CAPTCHA impossible (${serviceErrors.join(', ')})`);
      return 'UNAVAILABLE';
    }
    return codes.includes('timeout-or-duplicate') ? 'EXPIRED' : 'INVALID';
  }

  /**
   * Faux si ce jeton a déjà été présenté. Cloudflare refuse un jeton déjà utilisé, mais pas immédiatement : deux envois
   * rapprochés pourraient passer tous les deux. La marque est posée avant l'appel, contre les envois simultanés.
   */
  private markUsed(token: string): boolean {
    const now = this.now();
    // Durée constante : un Map garde l'ordre d'insertion, donc l'ordre d'expiration.
    for (const [key, expiresAt] of this.usedTokens) {
      if (expiresAt > now && this.usedTokens.size < MAX_USED_TOKENS) break;
      this.usedTokens.delete(key);
    }
    const key = createHash('sha256').update(token).digest('base64');
    if (this.usedTokens.has(key)) return false;
    this.usedTokens.set(key, now + USED_TOKEN_TTL_MS);
    return true;
  }
}
