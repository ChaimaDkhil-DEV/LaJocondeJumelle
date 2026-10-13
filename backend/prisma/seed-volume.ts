/**
 * Jeu de données volumineux pour les mesures de performance (SC-009) : demandes réparties sur
 * les catégories, statuts et priorités, sur 24 mois. Insertion par lots (createMany).
 * Usage : npm run -w backend seed:volume -- 10000   (après le seed de démonstration)
 */
import { PrismaClient, type Priority, type Prisma, type RequestStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const STATUSES: RequestStatus[] = ['SENT', 'ACCEPTED', 'IN_PROGRESS', 'DONE', 'TO_CORRECT', 'CLOSED', 'REJECTED', 'CANCELLED'];
const PRIORITIES: Priority[] = ['NORMAL', 'MEDIUM', 'HIGH', 'URGENT'];
const TITLES = ['Photocopies', 'Affiches', 'Étagère', 'Vidéoprojecteur', 'Fournitures', 'Clés', 'Chauffage', 'Rideaux'];
/** Numéros réservés au jeu de volume, loin de la séquence des demandes réelles. */
const NUMBER_OFFSET = 2_000_000;
const BATCH = 1000;
const DAY_MS = 86_400_000;

export async function seedVolume(prisma: PrismaClient, count: number): Promise<number> {
  const categories = await prisma.category.findMany({ include: { recipients: true } });
  const requester = await prisma.user.findUniqueOrThrow({ where: { username: 'enseignante' } });
  if (categories.length === 0) throw new Error('Lancez d’abord le seed de démonstration.');
  const now = Date.now();

  for (let start = 0; start < count; start += BATCH) {
    const rows: Prisma.RequestCreateManyInput[] = [];
    for (let i = start; i < Math.min(start + BATCH, count); i += 1) {
      const category = categories[i % categories.length];
      const status = STATUSES[i % STATUSES.length];
      const number = NUMBER_OFFSET + i;
      rows.push({
        number,
        reference: `D-V-${number}`,
        clientId: randomUUID(),
        title: `${TITLES[i % TITLES.length]} n°${i}`,
        description: 'Demande générée pour les mesures de performance',
        categoryId: category.id,
        // Décalé du statut (i / 8) : toutes les combinaisons statut × priorité existent.
        priority: PRIORITIES[Math.floor(i / STATUSES.length) % PRIORITIES.length],
        requesterId: requester.id,
        assigneeId: category.recipients[0]?.userId ?? null,
        status,
        createdAt: new Date(now - (i % 730) * DAY_MS),
        overdueStage: i % 17 === 0 && ['SENT', 'ACCEPTED', 'IN_PROGRESS'].includes(status) ? 'TAKEOVER' : null,
        rulesSnapshot: {},
      });
    }
    await prisma.request.createMany({ data: rows });
  }
  return count;
}

if (require.main === module) {
  const count = Number(process.argv[2] ?? 10_000);
  const prisma = new PrismaClient();
  seedVolume(prisma, count)
    .then((n) => console.log(`${n} demandes générées.`))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => void prisma.$disconnect());
}
