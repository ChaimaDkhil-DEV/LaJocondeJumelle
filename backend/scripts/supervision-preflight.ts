import { PrismaClient, type RequestStatus } from '@prisma/client';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from '../src/config/load-env-file';
import {
  coverageMainStatus,
  type MainStatus,
  type SubState,
} from '../src/coverage/domain/coverage-status';

/**
 * Pré-contrôle de la migration des affectations (004, contracts/migration.md étape 0, R13).
 * Lecture seule, sur une base encore à l'état 0007 : SQL brut avec conversions en texte, le client
 * Prisma suivant déjà le nouveau schéma. Produit `supervision-preflight-<date>.md` avec les
 * emplacements des validations humaines V1 (membres du groupe), V2 (statuts sans équivalent) et
 * V3 (durée de conservation), à joindre à la demande de mise en production.
 *
 * Usage : npm run preflight:supervision -w backend [-- <dossier de sortie>]
 */

const GROUP_NAME = 'Surveillants/Remplaçants';
const RETENTION_MONTHS = 12;
const KNOWN_STATUSES = [
  'BROADCAST',
  'UNFILLED',
  'ACCEPTED',
  'EN_ROUTE',
  'LATE',
  'ON_DUTY',
  'RELIEF_PENDING',
  'DONE',
  'CLOSED',
  'CANCELLED',
];

const MAIN_LABELS: Record<MainStatus, string> = {
  PENDING: 'en attente',
  ASSIGNED: 'assignée',
  IN_PROGRESS: 'en cours',
  DONE: 'terminée',
  CANCELLED: 'annulée',
  UNFILLED: 'non pourvue',
};

const SUB_LABELS: Record<SubState, string> = {
  EN_ROUTE: 'En route',
  LATE: 'En retard',
  RELIEF_PENDING: 'Relève demandée',
  CLOSED: 'Clôturée après validation',
};

/** Même critère que le garde-fou de 0009 : fin inconnue et journée (Europe/Paris) non terminée. */
const OPEN_DAY = `(d."startAt" AT TIME ZONE 'Europe/Paris')::date >= (now() AT TIME ZONE 'Europe/Paris')::date`;

function targetLabel(target: RequestStatus): string {
  const { mainStatus, subState } = coverageMainStatus(target);
  return `${target} — ${MAIN_LABELS[mainStatus]}${subState ? ` (${SUB_LABELS[subState]})` : ''}`;
}

const cell = (value: string | null) => (value?.trim() ? value.replace(/\|/g, '\\|') : '—');

function signature(code: string, question: string): string[] {
  return [
    '',
    `**Validation ${code}** — ${question}`,
    '',
    'Nom : ____________________',
    '',
    'Date : ____________________',
  ];
}

export async function buildPreflightReport(
  prisma: PrismaClient,
  now = new Date(),
): Promise<string> {
  const date = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'short',
  }).format(now);
  const lines: string[] = [`# Pré-contrôle de la migration des affectations — ${date}`, ''];
  lines.push(
    'Rapport en lecture seule (aucune donnée modifiée). Références : contracts/migration.md, étape 0.',
    '',
  );

  // A. Membres du groupe.
  const members = await prisma.$queryRawUnsafe<
    Array<{ displayName: string; username: string; jobTitle: string | null; role: string }>
  >(
    `SELECT u."displayName", u."username", u."jobTitle", u."role"::text AS role
     FROM "EmployeeGroup" g
     JOIN "EmployeeGroupMember" m ON m."groupId" = g."id"
     JOIN "User" u ON u."id" = m."userId"
     WHERE g."name" = $1
     ORDER BY u."displayName", u."username"`,
    GROUP_NAME,
  );
  lines.push(`## A. Membres du groupe « ${GROUP_NAME} »`, '');
  lines.push(
    `Membres : ${members.length}. Ils deviennent le groupe « Surveillants » (assignables).`,
    '',
  );
  lines.push('| Nom | Identifiant | Intitulé de poste | Rôle |', '|---|---|---|---|');
  for (const m of members)
    lines.push(
      `| ${cell(m.displayName)} | ${cell(m.username)} | ${cell(m.jobTitle)} | ${m.role} |`,
    );
  lines.push(
    ...signature(
      'V1',
      'indiquer ci-dessous les membres qui ne sont pas surveillants (ils restent membres ; retrait ensuite dans l’administration) :',
    ),
  );
  lines.push('');

  // B. Statuts.
  const counts = await prisma.$queryRawUnsafe<
    Array<{ status: string; openSlot: boolean | null; count: bigint }>
  >(
    `SELECT r."status"::text AS status,
            CASE WHEN r."status" = 'UNFILLED' THEN d."plannedEndAt" > now() END AS "openSlot",
            count(*) AS count
     FROM "Request" r JOIN "CoverageDetail" d ON d."requestId" = r."id"
     WHERE r."kind" = 'COVERAGE' AND r."status"::text = ANY($1::text[])
     GROUP BY 1, 2 ORDER BY 1, 2`,
    KNOWN_STATUSES,
  );
  lines.push('## B. Statuts des gardes', '');
  lines.push('| Statut actuel | Nombre | Statut après migration |', '|---|---|---|');
  for (const status of KNOWN_STATUSES) {
    for (const row of counts.filter((c) => c.status === status)) {
      let label = status;
      let target = status as RequestStatus;
      if (status === 'BROADCAST') target = 'PENDING';
      if (status === 'UNFILLED') {
        label = row.openSlot ? 'UNFILLED, créneau non terminé' : 'UNFILLED, créneau terminé';
        if (row.openSlot) target = 'PENDING';
      }
      lines.push(`| ${label} | ${Number(row.count)} | ${targetLabel(target)} |`);
    }
  }

  const unmatched = await prisma.$queryRawUnsafe<
    Array<{ reference: string; status: string; startAt: Date | null }>
  >(
    `SELECT r."reference", r."status"::text AS status, d."startAt"
     FROM "Request" r LEFT JOIN "CoverageDetail" d ON d."requestId" = r."id"
     WHERE r."kind" = 'COVERAGE'
       AND (d."requestId" IS NULL
         OR NOT (r."status"::text = ANY($1::text[]))
         OR (r."status" = 'UNFILLED' AND d."plannedEndAt" IS NULL AND ${OPEN_DAY}))
     ORDER BY r."reference"`,
    KNOWN_STATUSES,
  );
  lines.push(
    '',
    `Gardes sans équivalent évident : ${unmatched.length}${unmatched.length ? ' — la migration 0009 refusera de s’exécuter tant qu’elles subsistent.' : '.'}`,
  );
  if (unmatched.length) {
    lines.push('', '| Référence | Statut | Début | Décision |', '|---|---|---|---|');
    for (const u of unmatched)
      lines.push(`| ${u.reference} | ${u.status} | ${u.startAt?.toISOString() ?? '—'} | |`);
  }
  lines.push(...signature('V2', 'décision consignée pour chaque garde listée ci-dessus.'));
  lines.push('');

  // C. Conservation.
  const [{ count: anonymized }] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT count(*) AS count FROM "Request" r
     WHERE r."kind" = 'COVERAGE' AND r."status"::text IN ('DONE', 'CLOSED', 'CANCELLED', 'UNFILLED')
       AND r."createdAt" < now() - make_interval(months => $1::int)`,
    RETENTION_MONTHS,
  );
  lines.push('## C. Conservation', '');
  lines.push(
    `Durée proposée : ${RETENTION_MONTHS} mois glissants (réglage coverageRetentionMonths).`,
  );
  lines.push(`Affectations anonymisées dès la première exécution : ${Number(anonymized)}.`);
  lines.push(...signature('V3', 'durée de conservation validée par la direction (mois) : ______'));
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  loadEnvFile();
  const prisma = new PrismaClient();
  try {
    const now = new Date();
    const outDir = resolve(process.argv[2] ?? '.');
    const file = resolve(outDir, `supervision-preflight-${now.toISOString().slice(0, 10)}.md`);
    writeFileSync(file, await buildPreflightReport(prisma, now));
    console.log(`Rapport écrit : ${file}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
