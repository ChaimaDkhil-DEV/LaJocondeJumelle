import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Import CSV de comptes et d'élèves : le fichier est vérifié en entier avant toute création (aperçu), la création
 * est tout ou rien, les règles sont celles des formulaires, et les mots de passe provisoires ne sont donnés
 * qu'une fois. Super administrateur uniquement.
 */
describe('Imports CSV', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookies: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const post = (as: string, url: string, body: Record<string, unknown>) => api().post(url).set('Cookie', cookies[as]).set('Origin', TEST_ORIGIN).send(body);

  /** Fichier au format d'Excel en français : BOM, « ; » et fins de ligne CRLF. */
  const BOM = String.fromCharCode(0xfeff);
  const excel = (lines: string[]) => `${BOM}${lines.join('\r\n')}\r\n`;

  interface Report {
    dryRun: boolean;
    created: boolean;
    count: number;
    total: number;
    valid: number;
    invalid: number;
    fileErrors: string[];
    issues: Array<{ line: number; label: string; errors: string[] }>;
    truncated: boolean;
    preview: Array<{ line: number; label: string; detail: string }>;
    accounts?: Array<{ username: string; displayName: string; temporaryPassword: string }>;
    passwordsCsv?: string;
  }
  const importAccounts = async (csv: string, dryRun: boolean, as = 'superadmin') => {
    const res = await post(as, '/api/admin/users/import', { csv, dryRun });
    expect(res.status).toBe(200);
    return res.body as Report;
  };
  const importStudents = async (csv: string, dryRun: boolean, as = 'superadmin') => {
    const res = await post(as, '/api/admin/students/import', { csv, dryRun });
    expect(res.status).toBe(200);
    return res.body as Report;
  };
  const errorsOf = (report: Report, line: number) => report.issues.find((i) => i.line === line)?.errors ?? [];

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    for (const username of ['superadmin', 'admin', 'surveillant', 'enseignante']) cookies[username] = await loginAs(app, username);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('comptes', () => {
    const HEADER = 'identifiant;nom_affiche;fonction;role;groupes;etage;categories';

    it('l’aperçu vérifie tout et ne crée rien', async () => {
      const before = await prisma.user.count();
      const report = await importAccounts(
        excel([HEADER, 'amine.bs;Amine Ben Salah;Professeur;employé;Enseignants;;', 'sarra.t;Sarra Trabelsi;Surveillante;employé;Surveillants;1er étage;']),
        true,
      );
      expect(report).toMatchObject({ dryRun: true, created: false, count: 0, total: 2, valid: 2, invalid: 0, fileErrors: [], issues: [] });
      expect(report.preview).toEqual([
        expect.objectContaining({ line: 2, label: 'Amine Ben Salah (amine.bs)' }),
        expect.objectContaining({ line: 3, label: 'Sarra Trabelsi (sarra.t)', detail: expect.stringContaining('1er étage') }),
      ]);
      expect(report.accounts).toBeUndefined();
      expect(await prisma.user.count()).toBe(before);
    });

    it('crée les comptes, leurs groupes, étage et catégories, et donne les mots de passe provisoires une seule fois', async () => {
      const report = await importAccounts(
        excel([
          HEADER,
          'import.prof;Prof Import;Professeur;employé;Enseignants;;',
          'import.surv;Surveillant Import;Surveillante;employé;Surveillants;2e étage;',
          'import.repro;Reprographie Import;Reprographie;Employé;;;Photocopies',
          'import.admin;Admin Import;Surveillante générale;admin;;;',
        ]),
        false,
      );
      expect(report).toMatchObject({ created: true, count: 4, total: 4, invalid: 0 });
      expect(report.accounts).toHaveLength(4);

      const users = await prisma.user.findMany({
        where: { username: { startsWith: 'import.' } },
        include: { groupMemberships: { include: { group: true } }, recipientOf: { include: { category: true } }, floor: true },
        orderBy: { username: 'asc' },
      });
      const byName = Object.fromEntries(users.map((u) => [u.username, u]));
      expect(byName['import.prof']).toMatchObject({ displayName: 'Prof Import', jobTitle: 'Professeur', role: 'EMPLOYEE', mustChangePassword: true, active: true });
      expect(byName['import.prof'].groupMemberships.map((m) => m.group.name)).toEqual(['Enseignants']);
      expect(byName['import.surv'].floor?.name).toBe('2e étage');
      expect(byName['import.surv'].groupMemberships.map((m) => m.group.name)).toEqual(['Surveillants']);
      expect(byName['import.repro'].recipientOf.map((r) => r.category.name)).toEqual(['Photocopies']);
      expect(byName['import.admin'].role).toBe('ADMIN');
      // Mot de passe stocké haché, jamais en clair.
      for (const user of users) {
        expect(user.passwordHash).toMatch(/^\$argon2id\$/);
        expect(report.accounts!.map((a) => a.temporaryPassword)).not.toContain(user.passwordHash);
      }
    });

    it('chaque mot de passe provisoire ouvre bien son compte, et ils sont tous différents', async () => {
      const report = await importAccounts(excel([HEADER, 'login.un;Login Un;;;;;', 'login.deux;Login Deux;;;;;']), false);
      const passwords = report.accounts!.map((a) => a.temporaryPassword);
      expect(new Set(passwords).size).toBe(2);
      for (const account of report.accounts!) {
        const res = await api().post('/api/auth/login').set('Origin', TEST_ORIGIN).send({ username: account.username, password: account.temporaryPassword });
        expect(res.status).toBe(200);
        expect((res.body as { user: { mustChangePassword: boolean } }).user.mustChangePassword).toBe(true);
      }
    });

    it('fournit les mots de passe en CSV pour tableur (BOM, « ; », formules neutralisées)', async () => {
      const report = await importAccounts(excel([HEADER, 'formule.test;=SOMME(1;1);;;;;']), false);
      expect(report.created).toBe(true);
      const csv = report.passwordsCsv!;
      expect(csv.startsWith(`${BOM}Identifiant;Nom;Mot de passe provisoire\r\n`)).toBe(true);
      const [, line] = csv.trim().split('\r\n');
      const [username, name, password] = line.split(';');
      expect(username).toBe('formule.test');
      expect(name).toBe("'=SOMME(1");
      expect(password.length).toBeGreaterThanOrEqual(16);
    });

    it('journalise chaque création avec l’origine « import »', async () => {
      const report = await importAccounts(excel([HEADER, 'audit.un;Audit Un;;;Enseignants;;']), false);
      expect(report.created).toBe(true);
      const user = await prisma.user.findUniqueOrThrow({ where: { username: 'audit.un' } });
      const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'USER_CREATED', targetId: user.id } });
      expect(entry.actorId).not.toBeNull();
      expect(entry.details).toMatchObject({ source: 'import', after: { username: 'audit.un', role: 'EMPLOYEE' } });
      expect(JSON.stringify(entry.details)).not.toContain(report.accounts![0].temporaryPassword);
    });

    it('tout ou rien : une seule ligne en erreur et aucun compte n’est créé', async () => {
      const before = await prisma.user.count();
      const report = await importAccounts(excel([HEADER, 'tout.ok;Tout Ok;;;;;', 'a;Trop Court;;;;;', 'bon.aussi;Bon Aussi;;;;;']), false);
      expect(report).toMatchObject({ created: false, count: 0, total: 3, valid: 2, invalid: 1 });
      expect(report.issues).toEqual([expect.objectContaining({ line: 3, errors: [expect.stringContaining('au moins 3 caractères')] })]);
      expect(report.accounts).toBeUndefined();
      expect(await prisma.user.count()).toBe(before);
      expect(await prisma.user.findUnique({ where: { username: 'tout.ok' } })).toBeNull();
    });

    it('signale chaque erreur à sa ligne, en français', async () => {
      const report = await importAccounts(
        excel([
          HEADER,
          'Bon.Nom;Bon Nom;;;;;', // 2 : valide (l'identifiant est mis en minuscules)
          'avec espace;Espace;;;;;', // 3
          'sans.nom;;;;;;', // 4
          'double.id;Premier;;;;;', // 5
          'DOUBLE.ID;Second;;;;;', // 6 : doublon du 5
          'superadmin;Déjà Pris;;;;;', // 7 : existe en base
          'role.faux;Rôle Faux;;patron;;;', // 8
          'role.super;Super;;Super administrateur;;;', // 9
          'groupe.faux;Groupe Faux;;;Inconnus;;', // 10
          'etage.faux;Étage Faux;;;;7e étage;', // 11
          'cat.fausse;Catégorie Fausse;;;;;Rien du tout', // 12
          `fonction.longue;Fonction Longue;${'x'.repeat(101)};;;;`, // 13
          'trop;De Colonnes;;;;;;;en trop', // 14
        ]),
        true,
      );
      expect(report.created).toBe(false);
      expect(errorsOf(report, 2)).toEqual([]);
      expect(errorsOf(report, 3).join(' ')).toMatch(/lettres sans accent/);
      expect(errorsOf(report, 4).join(' ')).toMatch(/nom est obligatoire/);
      expect(errorsOf(report, 5)).toEqual([]);
      expect(errorsOf(report, 6)).toEqual(['Identifiant en double dans le fichier (déjà ligne 5).']);
      expect(errorsOf(report, 7)).toEqual(['Cet identifiant est déjà utilisé.']);
      expect(errorsOf(report, 8)).toEqual(['Rôle inconnu : « patron ». Valeurs possibles : employé, admin.']);
      expect(errorsOf(report, 9).join(' ')).toMatch(/super administrateur ne peut pas être attribué par un import/);
      expect(errorsOf(report, 10)).toEqual(['Groupe inconnu : « Inconnus ».']);
      expect(errorsOf(report, 11)).toEqual(['Étage inconnu : « 7e étage ».']);
      expect(errorsOf(report, 12)).toEqual(['Catégorie inconnue : « Rien du tout ».']);
      expect(errorsOf(report, 13).join(' ')).toMatch(/fonction ne doit pas dépasser 100/);
      expect(errorsOf(report, 14).join(' ')).toMatch(/Trop de colonnes/);
      expect(report.invalid).toBe(11);
    });

    it('un super administrateur n’est jamais créé par import, même par une faute de frappe de rôle', async () => {
      for (const role of ['SUPER_ADMIN', 'super admin', 'Super Administrateur', 'superadmin']) {
        const report = await importAccounts(excel([HEADER, `sa.${role.length};Sa;;${role};;;`]), false);
        expect(report.created).toBe(false);
      }
      expect(await prisma.user.count({ where: { username: { startsWith: 'sa.' } } })).toBe(0);
    });

    it('reconnaît les noms sans tenir compte de la casse ni des accents', async () => {
      const report = await importAccounts(excel([HEADER, 'noms.souples;Noms Souples;;;enseignants|SURVEILLANTS;1ER ETAGE;photocopies']), false);
      expect(report.created).toBe(true);
      const user = await prisma.user.findUniqueOrThrow({ where: { username: 'noms.souples' }, include: { groupMemberships: true, recipientOf: true, floor: true } });
      expect(user.groupMemberships).toHaveLength(2);
      expect(user.recipientOf).toHaveLength(1);
      expect(user.floor?.name).toBe('1er étage');
    });

    it('relancer le même fichier est refusé : aucun doublon', async () => {
      const file = excel([HEADER, 'relance.un;Relance Un;;;;;', 'relance.deux;Relance Deux;;;;;']);
      expect((await importAccounts(file, false)).created).toBe(true);
      const again = await importAccounts(file, false);
      expect(again).toMatchObject({ created: false, invalid: 2 });
      expect(errorsOf(again, 2)).toEqual(['Cet identifiant est déjà utilisé.']);
      expect(await prisma.user.count({ where: { username: { startsWith: 'relance.' } } })).toBe(2);
    });

    it.each([
      ['virgule', 'identifiant,nom_affiche\nvirgule.un,"Un, Virgule"\n'],
      ['tabulation', 'identifiant\tnom_affiche\ntab.un\tUn Tab\n'],
      ['titres avec accents et majuscules', 'Identifiant;Nom affiché;Fonction;Rôle;Étage\ntitres.un;Un Titres;Prof;Employé;\n'],
      ['colonne vide en fin de ligne (Excel)', 'identifiant;nom_affiche;\nvide.un;Un Vide;\n'],
    ])('lit aussi : %s', async (_label, csv) => {
      const report = await importAccounts(csv, true);
      expect(report).toMatchObject({ created: false, valid: 1, invalid: 0, fileErrors: [] });
    });

    describe('fichier refusé en entier', () => {
      it.each([
        ['colonne inconnue', `${HEADER};telephone\nx.un;X;;;;;;0600`, /Colonne inconnue : « telephone »/],
        ['colonne obligatoire absente', 'identifiant;fonction\nx.deux;Prof', /Colonne obligatoire absente : « nom_affiche »/],
        ['colonne en double', 'identifiant;nom_affiche;nom\nx.trois;X;Y', /apparaît deux fois/],
        ['fichier vide', '', /vide/i],
        ['titres seuls', 'identifiant;nom_affiche\n', /aucune ligne de données/],
        ['guillemet jamais refermé', 'identifiant;nom_affiche\nx.quatre;"X\n', /jamais refermé/],
        ['colonne sans titre mais remplie', 'identifiant;nom_affiche;\nx.cinq;X;secret', /n’a pas de titre/],
      ])('%s', async (_label, csv, message) => {
        const before = await prisma.user.count();
        const report = await importAccounts(csv, false);
        expect(report.created).toBe(false);
        expect(report.fileErrors.join(' ')).toMatch(message);
        expect(await prisma.user.count()).toBe(before);
      });

      it('plus de 500 comptes à la fois', async () => {
        const lines = [HEADER, ...Array.from({ length: 501 }, (_, i) => `gros.${i};Gros ${i};;;;;`)];
        const report = await importAccounts(excel(lines), false);
        expect(report.fileErrors.join(' ')).toMatch(/limité à 500 lignes/);
        expect(await prisma.user.count({ where: { username: { startsWith: 'gros.' } } })).toBe(0);
      });
    });

    it('importe 150 comptes d’un coup en quelques secondes', async () => {
      const lines = [HEADER, ...Array.from({ length: 150 }, (_, i) => `masse.${i};Masse ${i};Prof;;Enseignants;;`)];
      const started = Date.now();
      const report = await importAccounts(excel(lines), false);
      expect(report).toMatchObject({ created: true, count: 150 });
      expect(Date.now() - started).toBeLessThan(60_000);
      expect(await prisma.user.count({ where: { username: { startsWith: 'masse.' } } })).toBe(150);
      expect(new Set(report.accounts!.map((a) => a.temporaryPassword)).size).toBe(150);
    });

    it.each(['admin', 'surveillant', 'enseignante'])('%s ne peut pas importer', async (who) => {
      const before = await prisma.user.count();
      const res = await post(who, '/api/admin/users/import', { csv: excel([HEADER, 'interdit.un;Interdit;;;;;']), dryRun: false });
      expect(res.status).toBe(403);
      expect(await prisma.user.count()).toBe(before);
    });

    it('non authentifié : refusé', async () => {
      const res = await api().post('/api/admin/users/import').set('Origin', TEST_ORIGIN).send({ csv: HEADER, dryRun: true });
      expect(res.status).toBe(401);
    });

    it.each([
      ['dryRun absent', { csv: 'identifiant;nom_affiche\nx;X' }],
      ['dryRun non booléen', { csv: 'identifiant;nom_affiche\nx;X', dryRun: 'oui' }],
      ['csv absent', { dryRun: true }],
      ['champ inconnu', { csv: 'identifiant;nom_affiche\nx;X', dryRun: true, role: 'SUPER_ADMIN' }],
    ])('requête mal formée : %s', async (_label, body) => {
      expect((await post('superadmin', '/api/admin/users/import', body)).status).toBe(400);
    });
  });

  describe('élèves', () => {
    const HEADER = 'prenom;nom;classe;telephone_parent;restauration';
    let violet: string;

    beforeAll(async () => {
      const floor = await prisma.floor.findFirstOrThrow();
      const level = await prisma.gradeLevel.create({ data: { name: 'CP import', cycle: 'PRIMARY', position: 700 } });
      await prisma.schoolClass.create({ data: { name: 'CP Violet', floorId: floor.id, levelId: level.id } });
      await prisma.schoolClass.create({ data: { name: 'CP Bleu', floorId: floor.id, levelId: level.id } });
      await prisma.schoolClass.create({ data: { name: 'Salle sans niveau', floorId: floor.id } });
      await prisma.schoolClass.create({ data: { name: 'CP Fermée', floorId: floor.id, levelId: level.id, active: false } });
      violet = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: 'CP Violet' } })).id;
    });

    it('l’aperçu ne crée rien', async () => {
      const before = await prisma.student.count();
      const report = await importStudents(excel([HEADER, 'Amine;Ben Salah;CP Violet;+216 20 123 456;cantine']), true);
      expect(report).toMatchObject({ created: false, total: 1, valid: 1, invalid: 0 });
      expect(report.preview[0]).toMatchObject({ label: 'Amine Ben Salah', detail: 'CP Violet · cantine' });
      expect(await prisma.student.count()).toBe(before);
    });

    it('crée les élèves, normalise téléphone et noms, relie la classe et journalise sans données personnelles', async () => {
      const report = await importStudents(
        excel([
          HEADER,
          '  Lina ; Hammami ;cp violet;06   12  34 56 78;Panier', // espaces, casse de la classe, téléphone espacé
          'Yassine;Zribi;CP BLEU;+216 98 765 432;Cantine',
        ]),
        false,
      );
      expect(report).toMatchObject({ created: true, count: 2 });
      const lina = await prisma.student.findFirstOrThrow({ where: { firstName: 'Lina' }, include: { class: true } });
      expect(lina).toMatchObject({ lastName: 'Hammami', parentPhone: '06 12 34 56 78', mealService: 'PANIER', active: true, classId: violet });
      expect(lina.class.name).toBe('CP Violet');

      const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'STUDENT_CHANGED', targetId: lina.id } });
      expect(entry.details).toMatchObject({ action: 'create', classId: violet, source: 'import' });
      // Le journal ne garde aucune donnée personnelle d'élève.
      expect(JSON.stringify(entry.details)).not.toMatch(/Lina|Hammami|06 12/);

      const list = (await request(app.getHttpServer()).get('/api/admin/students').set('Cookie', cookies.superadmin)).body as Array<{ firstName: string; class: { level: { name: string } } }>;
      expect(list.find((s) => s.firstName === 'Lina')!.class.level.name).toBe('CP import');
    });

    it('signale chaque erreur à sa ligne, en français', async () => {
      const report = await importStudents(
        excel([
          HEADER,
          'Valide;Eleve;CP Violet;+216 20 000 001;cantine', // 2
          ';Sans;CP Violet;+216 20 000 002;cantine', // 3 : prénom vide
          'Classe;Inconnue;CM9;+216 20 000 003;cantine', // 4
          'Classe;SansNiveau;Salle sans niveau;+216 20 000 004;cantine', // 5
          'Classe;Fermee;CP Fermée;+216 20 000 005;cantine', // 6
          'Tel;Faux;CP Violet;abc;cantine', // 7
          'Repas;Absent;CP Violet;+216 20 000 006;', // 8
          'Repas;Inconnu;CP Violet;+216 20 000 007;buffet', // 9
          'Double;Eleve;CP Bleu;+216 20 000 008;cantine', // 10
          'DOUBLE;eleve;cp bleu;+216 20 000 009;panier', // 11 : même élève, même classe
          'Autre;Classe;CP Violet;+216 20 000 010;cantine;en trop', // 12
        ]),
        true,
      );
      expect(report.created).toBe(false);
      expect(errorsOf(report, 2)).toEqual([]);
      expect(errorsOf(report, 3).join(' ')).toMatch(/prénom est obligatoire/);
      expect(errorsOf(report, 4)).toEqual(['Classe inconnue : « CM9 ».']);
      expect(errorsOf(report, 5).join(' ')).toMatch(/n’a pas de niveau scolaire/);
      expect(errorsOf(report, 6)).toEqual(['La classe « CP Fermée » est désactivée.']);
      expect(errorsOf(report, 7).join(' ')).toMatch(/Numéro invalide/);
      expect(errorsOf(report, 8)).toEqual(['Le service de restauration est obligatoire : cantine ou panier.']);
      expect(errorsOf(report, 9)).toEqual(['Service de restauration inconnu : « buffet ». Valeurs possibles : cantine, panier.']);
      expect(errorsOf(report, 10)).toEqual([]);
      expect(errorsOf(report, 11)).toEqual(['Élève en double dans le fichier (déjà ligne 10).']);
      expect(errorsOf(report, 12).join(' ')).toMatch(/Trop de colonnes/);
    });

    it('tout ou rien : une ligne en erreur et aucun élève n’est créé', async () => {
      const before = await prisma.student.count();
      const report = await importStudents(excel([HEADER, 'Bon;Un;CP Violet;+216 20 111 111;cantine', 'Mauvais;Deux;Nulle part;+216 20 111 112;cantine']), false);
      expect(report).toMatchObject({ created: false, valid: 1, invalid: 1 });
      expect(await prisma.student.count()).toBe(before);
    });

    it('relancer le même fichier est refusé : les élèves déjà inscrits ne sont pas dupliqués', async () => {
      const file = excel([HEADER, 'Relance;Premier;CP Violet;+216 20 222 221;cantine', 'Relance;Second;CP Violet;+216 20 222 222;panier']);
      expect((await importStudents(file, false)).created).toBe(true);
      const again = await importStudents(file, false);
      expect(again).toMatchObject({ created: false, invalid: 2 });
      expect(errorsOf(again, 2)).toEqual(['Cet élève est déjà inscrit dans cette classe.']);
      expect(await prisma.student.count({ where: { firstName: 'Relance' } })).toBe(2);
    });

    it('un même nom dans deux classes différentes est permis', async () => {
      const report = await importStudents(excel([HEADER, 'Homonyme;Eleve;CP Violet;+216 20 333 331;cantine', 'Homonyme;Eleve;CP Bleu;+216 20 333 332;cantine']), false);
      expect(report).toMatchObject({ created: true, count: 2 });
    });

    it('reconnaît les variantes de titres de colonnes', async () => {
      const report = await importStudents('Prénom;Nom;Classe;Téléphone du parent;Service de restauration\nTitres;Souples;CP Violet;+216 20 444 441;Panier\n', false);
      expect(report).toMatchObject({ created: true, count: 1 });
    });

    it('colonne inconnue : le fichier est refusé en entier', async () => {
      const report = await importStudents(`${HEADER};allergies\nA;B;CP Violet;+216 20 555 551;cantine;noix`, false);
      expect(report.fileErrors.join(' ')).toMatch(/Colonne inconnue : « allergies »/);
      expect(report.created).toBe(false);
    });

    it('accepte un fichier de 2000 élèves (plus de 100 ko) grâce à la limite relevée sur cette route seule', async () => {
      const lines = [HEADER, ...Array.from({ length: 2000 }, (_, i) => `Prenom${i};NomDeFamille${i};CP Bleu;+216 20 ${String(100000 + i).slice(0, 3)} ${String(100000 + i).slice(3)};cantine`)];
      const csv = excel(lines);
      expect(csv.length).toBeGreaterThan(100 * 1024);
      const report = await importStudents(csv, true);
      expect(report).toMatchObject({ created: false, total: 2000, valid: 2000, invalid: 0 });
    });

    it('plus de 2000 élèves : fichier refusé', async () => {
      const lines = [HEADER, ...Array.from({ length: 2001 }, (_, i) => `P${i};N${i};CP Bleu;+216 20 ${String(100000 + i).slice(0, 3)} ${String(100000 + i).slice(3)};cantine`)];
      const report = await importStudents(excel(lines), true);
      expect(report.fileErrors.join(' ')).toMatch(/limité à 2000 lignes/);
    });

    it('un corps de plus de 1 Mo est refusé', async () => {
      const res = await post('superadmin', '/api/admin/students/import', { csv: 'x'.repeat(1_200_000), dryRun: true });
      expect([400, 413]).toContain(res.status);
    });

    it('un JSON illisible est une erreur 400 claire, pas une erreur interne', async () => {
      const res = await api().post('/api/admin/students/import').set('Cookie', cookies.superadmin).set('Origin', TEST_ORIGIN).set('Content-Type', 'application/json').send('{"csv": ');
      expect(res.status).toBe(400);
      expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
    });

    it('les autres routes gardent leur limite de 100 ko', async () => {
      const res = await post('superadmin', '/api/admin/users', { username: 'x'.repeat(200_000), displayName: 'X', role: 'EMPLOYEE' });
      expect(res.status).toBe(413);
    });

    it.each(['admin', 'surveillant', 'enseignante'])('%s ne peut pas importer', async (who) => {
      const before = await prisma.student.count();
      const res = await post(who, '/api/admin/students/import', { csv: excel([HEADER, 'Interdit;Eleve;CP Violet;+216 20 666 661;cantine']), dryRun: false });
      expect(res.status).toBe(403);
      expect(await prisma.student.count()).toBe(before);
    });
  });
});
