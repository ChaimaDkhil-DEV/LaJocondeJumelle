import type { Scenario } from '../lib/demo';
import { userId } from '../lib/seed';

/** S04 — Nouvelle demande dans « Surveillance » (via l'administration) puis « Photocopies » (direct). */
export const S04: Scenario = {
  id: 'S04',
  slug: 'nouvelle-demande',
  title: 'Nouvelle demande',
  async prepare(ctx) {
    const api = await ctx.as('superadmin');
    const created = await api<{ id: string }>('/api/admin/categories', {
      name: 'Surveillance',
      routingMode: 'VIA_ADMIN',
      creatorRoles: ['EMPLOYEE', 'ADMIN'],
      closureMode: 'REQUESTER',
    });
    await api(`/api/admin/categories/${created.id}/recipients`, { userIds: [await userId(ctx, 'surveillant'), await userId(ctx, 'remplacant')] }, 'PUT');
    await api(`/api/admin/categories/${created.id}/managers`, { userIds: [await userId(ctx, 'admin')] }, 'PUT');
  },
  async play(demo) {
    const { page } = demo;
    await demo.login('superadmin', 'Le super administrateur crée deux demandes.');

    async function create(category: string, title: string, description: string): Promise<void> {
      await demo.nav('Nouvelle demande');
      await page.getByRole('heading', { name: 'Nouvelle demande' }).waitFor();
      await demo.choose('Catégorie', category);
      await demo.pause();
      await demo.click(page.getByRole('radio', { name: 'Normale' }));
      await demo.type(page.getByLabel('Titre'), title);
      await demo.type(page.getByLabel('Description (facultative)'), description);
      await demo.pause(800);
      await demo.click(demo.button('Envoyer la demande'));
      await page.getByRole('heading', { level: 1, name: title }).waitFor();
      await demo.pause(2500);
    }

    demo.say('« Surveillance » : validée d’abord par l’administration.');
    await create('Surveillance', 'Surveillance de la récréation de 10 h', 'Besoin d’un surveillant supplémentaire.');
    demo.say('La demande attend la validation administrative.');
    await demo.pause(1500);

    demo.say('« Photocopies » : envoyée directement à la reprographie.');
    await create('Photocopies', 'Sujets de contrôle de 3e', '28 exemplaires recto verso.');
    demo.say('Destinataire choisi d’office : la demande est envoyée.');
    await demo.pause(1500);
  },
};
