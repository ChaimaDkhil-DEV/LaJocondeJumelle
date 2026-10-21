import type { Scenario } from '../lib/demo';
import { createTeacherRequest, schoolTime } from '../lib/seed';

/**
 * S12 — Affectation des surveillants : signalement d'un enseignant assigné, affectation directe
 * (surveillant déjà affecté sur le créneau : non proposable), surveillant absent remplacé par
 * réassignation, trace dans le journal d'audit.
 */
export const S12: Scenario = {
  id: 'S12',
  slug: 'affectation-surveillants',
  title: 'Affectation des surveillants',
  async prepare(ctx) {
    await createTeacherRequest(ctx, 'enseignante', { className: '1ère année Violet', reason: 'Rendez-vous médical' });
  },
  async play(demo) {
    const { page } = demo;
    const toast = (text: string | RegExp) => page.getByRole('status').filter({ hasText: text }).first();
    await demo.login('superadmin', 'Gardes : affectation des surveillants.');
    await demo.nav('Gardes');

    demo.say('En attente : l’absence signalée par l’enseignante.');
    await page.getByRole('tab', { name: 'En attente' }).waitFor();
    await demo.pause();
    await demo.click(page.getByRole('link', { name: /1ère année Violet/ }).first());
    await page.getByRole('heading', { name: 'Garde — 1ère année Violet' }).waitFor();
    await demo.pause();

    demo.say('Surveillants de l’étage d’abord, avec leur disponibilité.');
    await demo.click(demo.button('Assigner un surveillant'));
    const assign = page.getByRole('dialog', { name: 'Assigner un surveillant' });
    await demo.pause(1500);
    await demo.click(assign.getByRole('radio', { name: /^Surveillant · 1er étage · Disponible/ }));
    await demo.pause(800);
    await demo.click(assign.getByRole('button', { name: 'Assigner' }));
    await toast('Surveillant assigné.').waitFor();
    await demo.pause();

    demo.say('Affectation directe : même créneau, autre classe.');
    await demo.nav('Gardes');
    await demo.click(demo.link('Nouvelle affectation'));
    await page.getByRole('heading', { name: 'Nouvelle affectation' }).waitFor();
    await demo.choose(/^Classe/, /2e année Bleu/);
    for (const [label, minutes] of [[/Heure de début/, 0], [/Heure de fin/, 60]] as const) {
      const input = page.getByLabel(label);
      await demo.click(input);
      await input.fill(schoolTime(minutes));
      await demo.pause(600);
    }
    demo.say('Le surveillant est déjà affecté sur ce créneau : il n’est pas proposable.');
    await demo.hover(page.getByText(/^Surveillant · 1er étage · Déjà affecté sur ce créneau/));
    await demo.pause(3000);
    demo.say('On choisit le surveillant du 2e étage, celui de la classe.');
    await demo.click(page.getByRole('radio', { name: /^Surveillant 2e étage · 2e étage · Disponible/ }));
    await demo.pause(800);
    await demo.click(demo.button('Créer l’affectation'));
    await toast('Affectation créée').waitFor();
    await demo.pause();

    demo.say('Le surveillant est déclaré absent (onglet Équipe).');
    await demo.nav('Gardes');
    await demo.click(page.getByRole('tab', { name: 'Équipe' }));
    await demo.pause();
    await demo.choose(/^Statut de Surveillant$/, 'Absent');
    await demo.pause();

    demo.say('Remplacement : son affectation est réassignée à la remplaçante.');
    await demo.click(page.getByRole('tab', { name: 'En cours' }));
    await demo.pause();
    await demo.click(page.getByRole('link', { name: /1ère année Violet/ }).first());
    await page.getByRole('heading', { name: 'Garde — 1ère année Violet' }).waitFor();
    await demo.click(demo.button('Réassigner'));
    const reassign = page.getByRole('dialog', { name: 'Réassigner l’affectation' });
    await demo.pause(1200);
    await demo.click(reassign.getByRole('radio', { name: /^Remplaçante · 1er étage · Disponible/ }));
    await demo.pause(800);
    await demo.click(reassign.getByRole('button', { name: 'Réassigner' }));
    await toast('Affectation réassignée.').waitFor();
    await demo.pause();
    demo.say('L’historique garde la trace de la réassignation.');
    await demo.hover(page.getByText(/Réassignée de Surveillant à Remplaçante/).first());
    await demo.pause(3000);

    demo.say('Journal d’audit : chaque affectation est tracée.');
    await demo.nav('Administrateur');
    await demo.adminTab('Journal d’audit');
    await demo.choose('Action', 'Affectation gérée par un admin');
    await demo.pause(3500);
  },
};
