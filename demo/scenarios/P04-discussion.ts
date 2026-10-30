import type { Scenario } from '../lib/demo';
import { openRequest, peekNotifications, recordVoice } from '../lib/journey';
import { act, createWorkRequest } from '../lib/seed';

const TITLE = 'Livrets d’évaluation des 2e primaire';

/** P04 — Discussion sur une demande en cours : message écrit, réponse vocale, notifications. */
export const P04: Scenario = {
  id: 'P04',
  slug: 'discussion',
  title: 'Discussion écrite et vocale sur une demande',
  async prepare(ctx) {
    const id = await createWorkRequest(ctx, 'enseignante', { title: TITLE, category: 'Photocopies', recipient: 'reprographie', description: '56 livrets, agrafés.' });
    await act(ctx, 'reprographie', id, ['ACCEPT']);
  },
  async play(demo) {
    const { page } = demo;
    await demo.login('enseignante', 'Une question sur une demande déjà acceptée ?');
    await openRequest(demo, TITLE, 'Envoyées');
    demo.say('L’enseignante écrit dans la discussion de la demande.');
    await demo.type(page.getByLabel('Votre message'), 'Pouvez-vous ajouter une page de garde en couleur ?');
    await demo.pause(600);
    await demo.click(demo.button('Envoyer le message'));
    await page.getByText('Pouvez-vous ajouter une page de garde en couleur ?').first().waitFor();
    await demo.pause(2000);
    await demo.logout();

    await demo.login('reprographie', 'L’employé est prévenu du nouveau message.');
    await peekNotifications(demo);
    await openRequest(demo, TITLE, 'Reçues');
    demo.say('Il répond par un message vocal.');
    await recordVoice(demo, 3);
    await demo.click(demo.button('Envoyer le message'));
    await page.getByRole('button', { name: 'Lire le message vocal' }).last().waitFor();
    await demo.pause(2000);
    await demo.logout();

    await demo.login('enseignante', 'L’enseignante écoute la réponse.');
    await peekNotifications(demo);
    await openRequest(demo, TITLE, 'Envoyées');
    await demo.click(page.getByRole('button', { name: 'Lire le message vocal' }).last());
    demo.say('Toute la discussion reste attachée à la demande.');
    await demo.pause(4000);
  },
};
