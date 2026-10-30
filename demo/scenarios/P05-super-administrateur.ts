import type { Scenario } from '../lib/demo';
import { act, categoryId, createWorkRequest, elapse, userId, waitForSuperAdminAlerts } from '../lib/seed';

const URGENT = 'Fuite d’eau dans les sanitaires du 1er étage';
const UNASSIGNED = 'Radiateur froid en salle 9';
const LATE = 'Sujets d’histoire pour vendredi';
const TO_REASSIGN = 'Porte de la salle 3 qui ne ferme plus';

/**
 * P05 — Le super administrateur supervise : alertes ciblées (urgente, sans employé affecté, en
 * retard), tableau de bord, réaffectation d'une demande, journal d'audit.
 */
export const P05: Scenario = {
  id: 'P05',
  slug: 'super-administrateur',
  title: 'La supervision du super administrateur',
  async prepare(ctx) {
    const circuitB = 'Intervention technique (démo circuit B)';
    // Un second employé affectable dans le circuit B, pour la réaffectation.
    const superadmin = await ctx.as('superadmin');
    await superadmin(`/api/admin/categories/${await categoryId(ctx, circuitB)}/recipients`, { userIds: [await userId(ctx, 'reprographie'), await userId(ctx, 'autre')] }, 'PUT');

    await createWorkRequest(ctx, 'enseignante', { title: URGENT, category: 'Petits travaux (démo photo)', priority: 'URGENT', description: 'L’eau coule sous la porte.' });
    const unassigned = await createWorkRequest(ctx, 'enseignante', { title: UNASSIGNED, category: circuitB });
    await elapse(ctx, unassigned, 'warn');
    const late = await createWorkRequest(ctx, 'enseignante', { title: LATE, category: 'Photocopies', recipient: 'reprographie' });
    await elapse(ctx, late, 'due');
    const reassign = await createWorkRequest(ctx, 'enseignante', { title: TO_REASSIGN, category: circuitB });
    await act(ctx, 'admin', reassign, ['APPROVE'], { assigneeId: await userId(ctx, 'reprographie') });
    await act(ctx, 'reprographie', reassign, ['ACCEPT']);
    await waitForSuperAdminAlerts(ctx, ['URGENT', 'UNASSIGNED', 'OVERDUE']);
  },
  async play(demo) {
    const { page } = demo;
    await demo.login('superadmin', 'Le super administrateur supervise toute l’activité.');
    demo.say('Il ne reçoit que l’essentiel : urgentes, sans employé affecté, en retard.');
    await demo.click(demo.button(/^Notifications/));
    await demo.pause(4000);
    await demo.click(page.getByText(/Demande en retard/).first());
    await page.getByRole('heading', { level: 1, name: LATE }).waitFor();
    demo.say('Une alerte ouvre directement la demande concernée.');
    await demo.pause(3000);

    await demo.nav('Tableau de bord');
    demo.say('Tableau de bord : indicateurs calculés sur les vraies demandes.');
    await page.getByRole('heading', { name: 'Tableau de bord' }).waitFor();
    await demo.pause(3500);
    await demo.click(page.getByRole('tab', { name: 'Demandes' }));
    demo.say('Toutes les demandes de la période, avec leur statut et leur employé.');
    await demo.pause(3500);
    await demo.click(page.getByRole('tab', { name: 'Activité' }));
    demo.say('Le fil d’activité : qui a fait quoi, et quand.');
    await demo.pause(3500);

    demo.say('Il peut réaffecter une demande du circuit validé par l’administration.');
    await demo.click(page.getByRole('tab', { name: 'Demandes' }));
    await demo.click(page.getByRole('table', { name: 'Demandes de la période' }).getByRole('link', { name: TO_REASSIGN }));
    await page.getByRole('heading', { level: 1, name: TO_REASSIGN }).waitFor();
    await demo.pause(1500);
    await demo.click(demo.button('Réaffecter'));
    const dialog = page.getByRole('dialog', { name: 'Réaffecter la demande' });
    await demo.click(dialog.getByRole('combobox', { name: 'Nouvel employé' }));
    await demo.pause(700);
    await demo.click(page.getByRole('option', { name: /^Autre employé/ }));
    await demo.pause(800);
    await demo.click(dialog.getByRole('button', { name: 'Réaffecter' }));
    await page.getByText('Envoyée', { exact: true }).first().waitFor();
    demo.say('Le nouvel employé est prévenu ; l’ancien n’y a plus accès.');
    await demo.pause(3000);

    await demo.nav('Administrateur');
    await demo.adminTab('Journal d’audit');
    demo.say('Les actions administratives sont tracées dans le journal d’audit.');
    await demo.choose('Action', 'Demande de travail gérée');
    await demo.pause(4500);
  },
};
