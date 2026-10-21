import type { Scenario } from '../lib/demo';
import { act, categoryId, createCoverage, createWorkRequest } from '../lib/seed';

/** S09 — Journal d'audit : retrouver des actions d'administration déjà faites (comptes, réglages, gardes, demandes). */
export const S09: Scenario = {
  id: 'S09',
  slug: 'journal-audit',
  title: 'Journal d’audit',
  async prepare(ctx) {
    const api = await ctx.as('superadmin');
    await api('/api/admin/users', {
      username: 'dominique.essai',
      displayName: 'Dominique Essai (fictif)',
      jobTitle: 'Accueil',
      role: 'EMPLOYEE',
      recipientCategoryIds: [await categoryId(ctx, 'Photocopies')],
    });
    await api('/api/admin/settings', { deadlineWarnPercent: 30 }, 'PUT');
    await createCoverage(ctx, { className: '1ère année Violet', assignee: 'surveillant' });
    // Annulation d'une demande de travail : action administrative, journalisée (REQUEST_MANAGED).
    // Photocopies a ici deux destinataires (compte de test créé ci-dessus) : destinataire explicite.
    const request = await createWorkRequest(ctx, 'enseignante', { title: 'Copies annulées', category: 'Photocopies', recipient: 'reprographie' });
    await act(ctx, 'enseignante', request, ['CANCEL']);
  },
  async play(demo) {
    await demo.login('superadmin', 'Administrateur › Journal d’audit.');
    await demo.nav('Administrateur');
    await demo.adminTab('Journal d’audit');
    demo.say('Consultation seule : rien ne peut y être modifié.');
    await demo.pause(2500);

    for (const [action, caption] of [
      ['Compte créé', 'Le compte de test créé par le super administrateur.'],
      ['Réglage modifié', 'Le réglage modifié, avec l’ancienne et la nouvelle valeur.'],
      ['Affectation créée', 'L’affectation directe d’un surveillant à une classe.'],
      ['Demande de travail gérée', 'L’annulation d’une demande de travail.'],
    ] as const) {
      demo.say(caption);
      await demo.choose('Action', action);
      await demo.pause(3000);
    }
    demo.say('Accepter, commencer, terminer : seulement dans l’historique de la demande.');
    await demo.pause(3500);
  },
};
