/**
 * Gestes communs du parcours d'une demande (série « P ») : création avec message vocal, ouverture
 * depuis « Mes demandes », actions du circuit, motifs, photo de preuve. Libellés de l'interface réelle.
 */
import { join } from 'node:path';
import { DEMO_DIR, type Demo } from './demo';

/** Photo de preuve fictive des tests e2e. */
export const PROOF_PHOTO = join(DEMO_DIR, '..', 'e2e', 'fixtures', 'images', 'preuve.png');

/** Enregistre un message vocal (micro simulé : voix fictive), puis le réécoute. */
export async function recordVoice(demo: Demo, seconds = 3, scope = demo.page.locator('body')): Promise<void> {
  await demo.click(scope.getByRole('button', { name: 'Enregistrer un message vocal' }));
  await scope.getByRole('button', { name: 'Arrêter l’enregistrement' }).waitFor();
  await demo.pause(seconds * 1000);
  await demo.click(scope.getByRole('button', { name: 'Arrêter l’enregistrement' }));
  await scope.getByRole('button', { name: 'Lire le message vocal' }).first().waitFor();
  await demo.pause(800);
}

export interface WrittenRequest {
  category: string;
  priority: 'Normale' | 'Moyenne' | 'Haute' | 'Urgente';
  title: string;
  description: string;
}

/** « Nouvelle demande » écrite : catégorie, priorité, titre et description saisis. */
export async function createWrittenRequest(demo: Demo, input: WrittenRequest): Promise<void> {
  const { page } = demo;
  await demo.nav('Nouvelle demande');
  await page.getByRole('heading', { name: 'Nouvelle demande' }).waitFor();
  await demo.type(page.getByLabel('Titre', { exact: true }), input.title);
  await demo.choose('Catégorie', input.category);
  await demo.click(page.getByRole('radio', { name: input.priority }));
  const add = page.getByRole('button', { name: /Ajouter une description/ });
  if (await add.isVisible()) await demo.click(add);
  await demo.type(page.getByLabel('Description (facultative)'), input.description);
  await demo.pause(800);
  await demo.click(demo.button('Envoyer la demande'));
  await page.getByRole('heading', { level: 1, name: input.title }).waitFor();
  await demo.pause(2500);
}

/** Ouvre une demande depuis « Mes demandes » (onglet donné), par son titre. */
export async function openRequest(demo: Demo, title: string, tab?: 'Reçues' | 'Envoyées' | 'À valider' | 'Suivi'): Promise<void> {
  const { page } = demo;
  await demo.nav('Mes demandes');
  await page.getByRole('heading', { level: 1, name: 'Mes demandes' }).waitFor();
  if (tab) {
    await demo.click(page.getByRole('tab', { name: tab }));
    await demo.pause(800);
  }
  await demo.click(demo.link(title));
  await page.getByRole('heading', { level: 1, name: title }).waitFor();
  await demo.pause(1500);
}

/** Bouton d'action du circuit, puis attente du nouveau statut affiché. */
export async function act(demo: Demo, button: string, status: string): Promise<void> {
  await demo.click(demo.button(button));
  await demo.page.getByText(status, { exact: true }).first().waitFor();
  await demo.pause(1800);
}

/** Action avec motif ou commentaire (refus, renvoi à corriger). */
export async function actWithReason(demo: Demo, button: string, dialogTitle: string, label: string, reason: string, confirm: string, status: string): Promise<void> {
  const { page } = demo;
  await demo.click(demo.button(button));
  const dialog = page.getByRole('dialog', { name: dialogTitle });
  await demo.type(dialog.getByLabel(label), reason);
  await demo.pause(800);
  await demo.click(dialog.getByRole('button', { name: confirm }));
  await page.getByText(status, { exact: true }).first().waitFor();
  await demo.pause(2000);
}

/** « Marquer comme terminée » avec une photo de preuve. */
export async function completeWithPhoto(demo: Demo, status: string): Promise<void> {
  const { page } = demo;
  await demo.click(demo.button('Marquer comme terminée'));
  const dialog = page.getByRole('dialog', { name: 'Terminer la demande' });
  await dialog.waitFor();
  await demo.pause(1500);
  await dialog.getByLabel('Prendre une photo').setInputFiles(PROOF_PHOTO);
  await dialog.getByRole('img', { name: 'Photo de preuve 1' }).waitFor();
  await demo.pause(1500);
  await demo.click(dialog.getByRole('button', { name: 'Confirmer la fin' }));
  await page.getByText(status, { exact: true }).first().waitFor();
  await demo.pause(2000);
}

/** Fait défiler jusqu'à l'historique de la demande. */
export async function showHistory(demo: Demo, seconds = 4): Promise<void> {
  await demo.hover(demo.page.getByRole('heading', { name: 'Historique' }).first());
  await demo.pause(seconds * 1000);
}

/** Ouvre la cloche des notifications puis la referme. */
export async function peekNotifications(demo: Demo, seconds = 3): Promise<void> {
  await demo.click(demo.button(/^Notifications/));
  await demo.pause(seconds * 1000);
  await demo.page.keyboard.press('Escape');
  await demo.pause(600);
}
