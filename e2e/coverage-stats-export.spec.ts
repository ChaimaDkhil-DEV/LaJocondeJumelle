import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { login } from './support/login';

/**
 * Spec 008 — export CSV des statistiques des affectations : téléchargement (T012) et entrée au
 * journal d'audit (T017). Parcours rejoué sur Chromium ; 320 px dans a11y-responsive (V18).
 */

const ONLY_CHROMIUM = 'Parcours rejoué sur Chromium ; 320 px dans a11y-responsive';
const TZ = 'Europe/Paris';

/** Date du jour de l'école, AAAA-MM-JJ (le format « en-CA » est déjà dans cet ordre). */
function schoolToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

test.describe('Export des statistiques des affectations (008)', () => {
  test('l’admin télécharge les statistiques affichées ; l’export est au journal d’audit', async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', ONLY_CHROMIUM);
    await login(page, 'admin');
    await page.goto('/gardes/statistiques');
    await expect(page.getByRole('heading', { name: 'Statistiques des affectations' })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Exporter en CSV' }).click(),
    ]);
    const today = schoolToday();
    expect(download.suggestedFilename()).toBe(
      `statistiques-affectations-enseignant-${today.slice(0, 7)}-01-au-${today}.csv`,
    );
    const text = await readFile(await download.path(), 'utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff); // BOM UTF-8 pour les tableurs
    const lines = text.slice(1).split('\r\n');
    expect(lines[0]).toBe(
      'Enseignant;Événements;Retards;Absences;Classes vides;Non pourvues;Annulées;Durée moyenne',
    );
    expect(lines.some((l) => l.startsWith('Total de la période;'))).toBe(true);
    expect(lines).toContain(`Au;${today}`);

    // T017 — le super administrateur retrouve l'export au journal d'audit (période, regroupement).
    const context = await browser.newContext();
    const superadmin = await context.newPage();
    try {
      await login(superadmin, 'superadmin');
      await superadmin.goto('/admin/journal');
      await superadmin.getByRole('combobox', { name: 'Action' }).click();
      await superadmin.getByRole('option', { name: 'Export des statistiques des affectations' }).click();
      const entry = superadmin
        .getByRole('list', { name: 'Entrées du journal' })
        .getByRole('listitem')
        .first();
      await expect(entry).toContainText('Export des statistiques des affectations');
      await expect(entry).toContainText(`to : ${today}`);
      await expect(entry).toContainText('groupBy : teacher');
    } finally {
      await context.close();
    }
  });
});
