import type { Scenario } from '../lib/demo';
import { act, createWorkRequest, elapse } from '../lib/seed';

/** S10 — Tableau de bord : cartes, alertes, filtre de période, graphiques, onglets. */
export const S10: Scenario = {
  id: 'S10',
  slug: 'tableau-de-bord',
  title: 'Tableau de bord',
  async prepare(ctx) {
    await createWorkRequest(ctx, 'enseignante', { title: 'Réparer le tableau de la salle 3', category: 'Petits travaux (démo photo)', priority: 'URGENT' });
    const late = await createWorkRequest(ctx, 'enseignante', { title: 'Sujets de sciences 5e', category: 'Photocopies' });
    await elapse(ctx, late, 'due');
    await createWorkRequest(ctx, 'enseignante', { title: 'Chauffage en panne, salle 9', category: 'Intervention technique (démo circuit B)' });
    for (const title of ['Livrets d’accueil', 'Carnets de liaison']) {
      const id = await createWorkRequest(ctx, 'enseignante', { title, category: 'Photocopies' });
      await act(ctx, 'reprographie', id, ['ACCEPT', 'START', 'COMPLETE']);
    }
    await createWorkRequest(ctx, 'admin', { title: 'Affiches du conseil d’école', category: 'Photocopies' });
  },
  async play(demo) {
    const { page } = demo;
    await demo.login('superadmin', 'Administrateur › Tableau de bord.');
    await demo.nav('Administrateur');
    await demo.adminTab('Tableau de bord');
    demo.say('À traiter maintenant : retards, urgences, demandes sans employé affecté.');
    await page.getByText('Demandes créées sur la période').waitFor();
    await demo.pause(3000);

    demo.say('Filtre de période : 7 derniers jours.');
    await demo.choose('Période', '7 derniers jours');
    await demo.pause();

    demo.say('Indicateurs et graphiques de la période.');
    await page.getByText('Répartition par état').scrollIntoViewIfNeeded();
    await demo.pause(3500);

    for (const [tab, caption] of [
      ['Délais', 'Délais moyens et respect des délais.'],
      ['Employés', 'Activité par employé.'],
      ['Activité', 'Dernières actions, sans contenu de message.'],
    ] as const) {
      demo.say(caption);
      await demo.click(page.getByRole('tab', { name: tab }));
      await demo.pause(3000);
    }
  },
};
