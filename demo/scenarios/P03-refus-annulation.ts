import type { Scenario } from '../lib/demo';
import { actWithReason, openRequest } from '../lib/journey';
import { createWorkRequest } from '../lib/seed';

const REFUSED_BY_ADMIN = 'Changer les néons du couloir';
const DECLINED = 'Affiches du marché d’automne en A2';
const CANCELLED = 'Copies du contrôle de grammaire';

/** P03 — Les trois façons dont une demande s'arrête sans être réalisée : refus motivés et annulation. */
export const P03: Scenario = {
  id: 'P03',
  slug: 'refus-annulation',
  title: 'Refus motivés et annulation',
  async prepare(ctx) {
    await createWorkRequest(ctx, 'enseignante', { title: REFUSED_BY_ADMIN, category: 'Intervention technique (démo circuit B)', description: 'Deux néons grésillent.' });
    await createWorkRequest(ctx, 'enseignante', { title: DECLINED, category: 'Photocopies', recipient: 'reprographie', description: '30 affiches couleur.' });
    await createWorkRequest(ctx, 'enseignante', { title: CANCELLED, category: 'Photocopies', recipient: 'reprographie', description: '28 exemplaires.' });
  },
  async play(demo) {
    const { page } = demo;
    await demo.login('admin', 'La surveillante générale peut refuser une demande à valider.');
    await openRequest(demo, REFUSED_BY_ADMIN, 'À valider');
    demo.say('Le motif est obligatoire.');
    await actWithReason(demo, 'Refuser', 'Refuser la demande', 'Motif du refus', 'Les néons du couloir sont remplacés par la mairie lundi.', 'Confirmer le refus', 'Refusée');
    await demo.logout();

    await demo.login('reprographie', 'L’employé peut aussi refuser une demande reçue.');
    await openRequest(demo, DECLINED, 'Reçues');
    await actWithReason(demo, 'Refuser', 'Refuser la demande', 'Motif du refus', 'Pas de papier A2 en stock avant le 15 novembre.', 'Confirmer le refus', 'Refusée');
    await demo.logout();

    await demo.login('enseignante', 'L’enseignante voit ses deux demandes refusées, avec le motif.');
    await openRequest(demo, REFUSED_BY_ADMIN, 'Envoyées');
    await demo.hover(page.getByText(/remplacés par la mairie/).first());
    await demo.pause(3000);
    await openRequest(demo, DECLINED, 'Envoyées');
    await demo.hover(page.getByText(/Pas de papier A2/).first());
    await demo.pause(3000);

    demo.say('Elle peut annuler une demande qui n’a pas encore été acceptée.');
    await openRequest(demo, CANCELLED, 'Envoyées');
    await demo.click(demo.button('Annuler la demande'));
    const dialog = page.getByRole('dialog', { name: 'Annuler cette demande ?' });
    await demo.pause(1500);
    await demo.click(dialog.getByRole('button', { name: 'Oui, annuler la demande' }));
    await page.getByText('Annulée', { exact: true }).first().waitFor();
    demo.say('Le destinataire en est informé ; la demande reste consultable.');
    await demo.pause(3500);
  },
};
