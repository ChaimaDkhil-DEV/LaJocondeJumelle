import { buildPreflightReport } from '../../scripts/supervision-preflight';
import {
  COVERAGES,
  disposeMigrationDatabases,
  idOf,
  openDatabase,
  seedBefore,
  type MigrationDb,
} from '../utils/migration-db';

/**
 * Pré-contrôle de la migration (contracts/migration.md, étape 0 ; R13) : rapport Markdown en
 * lecture seule sur une base arrêtée à 0007, avec les emplacements de validation V1 à V3.
 */

afterAll(disposeMigrationDatabases);

/** Empreinte de toutes les tables : prouve qu'aucune écriture n'a eu lieu. */
async function fingerprint(db: MigrationDb): Promise<Record<string, string>> {
  const tables = await db.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`,
  );
  const result: Record<string, string> = {};
  for (const { tablename } of tables) {
    const [row] = await db.query<{ hash: string }>(
      `SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS hash FROM "${tablename}" t`,
    );
    result[tablename] = row.hash;
  }
  return result;
}

describe('Pré-contrôle de la migration des affectations (T017)', () => {
  jest.setTimeout(120_000);

  let db: MigrationDb;
  let report: string;
  let before: Record<string, string>;

  beforeAll(async () => {
    db = await openDatabase('preflight_0007');
    await seedBefore(db, {
      coverages: [...COVERAGES, { key: 'workStatus', status: 'SENT', start: 10, end: 70 }],
    });
    // Une affectation terminée créée il y a plus de 12 mois : anonymisée dès la première exécution.
    await db.sql(
      `UPDATE "Request" SET "createdAt" = now() - interval '13 months' WHERE "id" = '${idOf('done')}'`,
    );
    before = await fingerprint(db);
    report = await buildPreflightReport(db.prisma, new Date('2026-10-20T08:00:00Z'));
  });

  it('n’écrit rien en base', async () => {
    expect(await fingerprint(db)).toEqual(before);
  });

  it('en-tête daté', () => {
    expect(report).toMatch(/^# Pré-contrôle de la migration des affectations/);
    expect(report).toContain('20/10/2026');
  });

  it('A — membres du groupe avec intitulé et rôle, validation V1', () => {
    expect(report).toContain('## A. Membres du groupe « Surveillants/Remplaçants »');
    expect(report).toContain('| Remplaçante | remplacant | — | EMPLOYEE |');
    expect(report).toContain('| Surveillant | surveillant | — | EMPLOYEE |');
    expect(report).toMatch(/V1[^\n]*\n[\s\S]*Nom : _+[\s\S]*Date : _+/);
  });

  it('B — décompte par statut avec le statut cible, gardes sans équivalent nommées, validation V2', () => {
    expect(report).toContain('## B. Statuts des gardes');
    expect(report).toContain('| BROADCAST | 1 | PENDING — en attente |');
    expect(report).toContain('| UNFILLED, créneau non terminé | 1 | PENDING — en attente |');
    expect(report).toContain('| UNFILLED, créneau terminé | 1 | UNFILLED — non pourvue |');
    expect(report).toContain('| ACCEPTED | 1 | ACCEPTED — assignée |');
    expect(report).toContain('| CLOSED | 1 | CLOSED — terminée (Clôturée après validation) |');
    expect(report).toContain('Gardes sans équivalent évident : 1');
    expect(report).toContain('| G-12 | SENT |');
    expect(report).toContain('V2');
  });

  it('C — conservation de 12 mois, affectations anonymisées dès la première exécution, validation V3', () => {
    expect(report).toContain('## C. Conservation');
    expect(report).toContain('Durée proposée : 12 mois glissants');
    expect(report).toContain('Affectations anonymisées dès la première exécution : 1');
    expect(report).toContain('V3');
  });

  it('rapport sans équivalent : une base propre l’indique', async () => {
    const clean = await openDatabase('preflight_clean');
    await seedBefore(clean, { coverages: [] });
    const text = await buildPreflightReport(clean.prisma, new Date('2026-10-20T08:00:00Z'));
    expect(text).toContain('Gardes sans équivalent évident : 0');
    expect(text).toContain('Affectations anonymisées dès la première exécution : 0');
  });
});
