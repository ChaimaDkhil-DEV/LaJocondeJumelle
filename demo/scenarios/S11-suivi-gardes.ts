import type { Scenario } from '../lib/demo';
import { coverageAction, createCoverage, createTeacherRequest } from '../lib/seed';

/** S11 — Suivi des affectations : chiffres clés, affectations en cours, surveillants, filtres. */
export const S11: Scenario = {
  id: 'S11',
  slug: 'suivi-gardes',
  title: 'Suivi des gardes',
  async prepare(ctx) {
    await createCoverage(ctx, { className: '1ère année Violet', assignee: 'surveillant' });
    // Signalement d'un enseignant, pas encore assigné : « En attente ».
    await createTeacherRequest(ctx, 'enseignante', { className: '2e année Bleu', minutes: 90, reason: 'Rendez-vous médical' });
    const cancelled = await createCoverage(ctx, { className: '2e année Bleu', assignee: 'surveillant2', startInMinutes: 120, minutes: 30 });
    await coverageAction(ctx, cancelled, 'CANCEL', { reason: 'Enseignant finalement présent.' });
  },
  async play(demo) {
    const { page } = demo;
    await demo.login('superadmin', 'Administrateur › Suivi des gardes.');
    await demo.nav('Administrateur');
    await demo.adminTab('Suivi des gardes');
    demo.say('Chiffres clés : en attente, assignées, en cours, retards, non pourvues…');
    await page.getByRole('heading', { name: 'Suivi des affectations' }).waitFor();
    await demo.pause(3000);
    demo.say('Affectations en cours et surveillant affecté.');
    await page.getByText('1ère année Violet').first().scrollIntoViewIfNeeded();
    await demo.hover(page.getByText('1ère année Violet').first());
    await demo.pause(3000);
    await demo.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await demo.pause(1500);
    demo.say('Filtre par surveillant : ses affectations.');
    await demo.choose('Surveillant', /^Surveillant$/);
    await demo.pause(3000);
    demo.say('Par surveillant : disponibilité, affectation en cours, statistiques.');
    await page.getByText(/Par surveillant/).first().scrollIntoViewIfNeeded();
    await demo.pause(3500);
    demo.say('Export CSV disponible pour les mêmes filtres.');
    await demo.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await demo.hover(demo.link('Exporter en CSV'));
    await demo.pause(3000);
  },
};
