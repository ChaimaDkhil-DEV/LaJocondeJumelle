import { expect, test } from '@playwright/test';
import { login } from './support/login';

/** Priorité : passer une demande en Urgente recalcule son échéance, visible à l'écran. */

test.describe('Priorité et échéance', () => {
  // Playwright impose un motif de déstructuration en premier argument, même sans fixture.
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(!['chromium', 'mobile-320'].includes(testInfo.project.name), 'Parcours d’administration (Chromium, petit écran)');
    test.setTimeout(120_000);
  });

  test('passer une demande en Urgente raccourcit son échéance à l’écran', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Logique serveur : un navigateur suffit');
    await login(page, 'enseignante');
    const headers = { Origin: new URL(page.url()).origin };
    const categories = (await (await page.request.get('/api/categories')).json()) as Array<{ id: string; name: string }>;
    const category = categories.find((c) => c.name === 'Photocopies')!;
    const recipients = (await (await page.request.get(`/api/categories/${category.id}/recipients`)).json()) as Array<{ id: string }>;
    const created = await page.request.post('/api/requests', {
      headers,
      data: { clientId: crypto.randomUUID(), title: `Priorité ${Date.now()}`, description: 'x', categoryId: category.id, recipientId: recipients[0].id, priority: 'NORMAL' },
    });
    expect(created.status()).toBe(201);
    const { id, currentDueAt } = (await created.json()) as { id: string; currentDueAt: string };

    await page.goto(`/demandes/${id}`);
    await expect(page.getByText(/^Reste .* pour la prise en charge$/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('1-avant-priorite.png'), fullPage: true });

    await page.getByRole('button', { name: 'Changer la priorité' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Changer la priorité' });
    await dialog.getByRole('radio', { name: 'Urgente' }).check();
    await dialog.getByRole('button', { name: 'Enregistrer la priorité' }).click();
    await expect(dialog).toBeHidden();

    // Règle du seed « Photocopies » en Urgente : prise en charge en 1 min depuis l'envoi.
    await expect(page.getByText(/^(Reste|Bientôt en retard : reste) (\d+ s|1 min \d+ s) pour la prise en charge$/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('2-apres-priorite.png'), fullPage: true });
    const detail = (await (await page.request.get(`/api/requests/${id}`)).json()) as { currentDueAt: string };
    expect(Date.parse(detail.currentDueAt)).toBeLessThan(Date.parse(currentDueAt));
  });
});
