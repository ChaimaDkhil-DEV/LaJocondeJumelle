import type { Scenario } from '../lib/demo';

/** S06 — Catégories : création de « Surveillance », visible aussitôt dans Nouvelle demande, désactivation. */
export const S06: Scenario = {
  id: 'S06',
  slug: 'categories',
  title: 'Catégories',
  async play(demo) {
    const { page } = demo;
    await demo.login('superadmin', 'Administrateur › Catégories.');
    await demo.nav('Administrateur');
    await demo.adminTab('Catégories');

    demo.say('Nouvelle catégorie « Surveillance », type « Demande de travail ».');
    await demo.click(demo.button('Nouvelle catégorie'));
    const dialog = page.getByRole('dialog', { name: 'Nouvelle catégorie' });
    await demo.type(dialog.getByLabel(/Nom de la catégorie/), 'Surveillance');
    demo.say('Mode de routage : via l’administration, avec approbation.');
    await demo.click(dialog.getByRole('radio', { name: /Via l’administration/ }));
    await demo.pause();
    await demo.pickOptions(dialog, 'Destinataires', [/^Surveillant$/]);
    await demo.pickOptions(dialog, 'Admins de la catégorie', [/^Admin — surveillante générale$/]);
    await demo.click(dialog.getByRole('button', { name: 'Enregistrer la catégorie' }));
    await dialog.waitFor({ state: 'hidden' });
    await demo.pause();

    demo.say('Elle apparaît aussitôt dans « Nouvelle demande ».');
    await demo.nav('Nouvelle demande');
    await demo.click(page.getByRole('combobox', { name: 'Catégorie' }));
    await page.getByRole('option', { name: 'Surveillance' }).waitFor();
    await demo.hover(page.getByRole('option', { name: 'Surveillance' }));
    await demo.pause(2500);
    await page.keyboard.press('Escape');

    demo.say('Désactivation de la catégorie.');
    await demo.nav('Administrateur');
    await demo.adminTab('Catégories');
    await demo.click(page.getByRole('button', { name: 'Modifier la catégorie Surveillance' }));
    const edit = page.getByRole('dialog');
    await demo.click(edit.getByLabel(/Catégorie active/));
    await demo.pause(800);
    await demo.click(edit.getByRole('button', { name: 'Enregistrer la catégorie' }));
    await edit.waitFor({ state: 'hidden' });
    await demo.pause();

    demo.say('Elle n’est plus proposée à la création des demandes.');
    await demo.nav('Nouvelle demande');
    await demo.click(page.getByRole('combobox', { name: 'Catégorie' }));
    await demo.pause(3000);
    await page.keyboard.press('Escape');
    await demo.pause(800);
  },
};
