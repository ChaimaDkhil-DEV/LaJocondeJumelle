import type { Scenario } from '../lib/demo';
import { schoolTime } from '../lib/seed';

/** S07 — Groupes et Classes : un surveillant de plus, une classe et son étage, puis une affectation. */
export const S07: Scenario = {
  id: 'S07',
  slug: 'groupes-classes',
  title: 'Groupes et classes',
  async play(demo) {
    const { page } = demo;
    const schoolClass = '6e Hirondelles (fictive)';
    await demo.login('superadmin', 'Administrateur › Groupes et Classes.');
    await demo.nav('Administrateur');

    demo.say('Le groupe Surveillants : ses membres peuvent être assignés.');
    await demo.adminTab('Groupes');
    await demo.click(page.getByRole('button', { name: 'Modifier le groupe Surveillants' }));
    const groupDialog = page.getByRole('dialog');
    await demo.pause();
    demo.say('On y ajoute un employé.');
    await demo.pickOptions(groupDialog, 'Membres', [/^Nouvel employé/]);
    await demo.click(groupDialog.getByRole('button', { name: 'Enregistrer le groupe' }));
    await groupDialog.waitFor({ state: 'hidden' });
    await demo.pause();

    demo.say('Une classe : son étage et son QR code de présence.');
    await demo.adminTab('Classes');
    await demo.click(demo.button('Nouvelle classe'));
    const classDialog = page.getByRole('dialog');
    await demo.type(classDialog.getByLabel('Nom de la classe'), schoolClass);
    await demo.type(classDialog.getByLabel('Salle ou lieu (facultatif)'), 'Salle 101');
    await demo.click(classDialog.getByRole('combobox', { name: 'Étage' }));
    await demo.pause(600);
    await demo.click(page.getByRole('option', { name: '1er étage' }));
    await demo.pause(600);
    await demo.click(classDialog.getByRole('button', { name: 'Enregistrer la classe' }));
    await classDialog.waitFor({ state: 'hidden' });
    await demo.pause();
    await demo.click(page.getByRole('button', { name: `QR code de la classe ${schoolClass}` }));
    await demo.pause(2500);
    await page.keyboard.press('Escape');
    await demo.pause(800);

    demo.say('Utilisation : une affectation dans cette classe, au nouveau surveillant.');
    await demo.nav('Gardes');
    await demo.click(demo.link('Nouvelle affectation'));
    await page.getByRole('heading', { name: 'Nouvelle affectation' }).waitFor();
    await demo.choose(/^Classe/, new RegExp(schoolClass.replace(/[()]/g, '\\$&')));
    for (const [label, minutes] of [[/Heure de début/, 0], [/Heure de fin/, 60]] as const) {
      const input = page.getByLabel(label);
      await demo.click(input);
      await input.fill(schoolTime(minutes));
      await demo.pause(600);
    }
    await demo.click(page.getByRole('radio', { name: /^Nouvel employé · .* · Disponible/ }));
    await demo.pause();
    await demo.click(demo.button('Créer l’affectation'));
    await page.getByRole('heading', { name: `Garde — ${schoolClass}` }).waitFor();
    demo.say('L’affectation est créée assignée : le surveillant est prévenu.');
    await demo.pause(3000);
  },
};
