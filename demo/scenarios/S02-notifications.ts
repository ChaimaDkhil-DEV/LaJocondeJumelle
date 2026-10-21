import type { Scenario } from '../lib/demo';
import { act, createWorkRequest, elapse, waitForSuperAdminAlerts } from '../lib/seed';

/** S02 — Notifications du super administrateur : seulement urgentes, sans employé affecté, en retard. */
export const S02: Scenario = {
  id: 'S02',
  slug: 'notifications',
  title: 'Notifications du super administrateur',
  async prepare(ctx) {
    // Urgente (délai de prise en charge de 15 min : pas de retard pendant la démo).
    await createWorkRequest(ctx, 'enseignante', { title: 'Réparer la porte de la salle 8', category: 'Petits travaux (démo photo)', priority: 'URGENT' });
    // Normale et terminée : aucune notification pour le super administrateur.
    await createWorkRequest(ctx, 'enseignante', { title: 'Affiches de la fête de l’école', category: 'Photocopies' });
    const done = await createWorkRequest(ctx, 'enseignante', { title: 'Fiches de lecture CE2', category: 'Photocopies' });
    await act(ctx, 'reprographie', done, ['ACCEPT', 'START', 'COMPLETE']);
    // Sans employé affecté (en attente de validation) et en retard : temps écoulé simulé.
    const unassigned = await createWorkRequest(ctx, 'enseignante', { title: 'Vidéoprojecteur en panne, salle 14', category: 'Intervention technique (démo circuit B)' });
    await elapse(ctx, unassigned, 'warn');
    const late = await createWorkRequest(ctx, 'enseignante', { title: 'Sujets d’histoire 4e', category: 'Photocopies' });
    await elapse(ctx, late, 'due');
    await waitForSuperAdminAlerts(ctx, ['URGENT', 'UNASSIGNED', 'OVERDUE']);
  },
  async play(demo) {
    const { page } = demo;
    await demo.login('superadmin', 'Le super administrateur se connecte.');
    demo.say('Trois alertes seulement : urgente, sans employé affecté, en retard.');
    await demo.click(demo.button(/^Notifications/));
    await demo.pause(2000);
    for (const [label, caption] of [
      [/Demande urgente/, 'Urgente : signalée dès sa création.'],
      [/Demande sans employé affecté/, 'Sans employé affecté : délai de prise en charge bientôt dépassé.'],
      [/Demande en retard/, 'En retard : l’échéance de prise en charge est dépassée.'],
    ] as const) {
      demo.say(caption);
      await demo.hover(page.getByText(label).first());
      await demo.pause(2800);
    }
    demo.say('Rien pour la demande normale ni pour la demande terminée.');
    await demo.pause(3000);
    demo.say('Un clic sur une notification ouvre la demande.');
    await demo.click(page.getByText(/Demande en retard/).first());
    await page.getByRole('heading', { level: 1, name: 'Sujets d’histoire 4e' }).waitFor();
    await demo.pause(2000);
    demo.say('Le retard est signalé sur la demande et dans son historique.');
    await demo.hover(page.getByText(/En retard/).first());
    await demo.pause(4500);
  },
};
