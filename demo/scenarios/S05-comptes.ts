import type { Scenario } from '../lib/demo';

/** S05 — Comptes : création, rattachement aux catégories, réinitialisation, désactivation. */
export const S05: Scenario = {
  id: 'S05',
  slug: 'comptes',
  title: 'Comptes',
  async play(demo) {
    const { page } = demo;
    const name = 'Camille Essai (fictif)';
    await demo.login('superadmin', 'Administrateur › Comptes.');
    await demo.nav('Administrateur');
    await demo.adminTab('Comptes');

    demo.say('Création d’un compte de test.');
    await demo.click(demo.button('Nouveau compte'));
    const dialog = page.getByRole('dialog', { name: 'Nouveau compte' });
    await demo.type(dialog.getByLabel(/Identifiant/), 'camille.essai');
    await demo.type(dialog.getByLabel(/Nom affiché/), name);
    await demo.type(dialog.getByLabel(/Fonction/), 'Surveillance');
    demo.say('Rattachement à une catégorie : destinataire des demandes.');
    await demo.pickOptions(dialog, 'Destinataire des catégories', ['Photocopies']);
    await demo.click(dialog.getByRole('button', { name: 'Créer le compte' }));

    demo.say('Le mot de passe provisoire n’est affiché qu’une fois.');
    const temporary = page.getByRole('dialog', { name: 'Mot de passe provisoire' });
    await temporary.waitFor();
    await demo.pause(2500);
    await demo.click(temporary.getByRole('button', { name: 'J’ai noté le mot de passe' }));
    await demo.pause();

    demo.say('Le compte apparaît : « Mot de passe à changer ».');
    await demo.hover(page.getByRole('listitem').filter({ hasText: name }));
    await demo.pause(2000);

    demo.say('Réinitialisation du mot de passe.');
    await demo.click(page.getByRole('button', { name: `Réinitialiser le mot de passe de ${name}` }));
    await demo.click(page.getByRole('dialog').getByRole('button', { name: 'Réinitialiser' }));
    await temporary.waitFor();
    await demo.pause(2000);
    await demo.click(temporary.getByRole('button', { name: 'J’ai noté le mot de passe' }));
    await demo.pause();

    demo.say('Désactivation : le compte ne peut plus se connecter.');
    await demo.click(page.getByRole('button', { name: `Désactiver le compte de ${name}` }));
    await demo.click(page.getByRole('dialog').getByRole('button', { name: 'Désactiver le compte' }));
    await page.getByRole('button', { name: `Réactiver le compte de ${name}` }).waitFor();
    await demo.hover(page.getByRole('listitem').filter({ hasText: name }));
    await demo.pause(2500);
  },
};
