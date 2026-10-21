import type { Scenario } from '../lib/demo';

/** S08 — Réglages et délais : seuil d'alerte et délai de prise en charge, effet visible. */
export const S08: Scenario = {
  id: 'S08',
  slug: 'reglages',
  title: 'Réglages et délais',
  async play(demo) {
    const { page } = demo;
    await demo.login('superadmin', 'Administrateur › Réglages.');
    await demo.nav('Administrateur');
    await demo.adminTab('Réglages');

    demo.say('Alerte d’échéance proche : 20 % devient 50 % du délai.');
    const warn = page.getByLabel('Alerte d’échéance proche (% du délai restant)');
    await demo.click(warn);
    await warn.fill('');
    await warn.pressSequentially('50', { delay: 120 });
    await demo.pause(800);
    await demo.click(demo.button('Enregistrer les réglages'));
    await demo.pause();

    demo.say('Délai de prise en charge « Photocopies », priorité normale : 1 min.');
    await demo.adminTab('Catégories');
    await demo.click(page.getByRole('button', { name: 'Délais de Photocopies' }));
    const dialog = page.getByRole('dialog', { name: 'Délais : Photocopies' });
    const normal = dialog.getByRole('group', { name: 'Normale' });
    const takeover = normal.getByLabel(/Prise en charge/);
    await demo.click(takeover);
    await takeover.fill('');
    await takeover.pressSequentially('1', { delay: 120 });
    await demo.pause(800);
    await demo.click(dialog.getByRole('button', { name: 'Enregistrer les délais' }));
    await dialog.waitFor({ state: 'hidden' });
    await demo.pause();

    demo.say('Effet : une nouvelle demande affiche le délai d’une minute.');
    await demo.nav('Nouvelle demande');
    await demo.choose('Catégorie', 'Photocopies');
    await demo.click(page.getByRole('radio', { name: 'Normale' }));
    await demo.type(page.getByLabel('Titre'), 'Plan d’évacuation à afficher');
    await demo.type(page.getByLabel('Description (facultative)'), '10 exemplaires A3.');
    await demo.click(demo.button('Envoyer la demande'));
    await page.getByRole('heading', { level: 1, name: 'Plan d’évacuation à afficher' }).waitFor();
    await demo.pause(3000);
    demo.say('À mi-délai, l’alerte « Bientôt en retard » apparaît.');
    await page.getByText(/Bientôt en retard/).waitFor({ timeout: 45_000 });
    await demo.pause(3500);
  },
};
