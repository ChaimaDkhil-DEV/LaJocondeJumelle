import type { Scenario } from '../lib/demo';
import { act, actWithReason, completeWithPhoto, createWrittenRequest, openRequest, showHistory } from '../lib/journey';

const TITLE = 'Vidéoprojecteur sans image en salle 14';

/**
 * P02 — Circuit avec validation par l'administration (circuit B) : demande écrite, approbation et
 * choix de l'employé par la surveillante générale, réalisation, renvoi à corriger, reprise,
 * validation finale.
 */
export const P02: Scenario = {
  id: 'P02',
  slug: 'validation-administration',
  title: 'Validation par l’administration, correction et validation finale',
  async play(demo) {
    const { page } = demo;
    await demo.login('enseignante', 'Une demande peut aussi être écrite ; celle-ci passe par l’administration.');
    await createWrittenRequest(demo, {
      category: 'Intervention technique (démo circuit B)',
      priority: 'Normale',
      title: TITLE,
      description: 'Le vidéoprojecteur s’allume mais affiche « Aucun signal », avec l’ordinateur comme avec une clé HDMI.',
    });
    demo.say('En attente de validation : personne ne peut encore la traiter.');
    await demo.pause(2500);
    await demo.logout();

    await demo.login('admin', 'La surveillante générale valide les demandes de ce circuit.');
    await openRequest(demo, TITLE, 'À valider');
    demo.say('Elle lit la demande puis l’approuve…');
    await demo.pause(2500);
    await demo.click(demo.button('Approuver'));
    const approve = page.getByRole('dialog', { name: 'Approuver la demande' });
    demo.say('… en choisissant l’employé chargé de la réaliser.');
    await demo.click(approve.getByRole('combobox', { name: 'Employé chargé de la demande' }));
    await demo.pause(700);
    await demo.click(page.getByRole('option', { name: /^Reprographie/ }));
    await demo.pause(800);
    await demo.click(approve.getByRole('button', { name: 'Approuver et affecter' }));
    await page.getByText('Envoyée', { exact: true }).first().waitFor();
    await demo.pause(2000);
    await demo.logout();

    await demo.login('reprographie', 'L’employé affecté réalise l’intervention.');
    await openRequest(demo, TITLE, 'Reçues');
    await act(demo, 'Accepter la demande', 'Acceptée');
    await act(demo, 'Commencer', 'En cours');
    demo.say('Travail terminé, avec une photo de preuve.');
    await completeWithPhoto(demo, 'En attente de validation finale');
    await demo.logout();

    await demo.login('admin', 'L’administration contrôle le résultat.');
    await openRequest(demo, TITLE, 'À valider');
    demo.say('Le résultat ne convient pas : elle renvoie la demande à corriger, avec un commentaire.');
    await actWithReason(demo, 'Renvoyer à corriger', 'Renvoyer à corriger', 'Ce qu’il faut corriger', 'L’image est floue sur la moitié droite de l’écran.', 'Renvoyer à corriger', 'À corriger');
    await demo.logout();

    await demo.login('reprographie', 'L’employé lit le commentaire et reprend le travail.');
    await openRequest(demo, TITLE, 'Reçues');
    await demo.hover(page.getByText(/L’image est floue/).first());
    await demo.pause(2500);
    await act(demo, 'Reprendre', 'En cours');
    await completeWithPhoto(demo, 'En attente de validation finale');
    await demo.logout();

    await demo.login('admin', 'Nouvelle vérification par l’administration.');
    await openRequest(demo, TITLE, 'À valider');
    demo.say('Cette fois c’est bon : validation finale et clôture.');
    await act(demo, 'Valider et clôturer', 'Clôturée');
    demo.say('L’historique garde la trace de la correction.');
    await showHistory(demo, 5);
  },
};
