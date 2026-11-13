import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * Import CSV de comptes et d'élèves : le fichier est vérifié en entier avant toute création, un fichier en
 * erreur ne crée rien, et un compte importé s'ouvre bien avec le mot de passe provisoire du fichier
 * téléchargé (changement imposé à la première connexion). Rejouable : tout porte un marqueur unique.
 */
test.describe('Import CSV', () => {
  // Playwright impose un motif de déstructuration en premier argument, même sans fixture.
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Écrans d’administration (Chromium)');
    test.setTimeout(120_000);
  });

  test('importer des comptes puis des élèves ; un compte importé se connecte avec son mot de passe provisoire', async ({ page, browser }) => {
    const marker = Date.now();
    const alice = `imp.alice.${marker}`;
    const bob = `imp.bob.${marker}`;
    const className = `Classe import ${marker}`;
    const file = (name: string, content: string) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(content, 'utf-8') });
    const origin = () => ({ Origin: new URL(page.url()).origin });

    await login(page, 'superadmin');

    // --- Comptes : un fichier en erreur ne crée rien et dit à quelle ligne.
    await page.goto('/admin/comptes');
    await page.getByRole('button', { name: 'Importer un fichier' }).click();
    const accounts = page.getByRole('dialog', { name: 'Importer des comptes' });
    await expectNoA11yViolations(page);
    const badFile = `identifiant;nom_affiche;groupes\r\n${alice};Alice Import;Enseignants\r\nx;Trop Court;\r\n${bob};Bob Import;Groupe inexistant\r\n`;
    await accounts.getByLabel('Fichier CSV à importer').setInputFiles(file('comptes-erreurs.csv', badFile));
    await expect(accounts.getByText(/2 lignes à corriger sur 3/)).toBeVisible();
    const issues = accounts.getByRole('list', { name: 'Lignes à corriger' });
    await expect(issues).toContainText('Ligne 3');
    await expect(issues).toContainText('au moins 3 caractères');
    await expect(issues).toContainText('Ligne 4');
    await expect(issues).toContainText('Groupe inconnu : « Groupe inexistant »');
    await expect(accounts.getByRole('button', { name: /^Créer/ })).toHaveCount(0);
    await expectNoA11yViolations(page);

    // --- Fichier corrigé : aperçu, puis création.
    await accounts.getByRole('button', { name: 'Choisir un fichier corrigé' }).click();
    const goodFile = `identifiant;nom_affiche;fonction;role;groupes\r\n${alice};Alice Import;Professeur;employé;Enseignants\r\n${bob};Bob Import;Surveillant;employé;Surveillants\r\n`;
    await accounts.getByLabel('Fichier CSV à importer').setInputFiles(file('comptes.csv', goodFile));
    await expect(accounts.getByText('Le fichier est valide : 2 comptes à créer.')).toBeVisible();
    await expect(accounts.getByText(`Alice Import (${alice})`)).toBeVisible();
    // Rien n'est créé tant qu'on n'a pas confirmé.
    const before = await page.request.get('/api/admin/users?limit=200');
    expect(JSON.stringify(await before.json())).not.toContain(alice);
    await expectNoA11yViolations(page);
    await accounts.getByRole('button', { name: 'Créer 2 comptes' }).click();
    await expect(accounts.getByText('2 comptes créés.')).toBeVisible();

    // --- Mots de passe provisoires : téléchargés une fois, au format d'un tableur.
    await expectNoA11yViolations(page);
    const download = page.waitForEvent('download');
    await accounts.getByRole('button', { name: 'Télécharger les mots de passe provisoires' }).click();
    const passwords = readFileSync(await (await download).path(), 'utf-8');
    expect(passwords.startsWith(String.fromCharCode(0xfeff) + 'Identifiant;Nom;Mot de passe provisoire\r\n')).toBe(true);
    const row = passwords.split('\r\n').find((line) => line.startsWith(`${alice};`));
    const temporary = row!.split(';')[2];
    expect(temporary.length).toBeGreaterThanOrEqual(16);
    await accounts.getByRole('button', { name: 'Fermer' }).click();
    await expect(accounts).toBeHidden();

    // --- Le compte importé se connecte avec ce mot de passe et doit le changer aussitôt.
    const context = await browser.newContext();
    const other = await context.newPage();
    try {
      await other.goto('/connexion');
      await other.getByLabel('Identifiant').fill(alice);
      await other.getByLabel('Mot de passe', { exact: true }).fill(temporary);
      await other.getByRole('button', { name: 'Se connecter' }).click();
      await expect(other.getByRole('heading', { name: 'Changer votre mot de passe' })).toBeVisible();
    } finally {
      await context.close();
    }

    // --- Relancer le même fichier est refusé : aucun doublon.
    await page.getByRole('button', { name: 'Importer un fichier' }).click();
    const again = page.getByRole('dialog', { name: 'Importer des comptes' });
    await again.getByLabel('Fichier CSV à importer').setInputFiles(file('comptes.csv', goodFile));
    await expect(again.getByText(/2 lignes à corriger sur 2/)).toBeVisible();
    await expect(again.getByRole('list', { name: 'Lignes à corriger' })).toContainText('Cet identifiant est déjà utilisé.');
    await again.getByRole('button', { name: 'Annuler' }).click();

    // --- Élèves : prérequis (niveau et classe) créés par l'API, puis import par l'interface.
    const levels = (await (await page.request.get('/api/admin/levels')).json()) as Array<{ position: number }>;
    const level = await page.request.post('/api/admin/levels', {
      headers: origin(),
      data: { name: `Niveau import ${marker}`, cycle: 'PRIMARY', position: Math.max(0, ...levels.map((l) => l.position)) + 1 },
    });
    const levelId = ((await level.json()) as Array<{ id: string; name: string }>).find((l) => l.name === `Niveau import ${marker}`)!.id;
    const floors = (await (await page.request.get('/api/admin/floors')).json()) as Array<{ id: string }>;
    const cls = await page.request.post('/api/admin/coverage/classes', { headers: origin(), data: { name: className, floorId: floors[0].id, levelId } });
    expect(cls.ok()).toBeTruthy();

    await page.goto('/admin/eleves');
    await page.getByRole('button', { name: 'Importer un fichier' }).click();
    const students = page.getByRole('dialog', { name: 'Importer des élèves' });
    const lastName = `Eleve${marker}`;
    const csv = `prenom;nom;classe;telephone_parent\r\nAmine;${lastName};${className};+216 20 123 456\r\nLina;${lastName};${className.toUpperCase()};06 12 34 56 78\r\n`;
    await students.getByLabel('Fichier CSV à importer').setInputFiles(file('eleves.csv', csv));
    await expect(students.getByText('Le fichier est valide : 2 élèves à créer.')).toBeVisible();
    await expectNoA11yViolations(page);
    await students.getByRole('button', { name: 'Créer 2 élèves' }).click();
    await expect(students.getByText('2 élèves créés.')).toBeVisible();
    await students.getByRole('button', { name: 'Fermer' }).click();

    await page.getByPlaceholder('Rechercher un élève…').fill(lastName);
    const list = page.getByRole('list', { name: 'Élèves' }).getByRole('listitem').filter({ hasText: lastName });
    await expect(list).toHaveCount(2);
    await expect(list.first()).toContainText(className);
  });
});
