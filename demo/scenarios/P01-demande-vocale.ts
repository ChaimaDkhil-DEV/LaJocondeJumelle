import { assistMode } from '../lib/config';
import type { Scenario } from '../lib/demo';
import { act, completeWithPhoto, openRequest, peekNotifications, showHistory } from '../lib/journey';
import { categoryId } from '../lib/seed';

const CATEGORY = 'Petits travaux (démo photo)';
/** Durée de l'enregistrement : la phrase de la voix de démonstration et ses silences (≈ 13 s). */
const RECORD_MS = 14_500;

/**
 * P01 — Création vocale assistée : l'enseignante décrit le problème à voix haute ; le message est
 * transcrit (Whisper si son serveur répond), puis le titre, la catégorie, la priorité et le
 * destinataire sont proposés et remplis automatiquement d'après les consignes de l'établissement.
 * La demande est ensuite traitée jusqu'à sa clôture.
 */
export const P01: Scenario = {
  id: 'P01',
  slug: 'demande-vocale',
  title: 'Dictez votre demande : l’application remplit le formulaire',
  async prepare(ctx) {
    // Consigne de l'établissement : elle guide la catégorie et la priorité proposées.
    const superadmin = await ctx.as('superadmin');
    await superadmin('/api/admin/guidelines', {
      title: 'Mobilier et petites réparations',
      body: 'Étagère, porte, placard, table ou chaise décrochée ou cassée dans une salle : catégorie Petits travaux. Priorité : Haute.',
      categoryId: await categoryId(ctx, CATEGORY),
    });
  },
  async play(demo) {
    const { page } = demo;
    const whisper = assistMode() === 'whisper';
    await demo.login('enseignante', 'Une enseignante signale un problème depuis son téléphone ou son ordinateur.');
    await demo.nav('Nouvelle demande');
    await page.getByRole('heading', { name: 'Nouvelle demande' }).waitFor();
    demo.say('Formulaire vide : elle n’écrit rien, elle appuie sur le micro et parle.');
    await demo.pause(2500);

    await demo.click(demo.button('Enregistrer un message vocal'));
    await page.getByRole('button', { name: 'Arrêter l’enregistrement' }).waitFor();
    demo.say('« L’étagère de la salle de sciences s’est décrochée… c’est dangereux… » (voix de synthèse pour la démo)');
    await demo.pause(RECORD_MS);
    await demo.click(demo.button('Arrêter l’enregistrement'));
    await page.getByRole('button', { name: 'Lire le message vocal' }).first().waitFor();

    await demo.fastForward(
      whisper
        ? 'Automatique : Whisper, installé sur le serveur de l’école, transcrit le message…'
        : 'Automatique : le message est transcrit (transcription simulée en local pour cette démo)…',
      () => page.getByText(/^Champs préremplis d’après votre message/).waitFor({ timeout: 300_000 }),
    );
    demo.say('… puis l’application remplit le formulaire toute seule.');
    await demo.pause(3000);

    const title = page.getByLabel('Titre', { exact: true });
    demo.say('Le titre, tiré de ses propres mots ;');
    await demo.hover(title);
    await demo.pause(3000);
    const description = page.getByLabel('Description (facultative)');
    if (await description.isVisible()) {
      demo.say('le texte complet du message, transcrit mot pour mot ;');
      await demo.hover(description);
      await demo.pause(3500);
    }
    demo.say('la catégorie, d’après la consigne « Mobilier et petites réparations » ;');
    await demo.hover(page.getByRole('combobox', { name: 'Catégorie' }));
    await demo.pause(3000);
    demo.say('la priorité Urgente, parce qu’un danger pour les élèves est signalé ;');
    await demo.hover(page.getByRole('radio', { name: 'Urgente' }));
    await demo.pause(3000);
    demo.say('et le destinataire : le service qui traite ces demandes.');
    await demo.hover(page.getByRole('combobox', { name: /^Destinataire/ }));
    await demo.pause(3000);

    demo.say('« Voir pourquoi » explique chaque proposition.');
    await demo.click(demo.button('Voir pourquoi'));
    await demo.pause(4500);
    demo.say('Tout reste modifiable. Elle vérifie et envoie.');
    const sentTitle = await title.inputValue();
    await demo.click(demo.button('Envoyer la demande'));
    await page.getByRole('heading', { level: 1, name: sentTitle }).waitFor();
    await demo.pause(2000);
    demo.say('Le message vocal original accompagne la demande.');
    await demo.hover(page.getByRole('heading', { name: 'Message vocal' }));
    await demo.pause(2500);
    demo.say('L’historique garde les propositions retenues et la consigne utilisée.');
    await demo.hover(page.getByText(/^Propositions automatiques/).first());
    await demo.pause(4000);
    await demo.logout();

    await demo.login('reprographie', 'L’employé du service est prévenu aussitôt.');
    await peekNotifications(demo);
    await openRequest(demo, sentTitle, 'Reçues');
    demo.say('Il écoute le message vocal et accepte la demande.');
    await demo.click(demo.button('Lire le message vocal'));
    await demo.pause(3000);
    await act(demo, 'Accepter la demande', 'Acceptée');
    await act(demo, 'Commencer', 'En cours');
    demo.say('Travail terminé, avec une photo de preuve.');
    await completeWithPhoto(demo, 'Terminée');
    await demo.logout();

    await demo.login('enseignante', 'L’enseignante vérifie et clôture.');
    await openRequest(demo, sentTitle, 'Envoyées');
    await demo.hover(page.getByRole('img', { name: 'Photo de preuve 1' }));
    await demo.pause(2000);
    await act(demo, 'Clôturer', 'Clôturée');
    demo.say('De la voix à la clôture : chaque étape est datée dans l’historique.');
    await showHistory(demo, 5);
  },
};
