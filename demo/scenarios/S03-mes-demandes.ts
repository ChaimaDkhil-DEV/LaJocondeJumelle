import type { Scenario } from '../lib/demo';
import { act, createWorkRequest } from '../lib/seed';

/** S03 — Mes demandes : onglets, recherche, filtres, détail, priorité, annulation, lecture seule. */
export const S03: Scenario = {
  id: 'S03',
  slug: 'mes-demandes',
  title: 'Mes demandes',
  async prepare(ctx) {
    await createWorkRequest(ctx, 'superadmin', { title: 'Classeurs pour la salle des professeurs', category: 'Photocopies' });
    const done = await createWorkRequest(ctx, 'superadmin', { title: 'Badges pour les visiteurs', category: 'Photocopies' });
    await act(ctx, 'reprographie', done, ['ACCEPT', 'START', 'COMPLETE']);
    await createWorkRequest(ctx, 'enseignante', { title: 'Fiches d’exercices CM1', category: 'Photocopies' });
  },
  async play(demo) {
    const { page } = demo;
    await demo.login('superadmin', 'Mes demandes du super administrateur.');
    demo.say('« Reçues » : seulement les demandes qui lui sont affectées.');
    await demo.click(page.getByRole('tab', { name: 'Reçues' }));
    await demo.pause();
    demo.say('« Envoyées » : ses propres demandes.');
    await demo.click(page.getByRole('tab', { name: 'Envoyées' }));
    await demo.pause();
    demo.say('« Suivi » : toutes les demandes qu’il peut consulter.');
    await demo.click(page.getByRole('tab', { name: 'Suivi' }));
    await demo.pause();

    demo.say('Recherche dans les titres, puis filtres.');
    await demo.type(page.getByPlaceholder('Rechercher dans les titres…'), 'Classeurs');
    await demo.pause();
    await demo.click(demo.button(/^Filtres/));
    await demo.pause(2000);
    await page.keyboard.press('Escape');
    await demo.pause(800);

    demo.say('Détail : la référence de la demande n’est plus affichée.');
    await demo.click(page.getByRole('link', { name: /Classeurs pour la salle des professeurs/ }).first());
    await page.getByRole('heading', { level: 1, name: 'Classeurs pour la salle des professeurs' }).waitFor();
    await demo.pause(2000);

    demo.say('Changement de priorité.');
    await demo.click(demo.button('Changer la priorité'));
    const dialog = page.getByRole('dialog');
    await demo.click(dialog.getByRole('radio', { name: /Haute/ }));
    await demo.pause(800);
    await demo.click(dialog.getByRole('button', { name: 'Enregistrer la priorité' }));
    await dialog.waitFor({ state: 'hidden' });
    await demo.pause();

    demo.say('Annulation de sa demande, avant sa prise en charge.');
    await demo.click(demo.button('Annuler la demande'));
    await demo.click(page.getByRole('dialog').getByRole('button', { name: 'Oui, annuler la demande' }));
    await page.getByText('Demande annulée, consultation uniquement.').waitFor();
    await demo.pause(2000);

    demo.say('Demande terminée : lecture seule, sans alerte de délai.');
    await demo.nav('Mes demandes');
    await demo.click(page.getByRole('tab', { name: 'Envoyées' }));
    await demo.click(page.getByRole('link', { name: /Badges pour les visiteurs/ }).first());
    await page.getByText('Demande terminée, consultation uniquement.').waitFor();
    await demo.pause(3000);
  },
};
