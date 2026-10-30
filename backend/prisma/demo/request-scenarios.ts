import type { Priority } from '@prisma/client';
import type { RequestAction } from '../../src/requests/domain/request-state-machine';
import type { CategoryKey, StaffKind } from './school-data';

/**
 * Situations de la vie de l'école (toutes fictives). Repères remplacés par les données du demandeur :
 * {classe} (sa classe), {salle}, {etage} (son étage), {collegue} (collègue sollicité, entraide).
 *
 * Issue (`fate`) : parcours normal du circuit jusqu'à la clôture, ou refus par l'administration
 * (reject), refus par l'employé (decline), annulation par le demandeur (cancel), renvoi à corriger
 * (correction), réaffectation (reassign), brouillon jamais envoyé (draft). Le statut final dépend
 * aussi de la date : une demande récente est encore en cours.
 */
export type Fate = 'normal' | 'reject' | 'decline' | 'cancel' | 'correction' | 'reassign' | 'draft';

export type MessageMoment = 'SUBMIT' | 'APPROVE' | 'ACCEPT' | 'START';

export interface ScenarioMessage {
  after: MessageMoment;
  by: 'requester' | 'assignee';
  text: string;
}

export interface Scenario {
  category: CategoryKey;
  priority: Priority;
  /** Type de personnel demandeur, ou identifiant de connexion précis. */
  requester: StaffKind | `@${string}`;
  title: string;
  description: string;
  fate?: Fate;
  /** Circuit B « Activités, salles et événements » : service à qui l'administration confie la demande. */
  assignTo?: StaffKind;
  /** Motif (refus, annulation) ou commentaire (correction). */
  reason?: string;
  messages?: ScenarioMessage[];
  /** Créée dans les derniers jours de la période (demande encore en cours à la démonstration). */
  recent?: boolean;
  /** Action pas encore faite à la date de la démonstration : la demande attend à l'étape précédente. */
  waitsFor?: RequestAction;
  /** Démonstration de l'assistance : propositions automatiques retenues ou corrigées à l'envoi. */
  assist?: { proposedPriority?: Priority; proposedTitle?: string; guideline: string };
}

const s = (
  category: CategoryKey,
  priority: Priority,
  requester: Scenario['requester'],
  title: string,
  description: string,
  extra: Partial<Scenario> = {},
): Scenario => ({ category, priority, requester, title, description, ...extra });

export const SCENARIOS: readonly Scenario[] = [
  // -------------------------------------------------------------------------
  // Informatique et numérique (circuit A, responsable informatique)
  // -------------------------------------------------------------------------
  s('it', 'HIGH', 'teacher', 'Vidéoprojecteur sans image en {classe}', 'Le vidéoprojecteur de la {salle} s’allume mais affiche « Aucun signal » depuis ce matin, avec l’ordinateur comme avec ma clé HDMI. J’ai une séance de lecture projetée à 10 h.', {
    messages: [
      { after: 'ACCEPT', by: 'assignee', text: 'Je passe à la récréation de 9 h 45 avec un câble de rechange.' },
      { after: 'START', by: 'requester', text: 'Merci, la salle sera ouverte.' },
    ],
    assist: { guideline: 'informatique' },
  }),
  s('it', 'NORMAL', 'teacher', 'Installer le logiciel de dictée vocale', 'Pourriez-vous installer le logiciel de dictée vocale utilisé en conseil de cycle sur l’ordinateur de la {salle} ? Il servira aux élèves qui ont des difficultés d’écriture.'),
  s('it', 'MEDIUM', 'supervisor', 'Wi-Fi très lent au {etage}', 'Depuis lundi, le Wi-Fi du {etage} coupe plusieurs fois par heure. Les tablettes de lecture se déconnectent en pleine activité et les collègues me le signalent à chaque pause.', {
    messages: [{ after: 'ACCEPT', by: 'assignee', text: 'La borne du couloir redémarre en boucle, je la remplace par celle du stock.' }],
  }),
  s('it', 'HIGH', 'bursar', 'Logiciel de facturation inaccessible', 'Le logiciel de facturation affiche « licence expirée » à l’ouverture. Je dois éditer les factures de cantine du mois avant vendredi.', { assist: { proposedPriority: 'URGENT', guideline: 'informatique' } }),
  s('it', 'NORMAL', 'teacher', 'Créer un compte élève sur la plateforme de lecture', 'Un nouvel élève arrive lundi en {classe}. Merci de lui créer un compte sur la plateforme de lecture en ligne, avec le même niveau que le reste du groupe.'),
  s('it', 'URGENT', 'headSupervisor', 'Plus d’accès Internet dans tout l’établissement', 'Aucun poste ni téléphone n’accède à Internet depuis 8 h 10, y compris au secrétariat. Les appels des parents arrivent sur le fixe mais nous ne pouvons rien consulter.', {
    messages: [{ after: 'ACCEPT', by: 'assignee', text: 'Box du fournisseur hors service, je bascule sur la ligne de secours et j’appelle l’opérateur.' }],
  }),
  s('it', 'MEDIUM', 'teacher', 'Imprimante de la salle des maîtres bloquée', 'L’imprimante de la salle des maîtres affiche « bourrage papier » alors qu’aucune feuille n’est coincée. Nous ne pouvons plus imprimer les fiches d’exercices.'),
  s('it', 'NORMAL', 'specialist', 'Haut-parleurs pour la salle de musique', 'Les haut-parleurs reliés à l’ordinateur de la salle de musique grésillent fortement. Est-il possible de vérifier le câble ou de les remplacer ?'),
  s('it', 'HIGH', 'teacher', 'Tableau interactif décalé en {classe}', 'Le stylet du tableau interactif de la {salle} touche environ 5 cm à côté du point visé. Le calibrage habituel ne suffit plus et les élèves ne peuvent pas écrire au tableau.', { recent: true, waitsFor: 'RESUME', fate: 'correction', reason: 'Le décalage revient au bout d’une heure, surtout sur la partie droite du tableau.' }),
  s('it', 'NORMAL', 'direction', 'Préparer six ordinateurs portables pour la réunion des parents', 'Pour la réunion des parents du jeudi, merci de préparer six ordinateurs portables avec la présentation du projet d’établissement et un accès invité au Wi-Fi.'),
  s('it', 'MEDIUM', 'teacher', 'Ordinateur de classe qui ne démarre plus', 'L’ordinateur de la {salle} reste sur l’écran noir du fabricant puis redémarre seul. J’ai essayé de le débrancher dix minutes, sans effet.', {
    messages: [
      { after: 'ACCEPT', by: 'assignee', text: 'Je l’emporte à l’atelier ; je vous prête un portable en attendant.' },
    ],
  }),
  s('it', 'NORMAL', 'supervisor', 'Badge d’accès au portail à reprogrammer', 'Mon badge n’ouvre plus le portail des livraisons depuis la coupure de courant de samedi. Celui de mon collègue fonctionne.'),
  s('it', 'NORMAL', 'teacher', 'Compte de messagerie verrouillé', 'Mon compte de messagerie professionnelle est verrouillé après plusieurs essais. Je n’ai pas accès aux documents partagés du niveau.', { fate: 'cancel', reason: 'Le compte s’est débloqué tout seul au bout d’une heure.' }),
  s('it', 'HIGH', 'specialist', 'Enceinte Bluetooth de la cour introuvable', 'L’enceinte utilisée pour les séances d’éducation physique dans la cour n’est plus dans l’armoire. J’en ai besoin pour la préparation du spectacle.', { fate: 'decline', reason: 'Le matériel de la cour dépend de l’économat : je transfère l’information à M. Ben Romdhane.' }),
  s('it', 'NORMAL', 'teacher', 'Mise à jour des tablettes de lecture', 'Les dix tablettes de la {classe} demandent une mise à jour système à chaque démarrage, ce qui fait perdre un quart d’heure en début de séance.', { recent: true, waitsFor: 'ACCEPT' }),
  s('it', 'MEDIUM', 'technician', 'Caméra du portail principal sans image', 'L’écran de la loge n’affiche plus la caméra du portail principal. Les autres caméras fonctionnent.'),
  s('it', 'NORMAL', 'teacher', 'Accès à l’application des appréciations', 'Je n’ai pas encore d’accès à l’application de saisie des appréciations pour la {classe}. Les bulletins sont à rendre dans dix jours.', { recent: true, waitsFor: 'START' }),
  s('it', 'URGENT', 'teacher', 'Écran de la {salle} tombé de son support', 'L’écran mural de la {salle} s’est décroché d’un côté pendant la récréation et pend au-dessus d’une table. J’ai fait sortir les élèves de cette zone.', { assist: { guideline: 'securite' } }),
  s('it', 'NORMAL', 'headSupervisor', 'Imprimer les cartes de cantine', 'Le module d’impression des cartes de cantine renvoie une erreur de modèle. Il reste une vingtaine de cartes à imprimer pour les nouveaux inscrits.'),
  s('it', 'MEDIUM', 'teacher', 'Clé USB de classe infectée', 'L’antivirus a bloqué la clé USB commune de la {classe}. Pouvez-vous la nettoyer et vérifier l’ordinateur sur lequel elle a été branchée ?'),
  s('it', 'NORMAL', 'specialist', 'Logiciel d’anglais à installer en salle informatique', 'Merci d’installer le logiciel de prononciation anglaise sur les postes de la salle informatique avant la séquence de novembre.', { fate: 'draft' }),
  s('it', 'NORMAL', 'teacher', 'Souris et clavier sans fil en {classe}', 'La souris sans fil de la {salle} ne répond plus malgré des piles neuves, le clavier fonctionne par intermittence.'),
  s('it', 'HIGH', 'headSupervisor', 'Serveur de fichiers presque plein', 'Une alerte du secrétariat indique que le serveur de fichiers pédagogiques est rempli à 96 %. Les enregistrements risquent d’être bloqués avant la fin de la semaine.', { fate: 'cancel', reason: 'M. Kchaou l’a traité en direct en archivant les dossiers de 2023.' }),
  s('it', 'MEDIUM', 'teacher', 'Son du vidéoprojecteur inaudible', 'Le son de la {salle} est très faible, même au maximum. Les élèves du fond n’entendent pas les vidéos de sciences.', { recent: true }),
  s('it', 'NORMAL', 'supervisor', 'Téléphone de l’étage sans tonalité', 'Le téléphone fixe du {etage} n’a plus de tonalité. Nous l’utilisons pour appeler l’infirmerie et le secrétariat.', { recent: true, waitsFor: 'ACCEPT' }),
  s('it', 'NORMAL', 'teacher', 'Câble HDMI trop court en {classe}', 'Le câble HDMI de la {salle} est trop court depuis le déplacement du bureau. Un câble de cinq mètres suffirait.', { recent: true }),

  // -------------------------------------------------------------------------
  // Maintenance et réparations (circuit B : validation, technicien, validation finale)
  // -------------------------------------------------------------------------
  s('maintenance', 'HIGH', 'teacher', 'Climatisation en panne en {classe}', 'La climatisation de la {salle} souffle de l’air chaud depuis hier. Avec le soleil de l’après-midi, la température dépasse 29 °C et plusieurs élèves se plaignent de maux de tête.', {
    messages: [{ after: 'APPROVE', by: 'requester', text: 'La classe peut être libérée pendant la séance de sport de 14 h si besoin.' }],
  }),
  s('maintenance', 'URGENT', 'supervisor', 'Fuite d’eau dans les sanitaires du {etage}', 'Une fuite au niveau du raccord sous le lavabo des sanitaires des filles inonde le sol jusqu’au couloir. J’ai fermé la porte et posé un panneau.', {
    assist: { guideline: 'securite' },
    messages: [{ after: 'ACCEPT', by: 'assignee', text: 'J’arrive avec le matériel, coupez l’arrivée d’eau du local si possible.' }],
  }),
  s('maintenance', 'URGENT', '@nabil.arfaoui', 'Panne électrique au 2e étage', 'Tout le 2e étage est sans électricité depuis 9 h 20 : classes, couloir et sanitaires. Le disjoncteur général de l’étage saute dès qu’on le relève.'),
  s('maintenance', 'MEDIUM', 'teacher', 'Néons qui clignotent en {classe}', 'Deux néons de la {salle} clignotent en permanence au-dessus du tableau. C’est fatigant pour les élèves, surtout pendant la lecture.'),
  s('maintenance', 'HIGH', 'teacher', 'Porte de la {salle} qui ne ferme plus', 'La poignée de la porte de la {salle} tourne dans le vide et la porte ne se ferme plus. Impossible de laisser la classe fermée pendant la récréation.', { recent: true, waitsFor: 'RESUME', fate: 'correction', reason: 'La poignée tient mais la gâche frotte toujours : la porte ne se verrouille pas.' }),
  s('maintenance', 'NORMAL', 'teacher', 'Tables bancales en {classe}', 'Quatre tables de la {salle} sont bancales et deux chaises ont un pied fendu. Je les ai mises de côté au fond de la classe.'),
  s('maintenance', 'MEDIUM', 'supervisor', 'Chasse d’eau bloquée aux sanitaires des garçons', 'Au {etage}, la chasse d’eau du deuxième WC des garçons coule en continu. J’ai condamné la cabine.'),
  s('maintenance', 'NORMAL', 'specialist', 'Espaliers du gymnase à revisser', 'Deux barreaux des espaliers du gymnase bougent légèrement. Je n’utilise plus cette partie avec les élèves en attendant la vérification.'),
  s('maintenance', 'HIGH', 'teacher', 'Fenêtre bloquée ouverte en {classe}', 'Le battant de la fenêtre de la {salle} reste bloqué ouvert, la poignée a cassé. Il fait froid le matin et la pluie entre.'),
  s('maintenance', 'NORMAL', 'bursar', 'Robinet du local de stockage', 'Le robinet du local de stockage des fournitures goutte en permanence. Le carton du bas est déjà humide.'),
  s('maintenance', 'URGENT', 'teacher', 'Prise électrique arrachée en {classe}', 'Une prise de la {salle} est arrachée du mur, les fils sont visibles à hauteur d’enfant. J’ai déplacé les tables et interdit l’accès au coin.', { assist: { guideline: 'securite' } }),
  s('maintenance', 'MEDIUM', 'teacher', 'Store de la {salle} cassé', 'Le store de la fenêtre côté cour est descendu de travers et ne remonte plus. Le soleil gêne la lecture du tableau en fin de matinée.'),
  s('maintenance', 'NORMAL', 'supervisor', 'Portemanteaux arrachés dans le couloir du {etage}', 'Trois portemanteaux du couloir du {etage} sont arrachés. Les cartables s’entassent par terre au passage des élèves.'),
  s('maintenance', 'HIGH', 'teacher', 'Odeur de brûlé près du radiateur en {classe}', 'Une odeur de plastique brûlé se dégage du radiateur électrique de la {salle} quand il chauffe. Je l’ai débranché par précaution.'),
  s('maintenance', 'NORMAL', 'teacher', 'Tableau blanc à refixer en {classe}', 'Le tableau blanc de la {salle} s’est décollé en bas à gauche et bouge quand on écrit.', { fate: 'reject', reason: 'Le remplacement des tableaux de ce niveau est prévu aux vacances : en attendant, le technicien a posé deux cales.' }),
  s('organisation', 'MEDIUM', 'technician', 'Pompe de relevage du sous-sol bruyante', 'La pompe de relevage du sous-sol fait un bruit anormal à chaque démarrage. Je propose de faire venir le prestataire avant les pluies : merci de valider et de passer la commande.', { assignTo: 'bursar' }),
  s('maintenance', 'NORMAL', 'teacher', 'Placard de rangement sans charnière', 'La porte du placard de rangement de la {salle} ne tient plus que par une charnière. J’ai peur qu’elle tombe sur un élève.'),
  s('maintenance', 'URGENT', 'supervisor', 'Vitre brisée dans l’escalier du {etage}', 'Un ballon a brisé la vitre de la porte de l’escalier du {etage}. Il y a des éclats au sol, j’ai bloqué le passage et les élèves passent par l’autre escalier.', {
    messages: [{ after: 'ACCEPT', by: 'assignee', text: 'Je sécurise avec un panneau de bois ce matin, la vitre sera commandée.' }],
  }),
  s('maintenance', 'MEDIUM', 'teacher', 'Radiateur froid en {classe}', 'Le radiateur sous la fenêtre de la {salle} reste froid alors que les autres chauffent. Les élèves près de la fenêtre gardent leur manteau.', { recent: true }),
  s('maintenance', 'NORMAL', '@emna.sellami', 'Prise réseau à poser en salle informatique', 'Il manque une prise électrique double près du poste enseignant de la salle informatique ; une rallonge traverse l’allée en attendant.', { fate: 'reassign' }),
  s('maintenance', 'HIGH', 'teacher', 'Infiltration au plafond de la {salle}', 'Une tache d’humidité s’agrandit au plafond de la {salle} depuis les pluies de mardi. De l’eau a goutté sur une table ce matin.', { recent: true }),
  s('maintenance', 'NORMAL', 'teacher', 'Patères à poser pour les blouses', 'Pour les ateliers de peinture, il faudrait une rangée de patères à hauteur d’enfant dans la {salle}.', { fate: 'reject', reason: 'Demande à regrouper avec l’aménagement prévu des salles d’arts : sera traitée en décembre.' }),
  s('maintenance', 'MEDIUM', 'supervisor', 'Lumière du couloir du {etage} en panne', 'La moitié des lumières du couloir du {etage} ne s’allume plus. Le passage devant les sanitaires est très sombre à 17 h.'),
  s('maintenance', 'NORMAL', 'bursar', 'Serrure du bureau de l’économat', 'La clé tourne difficilement dans la serrure du bureau de l’économat ; un peu de lubrifiant ou un nouveau barillet ?', { fate: 'cancel', reason: 'Réglé avec un dégrippant, inutile de déplacer le technicien.' }),
  s('maintenance', 'HIGH', 'teacher', 'Toilettes de la classe bouchées', 'Les toilettes attenantes à la {salle} sont bouchées. Les petits doivent traverser tout le couloir et certains n’y arrivent pas à temps.', { recent: true }),
  s('maintenance', 'NORMAL', 'teacher', 'Bancs de la cour à poncer', 'Les bancs en bois près de la cour des petits ont des échardes. Deux élèves se sont piqués cette semaine.', { recent: true, waitsFor: 'APPROVE' }),
  s('maintenance', 'MEDIUM', 'specialist', 'Piano de la salle de musique à caler', 'Le piano de la salle de musique a un pied qui s’enfonce dans le revêtement. Il penche et une roulette est fendue.'),
  s('maintenance', 'NORMAL', 'teacher', 'Étagère de la bibliothèque de classe affaissée', 'La planche du milieu de la bibliothèque de la {salle} s’est affaissée sous le poids des albums.'),
  s('maintenance', 'URGENT', 'direction', 'Porte de secours du réfectoire bloquée', 'Lors de la visite de sécurité, la barre antipanique de la porte de secours du réfectoire ne s’est pas ouverte. Elle doit être réparée avant le service de midi.', { assist: { proposedPriority: 'HIGH', guideline: 'securite' } }),
  s('maintenance', 'MEDIUM', 'teacher', 'Moustiquaire déchirée en {classe}', 'La moustiquaire de la fenêtre de la {salle} est déchirée et les moustiques entrent le matin.', { fate: 'draft' }),
  s('maintenance', 'NORMAL', 'supervisor', 'Fontaine à eau du {etage} qui fuit', 'La fontaine à eau du {etage} laisse une flaque permanente sous le bac. J’ai posé une serpillière en attendant.', { recent: true }),
  s('organisation', 'HIGH', 'technician', 'Groupe électrogène à réviser', 'L’essai mensuel du groupe électrogène a échoué : il démarre puis s’arrête au bout de 30 secondes. Je demande l’accord pour faire venir le prestataire ; l’économat passera la commande.', { assignTo: 'bursar', recent: true, waitsFor: 'START' }),
  s('maintenance', 'NORMAL', 'teacher', 'Crochets des rideaux en {classe}', 'Les rideaux occultants de la {salle} se décrochent dès qu’on les tire, plusieurs crochets sont cassés.', { recent: true, waitsFor: 'APPROVE' }),

  // -------------------------------------------------------------------------
  // Fournitures et matériel pédagogique (circuit A, économe, clôture automatique)
  // -------------------------------------------------------------------------
  s('supplies', 'NORMAL', 'teacher', 'Cahiers de travaux pratiques pour {classe}', 'Il manque 6 cahiers de travaux pratiques pour la {classe} (élèves arrivés après la rentrée). Format 24 × 32, 48 pages.', { assist: { guideline: 'fournitures' } }),
  s('supplies', 'MEDIUM', 'teacher', 'Feutres pour tableau blanc', 'Plus aucun feutre bleu ni noir ne fonctionne en {classe}. Une boîte de chaque suffirait pour finir la période.'),
  s('supplies', 'NORMAL', 'specialist', 'Gouache et pinceaux pour l’atelier', 'Pour l’atelier peinture des 3e primaire, il me faudrait 10 flacons de gouache (couleurs primaires et blanc) et 30 pinceaux moyens.', {
    messages: [{ after: 'ACCEPT', by: 'assignee', text: 'Je n’ai que 20 pinceaux en stock, le reste arrive lundi.' }],
  }),
  s('supplies', 'NORMAL', 'teacher', 'Ramettes de papier pour {classe}', 'Merci de prévoir trois ramettes de papier A4 pour la {classe} : les évaluations de fin de période arrivent.'),
  s('supplies', 'MEDIUM', 'it', 'Cartouches pour l’imprimante du secrétariat', 'Il reste une seule cartouche noire pour l’imprimante du secrétariat et aucune couleur. Les circulaires aux parents partent jeudi.'),
  s('supplies', 'NORMAL', '@bilel.nasri', 'Ballons et chasubles', 'Deux ballons de handball sont crevés et il manque des chasubles rouges pour faire deux équipes complètes.'),
  s('supplies', 'NORMAL', 'teacher', 'Colle et ciseaux pour les petits', 'La {classe} a besoin de 12 bâtons de colle et de 6 paires de ciseaux à bouts ronds pour les activités de découpage.'),
  s('supplies', 'NORMAL', 'technician', 'Ampoules et tubes de rechange', 'Le stock d’ampoules LED et de tubes de 120 cm est épuisé. Merci de commander 20 tubes et 15 ampoules.'),
  s('supplies', 'MEDIUM', 'teacher', 'Livres de lecture manquants en {classe}', 'Il manque quatre exemplaires du livre de lecture suivie pour la {classe}. Nous commençons le chapitre 3 la semaine prochaine.', { fate: 'decline', reason: 'Ce titre est épuisé chez le fournisseur ; je propose l’édition de poche, à valider avec vous.' }),
  s('supplies', 'NORMAL', 'supervisor', 'Trousse de premiers secours du {etage}', 'La trousse de secours du {etage} n’a plus de pansements ni de compresses stériles.'),
  s('supplies', 'NORMAL', 'teacher', 'Pâte à modeler pour la {classe}', 'La pâte à modeler de la {salle} est sèche. Un lot de 12 couleurs suffirait pour les ateliers de motricité fine.'),
  s('supplies', 'MEDIUM', 'headSupervisor', 'Registres d’appel pour les remplaçants', 'Il faut imprimer et relier 8 registres d’appel vierges pour les enseignants remplaçants de novembre.'),
  s('supplies', 'NORMAL', 'teacher', 'Compas et équerres pour la géométrie', 'Pour la séquence de géométrie, la {classe} a besoin de 10 compas à crayon et 10 équerres.', { fate: 'cancel', reason: 'Prêtés finalement par la classe voisine.' }),
  s('supplies', 'NORMAL', 'specialist', 'Fiches d’anglais en couleur', 'Pourriez-vous imprimer en couleur 120 fiches d’images pour le jeu de vocabulaire (fichier envoyé par messagerie) ?'),
  s('supplies', 'NORMAL', 'teacher', 'Étiquettes pour les porte-manteaux', 'Des étiquettes adhésives plastifiées permettraient de nommer les portemanteaux de la {classe} : 30 suffisent.', { fate: 'draft' }),
  s('supplies', 'MEDIUM', 'teacher', 'Dictionnaires pour la {classe}', 'Seuls 8 dictionnaires sont utilisables en {classe} pour 26 élèves. Pourrait-on en emprunter à la bibliothèque ou en commander ?', { recent: true, waitsFor: 'ACCEPT' }),
  s('supplies', 'NORMAL', 'supervisor', 'Gilets réfléchissants pour la sortie', 'Pour la sortie au parc vendredi, il manque 10 gilets réfléchissants taille enfant.'),
  s('supplies', 'NORMAL', 'teacher', 'Papier affiche pour l’exposition', 'Pour l’exposition sur les saisons, la {classe} a besoin de 10 grandes feuilles de papier affiche de couleur.', { recent: true, waitsFor: 'START' }),
  s('supplies', 'MEDIUM', 'teacher', 'Calculatrices pour les évaluations', 'Les évaluations de calcul mental de la {classe} sont jeudi. Il manque 7 calculatrices simples.', { recent: true }),
  s('supplies', 'NORMAL', 'direction', 'Dossiers cartonnés pour le conseil d’école', 'Merci de préparer 15 dossiers cartonnés avec l’ordre du jour du conseil d’école de la semaine prochaine.'),

  // -------------------------------------------------------------------------
  // Surveillance et organisation des étages (circuit B, surveillants)
  // -------------------------------------------------------------------------
  s('supervision', 'HIGH', 'teacher', 'Surveillance pendant mon rendez-vous parent', 'J’ai un rendez-vous avec une famille à 11 h. Un surveillant peut-il rester avec la {classe} entre 11 h et 11 h 30 ? Les élèves feront une fiche en autonomie.', {
    messages: [{ after: 'APPROVE', by: 'requester', text: 'La fiche et la liste d’appel sont sur le bureau.' }],
  }),
  s('supervision', 'URGENT', 'teacher', 'Élève malade, besoin d’accompagnement à l’infirmerie', 'Un élève de la {classe} a de la fièvre et vomit. Je ne peux pas quitter la classe : besoin immédiat d’un surveillant pour l’accompagner à l’infirmerie.'),
  s('supervision', 'MEDIUM', 'teacher', 'Récréation agitée près des escaliers', 'Plusieurs élèves courent dans l’escalier du {etage} à chaque fin de récréation. Une présence en haut des marches entre 10 h et 10 h 15 serait utile.'),
  s('supervision', 'NORMAL', 'direction', 'Renfort pour l’accueil des familles', 'Journée portes ouvertes samedi matin : deux surveillants sont nécessaires à l’accueil entre 8 h 30 et 11 h.', { fate: 'reject', reason: 'Les surveillants du samedi sont déjà mobilisés ; l’accueil sera assuré par les enseignants volontaires.' }),
  s('supervision', 'HIGH', 'teacher', 'Garder la {classe} pendant la réunion de cycle', 'La réunion de cycle a été avancée à 15 h 30. Un surveillant peut-il prendre la {classe} en étude jusqu’à 16 h 30 ?'),
  s('supervision', 'NORMAL', 'bursar', 'Contrôle des sorties à la cantine', 'Des élèves au panier sortent du réfectoire avant la fin du service. Un surveillant pourrait-il se placer à la porte entre 12 h 15 et 12 h 45 cette semaine ?'),
  s('supervision', 'MEDIUM', 'teacher', 'Accompagner un élève au bus de 16 h', 'Un élève de la {classe} part en bus scolaire mercredi à 16 h, avant la fin de mon atelier. Merci de l’accompagner jusqu’au portail.'),
  s('supervision', 'URGENT', 'supervisor', 'Bagarre dans la cour du {etage}', 'Deux élèves se sont battus pendant la récréation, l’un saigne du nez. J’ai besoin d’un collègue pour gérer le groupe pendant que je les emmène.'),
  s('supervision', 'NORMAL', 'teacher', 'Surveillance de l’étude du soir', 'Jeudi, je ne pourrai pas assurer l’étude de 16 h 30. Un surveillant peut-il la prendre ? Les élèves sont une douzaine.', { fate: 'cancel', reason: 'Réunion déplacée, je garde l’étude.' }),
  s('supervision', 'MEDIUM', 'direction', 'Contrôle des entrées au portail', 'Des parents entrent dans l’établissement sans passer par l’accueil le matin. Il faut un surveillant au portail entre 7 h 45 et 8 h 15 toute la semaine.'),
  s('supervision', 'HIGH', 'teacher', 'Élève absent de l’appel après la récréation', 'Un élève de la {classe} n’est pas revenu en classe après la récréation de 10 h. Merci de vérifier les sanitaires et la cour du {etage}.', {
    messages: [{ after: 'ACCEPT', by: 'assignee', text: 'Trouvé à la bibliothèque, il croyait avoir un atelier. Je le raccompagne.' }],
  }),
  s('supervision', 'NORMAL', 'specialist', 'Encadrer le déplacement vers le gymnase', 'Pour la séance de 14 h, j’emmène deux classes au gymnase. Un surveillant pourrait-il fermer la marche dans la rue ?'),
  s('supervision', 'MEDIUM', 'teacher', 'Jeux dangereux sous le préau', 'Des élèves grimpent sur les grilles sous le préau pendant la pause de midi. Une surveillance plus proche serait nécessaire.', { recent: true, waitsFor: 'RESUME', fate: 'correction', reason: 'Les élèves grimpent encore à 13 h, après le changement de surveillant.' }),
  s('supervision', 'NORMAL', 'teacher', 'Garder deux élèves pendant la sortie', 'Deux élèves de la {classe} ne participent pas à la sortie de vendredi (pas d’autorisation). Qui peut les accueillir de 9 h à 12 h ?'),
  s('supervision', 'HIGH', 'supervisor', 'Couloir du {etage} encombré par des cartons', 'Des cartons de livraison bloquent la moitié du couloir du {etage} près de l’escalier de secours. Il faut une décision pour les déplacer.', { fate: 'reassign' }),
  s('supervision', 'NORMAL', 'teacher', 'Surveillance pendant l’évaluation commune', 'Pendant l’évaluation commune du niveau, je dois sortir 10 minutes pour récupérer des copies. Une présence à la porte de la {salle} suffirait.', { fate: 'draft' }),
  s('supervision', 'MEDIUM', 'bursar', 'Rangs à l’entrée du réfectoire', 'La file d’attente du réfectoire déborde dans le hall à 12 h. Un surveillant pour organiser les rangs par niveau aiderait beaucoup.', { recent: true }),
  s('supervision', 'NORMAL', 'teacher', 'Remplacement de surveillance de cour', 'Je suis de surveillance de cour vendredi mais j’accompagne la sortie. Pouvez-vous me remplacer de 10 h à 10 h 15 ?', { recent: true, waitsFor: 'APPROVE' }),

  // -------------------------------------------------------------------------
  // Restauration (circuit A, économe, clôture automatique)
  // -------------------------------------------------------------------------
  s('catering', 'HIGH', 'supervisor', 'Réfrigérateur de la cantine en panne', 'Le réfrigérateur du réfectoire affiche 11 °C ce matin. Les yaourts du midi y sont stockés.', { assist: { guideline: 'restauration' } }),
  s('catering', 'MEDIUM', 'supervisor', 'Organisation des paniers au rez-de-chaussée', 'Les paniers des élèves de préparatoire s’entassent sur une seule table. Pourrait-on prévoir des étagères ou des bacs par classe ?', {
    messages: [{ after: 'ACCEPT', by: 'assignee', text: 'J’ai commandé 8 bacs étiquetés, livraison jeudi.' }],
  }),
  s('catering', 'HIGH', 'teacher', 'Allergie d’un élève à signaler', 'Un élève de la {classe} a une allergie à l’arachide confirmée par certificat. Merci d’en informer l’équipe de cantine et de vérifier les menus.', { assist: { proposedPriority: 'MEDIUM', guideline: 'restauration' } }),
  s('catering', 'NORMAL', 'supervisor', 'Plateaux de cantine abîmés', 'Une quinzaine de plateaux sont fendus et coupants sur les bords. Je les ai retirés du service.'),
  s('catering', 'MEDIUM', 'headSupervisor', 'Changement de service d’un élève', 'Les parents d’une élève de 2e primaire demandent le passage du panier à la cantine à partir de lundi. Merci de mettre à jour la liste du réfectoire.'),
  s('catering', 'NORMAL', 'teacher', 'Micro-ondes pour les paniers', 'Les élèves au panier attendent longtemps pour réchauffer leur repas : un seul micro-ondes fonctionne sur trois.'),
  s('catering', 'HIGH', 'supervisor', 'Lave-vaisselle de la cantine hors service', 'Le lave-vaisselle affiche une erreur de vidange et refuse de démarrer. Il reste tout le service du midi à laver.', {
    messages: [{ after: 'ACCEPT', by: 'assignee', text: 'Vaisselle jetable fournie pour aujourd’hui, le dépanneur passe demain matin.' }],
  }),
  s('catering', 'NORMAL', 'supervisor', 'Inventaire des couverts du réfectoire', 'Pour la commande du trimestre, il faudrait recompter les couverts et les verres réellement utilisables au réfectoire.', { fate: 'decline', reason: 'Inventaire déjà fait la semaine dernière, je vous transmets le tableau.' }),
  s('catering', 'MEDIUM', 'teacher', 'Goûter de l’anniversaire de la classe', 'La {classe} fête les anniversaires du mois vendredi. Est-il possible de garder le gâteau au frais à la cantine jusqu’à 15 h ?'),
  s('catering', 'NORMAL', 'supervisor', 'Produits d’entretien du réfectoire', 'Il manque du produit désinfectant pour les tables du réfectoire et des sacs-poubelle de 100 L.'),
  s('catering', 'NORMAL', 'teacher', 'Repas froid pour la sortie scolaire', 'La {classe} part en sortie jeudi toute la journée. Les élèves à la cantine auront-ils un repas froid ? Nous sommes 24.'),
  s('catering', 'MEDIUM', 'supervisor', 'Bancs du réfectoire instables', 'Deux bancs du réfectoire basculent quand les élèves s’assoient à une extrémité.', { fate: 'decline', reason: 'Le mobilier relève de la maintenance : merci de passer par une demande au technicien.' }),
  s('catering', 'NORMAL', 'headSupervisor', 'Liste des élèves au panier à mettre à jour', 'Trois élèves ont changé de service ce mois-ci. Merci d’envoyer la liste à jour des élèves au panier aux surveillants du midi.', { recent: true }),
  s('catering', 'NORMAL', 'teacher', 'Fontaines à eau du réfectoire', 'Les élèves de la {classe} disent que l’eau de la fontaine du réfectoire a un goût de plastique depuis lundi.', { recent: true }),

  // -------------------------------------------------------------------------
  // Entraide entre enseignants (circuit A, d'un enseignant à un autre)
  // -------------------------------------------------------------------------
  s('peer', 'NORMAL', 'teacher', 'Échange de manuels de mathématiques', 'Bonjour {collegue}, peux-tu me prêter tes 6 manuels de mathématiques en trop pour la semaine prochaine ? Je te les rends vendredi.'),
  s('peer', 'NORMAL', 'teacher', 'Prendre mes élèves en décloisonnement', 'Bonjour {collegue}, pourrais-tu accueillir 5 élèves de la {classe} mardi de 9 h à 10 h pour l’atelier de lecture à voix haute ?', {
    messages: [{ after: 'ACCEPT', by: 'assignee', text: 'Oui, envoie-les avec leur cahier de lecture.' }],
  }),
  s('peer', 'MEDIUM', 'teacher', 'Fiches d’évaluation communes du niveau', 'Bonjour {collegue}, peux-tu relire les fiches d’évaluation communes avant jeudi ? Je les imprime vendredi matin.'),
  s('peer', 'NORMAL', 'teacher', 'Prêt du matériel de sciences', 'Bonjour {collegue}, je voudrais emprunter le kit d’électricité (piles et ampoules) pour ma séance de mercredi.'),
  s('peer', 'NORMAL', 'specialist', 'Créneau de répétition pour le spectacle', 'Bonjour {collegue}, est-ce que je peux prendre ta classe 20 minutes jeudi après-midi pour répéter le chant du spectacle ?'),
  s('peer', 'NORMAL', 'teacher', 'Partage de la progression en grammaire', 'Bonjour {collegue}, pourrais-tu m’envoyer ta progression de grammaire de la période 2 ? J’aimerais harmoniser avec la mienne.', { fate: 'cancel', reason: 'Je l’ai trouvée dans le dossier partagé du niveau.' }),
  s('peer', 'MEDIUM', 'teacher', 'Remplacer ma surveillance de cantine', 'Bonjour {collegue}, peux-tu me remplacer pour la surveillance de cantine de lundi midi ? Je prendrai ton tour de jeudi.'),
  s('peer', 'NORMAL', 'teacher', 'Préparer la sortie au musée ensemble', 'Bonjour {collegue}, on pourrait coordonner la sortie au musée : je propose qu’on se voie mardi à 16 h 45 pour la liste des accompagnateurs.'),
  s('peer', 'NORMAL', 'teacher', 'Correction croisée des dictées', 'Bonjour {collegue}, est-ce que tu veux bien corriger les dictées de mes élèves pendant que je prends les tiennes ? Cela évite les biais.', { fate: 'decline', reason: 'Je suis en formation jeudi et vendredi, on peut le faire la semaine prochaine.' }),
  s('peer', 'NORMAL', 'specialist', 'Salle de classe pour l’anglais', 'Bonjour {collegue}, ta salle est libre mercredi de 10 h à 11 h ? La salle d’anglais est occupée par l’atelier théâtre.'),
  s('peer', 'NORMAL', 'teacher', 'Album de jeunesse à emprunter', 'Bonjour {collegue}, peux-tu me prêter l’album sur les émotions que tu as lu à ta classe ? Je voudrais l’utiliser lundi.'),
  s('peer', 'MEDIUM', 'teacher', 'Accueillir un élève exclu temporairement', 'Bonjour {collegue}, pourrais-tu accueillir un élève de la {classe} dans ta classe cet après-midi ? Il a besoin de se calmer, il aura du travail.', { recent: true, fate: 'correction', reason: 'L’élève est revenu sans le travail demandé ; peux-tu vérifier qu’il le termine ?' }),
  s('peer', 'NORMAL', 'teacher', 'Photocopies pour le niveau', 'Bonjour {collegue}, je fais les photocopies du niveau demain : as-tu besoin de quelque chose en plus de la fiche de calcul ?', { fate: 'draft' }),
  s('peer', 'NORMAL', 'teacher', 'Jeu de société pour la pluie', 'Bonjour {collegue}, peux-tu me prêter deux jeux de société pour la récréation en classe, il pleut encore aujourd’hui ?', { recent: true }),

  // -------------------------------------------------------------------------
  // Activités, salles et événements (circuit B)
  // -------------------------------------------------------------------------
  s('organisation', 'MEDIUM', 'teacher', 'Préparer la salle polyvalente pour le spectacle', 'Le spectacle de la {classe} a lieu vendredi à 14 h dans la salle polyvalente. Il faudrait 60 chaises en rangées et l’estrade installée.', { assignTo: 'technician' }),
  s('organisation', 'NORMAL', 'teacher', 'Réserver la bibliothèque mardi matin', 'Je souhaite réserver la bibliothèque mardi de 9 h à 10 h 30 pour un rallye lecture avec la {classe}.', { assignTo: 'supervisor' }),
  s('organisation', 'HIGH', 'direction', 'Préparer la visite de l’inspection', 'L’inspection visite l’établissement lundi à 9 h. Merci de préparer la salle de réunion (vidéoprojecteur, 10 places, eau) et de vérifier la propreté des couloirs.', { assignTo: 'technician' }),
  s('organisation', 'NORMAL', 'specialist', 'Matériel sonore pour la fête d’automne', 'Pour la fête d’automne, j’ai besoin de la sono, de deux micros et d’une rallonge dans la cour à partir de 13 h.', { assignTo: 'it' }),
  s('organisation', 'MEDIUM', 'teacher', 'Salle disponible pour l’atelier cuisine', 'La salle prévue pour l’atelier cuisine de la {classe} est occupée par les vaccinations jeudi. Une autre salle avec un point d’eau est-elle libre ?', { assignTo: 'supervisor' }),
  s('organisation', 'NORMAL', 'bursar', 'Livraison des manuels de novembre', 'Le transporteur livre 40 cartons de manuels mercredi à 8 h. Il faut un passage dégagé et deux personnes pour le déchargement.', { assignTo: 'technician' }),
  s('organisation', 'NORMAL', 'teacher', 'Exposition des travaux dans le hall', 'La {classe} voudrait exposer ses dessins dans le hall pendant deux semaines. Pourrait-on installer les grilles d’exposition ?', { assignTo: 'technician', fate: 'reject', reason: 'Le hall est réservé à l’exposition du concours de dessin jusqu’au 15 novembre ; à reprogrammer.' }),
  s('organisation', 'MEDIUM', 'teacher', 'Ordinateurs pour l’atelier numérique', 'Pour l’atelier numérique de jeudi, il faudrait 12 ordinateurs portables chargés dans la {salle} avec le logiciel de dessin.', { assignTo: 'it' }),
  s('organisation', 'NORMAL', 'direction', 'Réunion de rentrée des délégués de parents', 'Organiser la réunion des délégués de parents mercredi 17 h 30 : salle de réunion, café, badges nominatifs.', { assignTo: 'bursar' }),
  s('organisation', 'HIGH', 'teacher', 'Salle inondée, besoin d’une salle de repli', 'La {salle} est inutilisable à cause de l’infiltration. Il faut une salle de repli pour la {classe} dès demain matin.', { assignTo: 'supervisor' }),
  s('organisation', 'NORMAL', 'specialist', 'Tracer les couloirs de course', 'Pour le cross de l’école, il faudrait tracer les couloirs de course dans la cour et installer les plots.', { assignTo: 'technician', fate: 'cancel', reason: 'Cross reporté au printemps à cause des travaux de la cour.' }),
  s('organisation', 'MEDIUM', 'teacher', 'Photographe de classe : organisation du passage', 'Le photographe passe jeudi. Merci de prévoir l’ordre de passage des classes du {etage} et un fond neutre dans la salle polyvalente.', { recent: true, assignTo: 'supervisor' }),
  s('organisation', 'NORMAL', 'bursar', 'Remise des fournitures aux nouveaux élèves', 'Prévoir une table et une personne au hall jeudi de 8 h à 9 h pour remettre leurs fournitures aux 9 nouveaux élèves.', { recent: true, assignTo: 'supervisor' }),
  s('organisation', 'NORMAL', 'teacher', 'Intervention d’un parent pompier', 'Un parent pompier intervient dans la {classe} lundi à 10 h. Il faut l’accueillir au portail et prévoir un badge visiteur.', { assignTo: 'supervisor', fate: 'reassign' }),
  s('organisation', 'MEDIUM', 'direction', 'Exercice d’évacuation incendie', 'Exercice d’évacuation prévu vendredi à 10 h 30 : vérifier les alarmes, les plans d’évacuation affichés et le point de rassemblement.', { recent: true, assignTo: 'technician' }),
  s('organisation', 'NORMAL', 'teacher', 'Tables pour le marché de Noël', 'Pour préparer le marché de Noël, la {classe} aimerait disposer de deux grandes tables dans le hall le 5 décembre.', { assignTo: 'technician', fate: 'draft' }),
];
