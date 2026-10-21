import type { Scenario } from '../lib/demo';
import { createCoverage } from '../lib/seed';

/** S13 — Vue du surveillant affecté, sur mobile : notification reçue, affectation visible dans Gardes. */
export const S13: Scenario = {
  id: 'S13',
  slug: 'vue-surveillant',
  title: 'Vue du surveillant (mobile)',
  viewport: 'mobile',
  async prepare(ctx) {
    await createCoverage(ctx, { className: '1ère année Violet', assignee: 'surveillant' });
  },
  async play(demo) {
    const { page } = demo;
    await demo.login('surveillant', 'Le surveillant se connecte sur son téléphone.');
    demo.say('Notification : une affectation lui est assignée.');
    await demo.click(demo.button(/^Notifications/));
    await demo.pause(3500);
    await page.keyboard.press('Escape');
    await demo.pause(800);

    demo.say('Gardes › Mes affectations : classe, horaire et prochaines étapes.');
    await demo.nav('Gardes');
    await demo.click(page.getByRole('tab', { name: 'Mes affectations' }));
    await page.getByRole('article').filter({ hasText: '1ère année Violet' }).first().waitFor();
    await demo.pause(3500);
    demo.say('Il peut signaler son départ, puis confirmer sa présence en classe.');
    await demo.hover(page.getByRole('button', { name: 'Je suis en route' }).first());
    await demo.pause(3000);
    demo.say('Il signale son départ : l’affectation passe « En route ».');
    await demo.click(page.getByRole('button', { name: 'Je suis en route' }).first());
    await page.getByText('En route', { exact: true }).first().waitFor();
    await demo.pause(3500);
    demo.say('Arrivé en classe, il confirme sa présence : QR code de la classe et photo.');
    await demo.hover(page.getByRole('article').filter({ hasText: '1ère année Violet' }).first());
    await demo.pause(3000);
  },
};
