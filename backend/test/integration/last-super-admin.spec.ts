import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { SessionService } from '../../src/auth/session.service';
import { SESSION_COOKIE } from '../../src/auth/session.guard';
import { seedDemo, userId } from '../utils/auth-helpers';
import type { AuthenticatedUser } from '../../src/auth/auth.types';
import { UsersService } from '../../src/users/users.service';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Audit de sécurité R15 : il reste toujours au moins un super administrateur actif. Un super administrateur ne peut
 * déjà ni se désactiver ni perdre son rôle ; mais deux super administrateurs qui se rétrogradent (ou se désactivent)
 * l'un l'autre au même moment passaient tous les deux, chacun ne vérifiant que « est-ce moi ? ». L'établissement
 * perdait alors toute administration (seule la commande bootstrap, sur le serveur, en recrée un).
 */
describe('Dernier super administrateur actif (R15)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let first: { id: string; cookie: string };
  let second: { id: string; cookie: string };

  const patch = (cookie: string, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).patch(`/api/admin/users/${id}`).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  const activeSuperAdmins = () => prisma.user.count({ where: { role: 'SUPER_ADMIN', active: true } });
  const ok = (status: number) => status >= 200 && status < 300;

  /** Deux super administrateurs actifs, chacun avec une session neuve (une désactivation ferme les sessions). */
  async function twoActiveSuperAdmins(): Promise<void> {
    await prisma.user.updateMany({ where: { id: { in: [first.id, second.id] } }, data: { role: 'SUPER_ADMIN', active: true } });
    // Sessions ouvertes par le service, sans la page de connexion : son limiteur (5 essais par minute) bloquerait
    // les tours suivants, chaque désactivation fermant les sessions.
    const sessions = app.get(SessionService);
    first.cookie = `${SESSION_COOKIE}=${(await sessions.create(first.id, null)).token}`;
    second.cookie = `${SESSION_COOKIE}=${(await sessions.create(second.id, null)).token}`;
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { username: 'superadmin' } });
    await prisma.user.create({
      data: { username: 'superadmin.deux', displayName: 'Super administratrice deux', role: 'SUPER_ADMIN', passwordHash, mustChangePassword: false },
    });
    app = await createTestApp();
    first = { id: await userId(prisma, 'superadmin'), cookie: '' };
    second = { id: await userId(prisma, 'superadmin.deux'), cookie: '' };
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('un super administrateur en rétrograde ou en désactive un autre tant qu’il en reste un', async () => {
    await twoActiveSuperAdmins();
    expect((await patch(first.cookie, second.id, { role: 'ADMIN' })).status).toBe(200);
    expect(await activeSuperAdmins()).toBe(1);
    await twoActiveSuperAdmins();
    expect((await patch(first.cookie, second.id, { active: false })).status).toBe(200);
    expect(await activeSuperAdmins()).toBe(1);
  });

  it('le dernier super administrateur actif ne peut pas être retiré : 409 « au moins un super administrateur actif »', async () => {
    // « superadmin » n'est plus super administrateur (changement fait ailleurs entre-temps) : « superadmin.deux » est
    // la dernière. Par HTTP, seule elle pourrait agir, et elle ne peut pas se retirer elle-même (garde existante) :
    // la garde R15 est donc appelée directement, comme le ferait une requête restée en vol de « superadmin ».
    await twoActiveSuperAdmins();
    await prisma.user.update({ where: { id: first.id }, data: { role: 'ADMIN' } });
    const users = app.get(UsersService);
    await expect(
      users.update(second.id, { role: 'ADMIN' }, { actor: { id: first.id } as AuthenticatedUser, ip: null }),
    ).rejects.toMatchObject({ code: 'CONFLICT', userMessage: 'Il doit rester au moins un super administrateur actif.' });
    expect(await activeSuperAdmins()).toBe(1);
  });

  it.each([
    ['rétrogradations croisées', { role: 'ADMIN' }, { role: 'ADMIN' }],
    ['désactivations croisées', { active: false }, { active: false }],
    ['rétrogradation et désactivation croisées', { role: 'EMPLOYEE' }, { active: false }],
  ])('%s simultanées : jamais les deux, il reste un super administrateur actif', async (_label, onSecond, onFirst) => {
    for (let round = 0; round < 5; round++) {
      await twoActiveSuperAdmins();
      const [a, b] = await Promise.all([patch(first.cookie, second.id, onSecond), patch(second.cookie, first.id, onFirst)]);
      expect({ round, both: ok(a.status) && ok(b.status) }).toEqual({ round, both: false });
      expect({ round, remaining: await activeSuperAdmins() }).toEqual({ round, remaining: 1 });
      // Refus explicite, jamais une erreur serveur : 409 si les deux retraits se croisent ; 403 (ou 401 après une
      // désactivation, sessions fermées) si le premier a abouti avant que le second passe le contrôle d'accès.
      for (const res of [a, b].filter((r) => !ok(r.status))) {
        expect([401, 403, 409]).toContain(res.status);
        if (res.status === 409) expect(res.body.error.message).toMatch(/au moins un super administrateur actif/);
      }
    }
  });
});
