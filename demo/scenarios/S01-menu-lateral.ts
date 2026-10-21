import type { Scenario } from '../lib/demo';

/** S01 — Tour du menu latéral, bloc profil, déconnexion. */
export const S01: Scenario = {
  id: 'S01',
  slug: 'menu-lateral',
  title: 'Menu latéral',
  async play(demo) {
    const { page } = demo;
    await demo.login('superadmin', 'Le super administrateur se connecte (compte fictif).');

    demo.say('Le menu latéral : notifications, demandes, gardes et administration.');
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    for (const label of ['Mes demandes', 'Nouvelle demande', 'Gardes', 'Administrateur']) {
      await demo.hover(nav.getByRole('link', { name: label }));
      await demo.pause(700);
    }

    demo.say('Mes demandes : reçues, envoyées, à valider et suivi.');
    await demo.nav('Mes demandes');
    await demo.pause();
    demo.say('Nouvelle demande : formulaire de création.');
    await demo.nav('Nouvelle demande');
    await demo.pause();
    demo.say('Gardes : remplacements dans les classes.');
    await demo.nav('Gardes');
    await demo.pause();
    demo.say('Administrateur : neuf onglets, réservés au super administrateur.');
    await demo.nav('Administrateur');
    const tabs = page.getByRole('navigation', { name: 'Sections de l’espace Administrateur' });
    for (const label of ['Tableau de bord', 'Suivi des gardes', 'Comptes', 'Catégories', 'Groupes', 'Étages', 'Classes', 'Réglages', 'Journal d’audit']) {
      await demo.hover(tabs.getByRole('link', { name: label }));
      await demo.pause(450);
    }

    demo.say('La cloche affiche les notifications.');
    await demo.click(demo.button(/^Notifications/));
    await demo.pause();
    await page.keyboard.press('Escape');
    await demo.pause(800);

    demo.say('Bloc profil : nom et rôle. Il n’existe pas de page de profil.');
    await demo.hover(page.getByText('Super administrateur', { exact: true }).last());
    await demo.pause();

    demo.say('Déconnexion : la session est fermée côté serveur.');
    await demo.logout();
    await demo.pause();
  },
};
