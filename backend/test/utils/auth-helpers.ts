import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { runSeed } from '../../prisma/seed';
import { sessionCookie, TEST_ORIGIN } from './test-app';

/** Mot de passe commun des comptes du seed en mode e2e/tests. */
export const SEED_PASSWORD = 'MotDePasse-Tests-2026!';

/** Charge le seed de démonstration (comptes enseignante, reprographie, admin, superadmin, nouveau, surveillants). */
export async function seedDemo(prisma: PrismaClient): Promise<void> {
  await runSeed(prisma, { e2ePassword: SEED_PASSWORD, log: () => undefined });
}

/** Ouvre une session et renvoie l'en-tête Cookie à réutiliser. */
export async function loginAs(app: INestApplication, username: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .set('Origin', TEST_ORIGIN)
    .send({ username, password: SEED_PASSWORD });
  if (res.status !== 200) throw new Error(`Connexion de ${username} impossible : ${res.status}`);
  return sessionCookie(res.headers['set-cookie']);
}

export async function userId(prisma: PrismaClient, username: string): Promise<string> {
  return (await prisma.user.findUniqueOrThrow({ where: { username } })).id;
}

export const CATEGORIES = {
  photocopies: 'Photocopies',
  petitsTravaux: 'Petits travaux (démo photo)',
  circuitB: 'Intervention technique (démo circuit B)',
} as const;

export async function categoryId(prisma: PrismaClient, name: (typeof CATEGORIES)[keyof typeof CATEGORIES]): Promise<string> {
  return (await prisma.category.findUniqueOrThrow({ where: { name } })).id;
}
