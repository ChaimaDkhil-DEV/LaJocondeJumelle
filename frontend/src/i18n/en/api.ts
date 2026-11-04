export const api: Record<string, string> = {
  // backend/src/common/errors.ts (ERROR_CATALOG)
  'Certaines informations sont manquantes ou invalides.': 'Some information is missing or invalid.',
  'Votre session a expiré. Veuillez vous reconnecter.': 'Your session has expired. Please sign in again.',
  'Identifiant ou mot de passe incorrect.': 'Incorrect username or password.',
  'Vous n’avez pas le droit d’effectuer cette action.': 'You do not have permission to perform this action.',
  'Vous devez changer votre mot de passe avant de continuer.': 'You must change your password before continuing.',
  'Élément introuvable.': 'Item not found.',
  'Cet élément existe déjà.': 'This item already exists.',
  'Cette action n’est pas possible dans le statut actuel de la demande.':
    'This action is not possible in the request’s current status.',
  'La demande a été modifiée entre-temps. Elle a été rechargée.':
    'The request was changed in the meantime. It has been reloaded.',
  'Le fichier est trop volumineux.': 'The file is too large.',
  'Ce type de fichier n’est pas accepté.': 'This file type is not accepted.',
  'Ce destinataire ne peut pas recevoir les demandes de cette catégorie.':
    'This recipient cannot receive requests in this category.',
  'Choisissez l’employé qui réalisera la demande.': 'Choose the employee who will carry out the request.',
  'La personne désignée pour cette catégorie n’est plus disponible. Choisissez l’employé qui réalisera la demande.':
    'The person assigned to this category is no longer available. Choose the employee who will carry out the request.',
  'Une photo de preuve est obligatoire pour terminer cette demande.':
    'A proof photo is required to complete this request.',
  'Un motif ou un commentaire est obligatoire.': 'A reason or comment is required.',
  'Ajoutez un message vocal ou une description écrite.': 'Add a voice message or a written description.',
  'Le message vocal dépasse la durée maximale autorisée.': 'The voice message exceeds the maximum allowed length.',
  'Le message vocal est trop court.': 'The voice message is too short.',
  'Cette garde a déjà été prise.': 'This coverage has already been taken.',
  'Cet employé n’est pas disponible : il a déjà une garde en cours sur ce créneau ou est indisponible.':
    'This employee is not available: they already have a coverage in progress during this time slot or are unavailable.',
  'La preuve de présence demandée est manquante (photo ou QR code de la classe).':
    'The requested proof of attendance is missing (photo or the class QR code).',
  'Ce QR code n’est pas valide ou a été révoqué. Demandez le QR code à jour.':
    'This QR code is not valid or has been revoked. Ask for the current QR code.',
  'Ce QR code correspond à une autre classe que celle de votre garde.':
    'This QR code belongs to a different class than your coverage.',
  'Durée invalide.': 'Invalid duration.',
  'Cette action n’existe pas pour une affectation.': 'This action does not exist for an assignment.',
  'Ce groupe est utilisé par le module des affectations : il ne peut être ni supprimé ni désactivé.':
    'This group is used by the assignments module: it cannot be deleted or deactivated.',
  'La demande a déjà été prise en charge : elle ne peut plus être modifiée ni retirée.':
    'The request has already been taken on: it can no longer be edited or withdrawn.',
  'La date doit être aujourd’hui ou demain.': 'The date must be today or tomorrow.',
  'Le créneau est invalide : la fin doit suivre le début et ne pas être déjà passée.':
    'The time slot is invalid: the end must come after the start and must not already be in the past.',
  'Cette classe est introuvable ou désactivée.': 'This class was not found or is deactivated.',
  'Trop de tentatives. Patientez une minute avant de réessayer.': 'Too many attempts. Wait a minute before trying again.',
  'Les propositions automatiques ne sont pas disponibles.': 'Automatic suggestions are not available.',
  'Les propositions ne sont pas disponibles pour le moment. Vous pouvez remplir la demande vous-même.':
    'Suggestions are not available right now. You can fill in the request yourself.',
  'Vous avez demandé beaucoup de propositions. Patientez quelques minutes avant de réessayer.':
    'You have asked for a lot of suggestions. Wait a few minutes before trying again.',
  'Aucune parole n’a été reconnue dans le message vocal.': 'No speech was recognized in the voice message.',
  'Une erreur inattendue est survenue. Réessayez plus tard.': 'An unexpected error occurred. Please try again later.',

  // Custom messages passed to AppException
  'Catégorie de garde introuvable ou désactivée.': 'Coverage category not found or deactivated.',
  'Vous êtes déclaré absent : seul un admin peut modifier ce statut.':
    'You are declared absent: only an admin can change this status.',
  'Cette demande est terminée : il n’est plus possible d’y répondre.':
    'This request is closed: it is no longer possible to reply.',
  'Vous consultez cette demande : seuls le demandeur et la personne affectée y échangent.':
    'You are viewing this request: only the requester and the assigned person can exchange messages here.',
  'Écrivez un message, enregistrez un vocal ou joignez un fichier.':
    'Write a message, record a voice message or attach a file.',
  'La photo ne doit pas dépasser 2 Mo.': 'The photo must not exceed 2 MB.',
  'Formats acceptés : JPG, PNG ou WebP.': 'Accepted formats: JPG, PNG or WebP.',
  'Cette image est illisible ou endommagée. Choisissez une autre photo.':
    'This image is unreadable or damaged. Choose another photo.',
  'Le format HEIC n’est pas accepté. Choisissez une photo JPG, PNG ou WebP.':
    'The HEIC format is not accepted. Choose a JPG, PNG or WebP photo.',
  'Le format HEIC n’est pas accepté. Sur iPhone, choisissez la photo depuis le bouton « Choisir dans la galerie » ou réglez l’appareil photo sur « Le plus compatible ».':
    'The HEIC format is not accepted. On iPhone, choose the photo with the “Choose from gallery” button or set the camera to “Most Compatible”.',
  'Vous ne pouvez changer que votre propre photo.': 'You can only change your own photo.',
  'Cet identifiant est déjà utilisé.': 'This username is already in use.',
  'Ce nom de catégorie existe déjà.': 'This category name already exists.',
  'Cet étage existe déjà.': 'This floor already exists.',
  'Ce nom de groupe existe déjà.': 'This group name already exists.',
  'Cette classe existe déjà.': 'This class already exists.',

  // Field validation (services)
  'Choisissez une catégorie de demande de travail.': 'Choose a work request category.',
  'Le circuit ne correspond pas au mode de routage choisi.': 'The circuit does not match the chosen routing mode.',
  'Le type de catégorie (travail ou couverture) ne peut pas être modifié après sa création.':
    'The category type (work or coverage) cannot be changed after it is created.',
  'L’employé désigné pour l’affectation automatique doit rester parmi les destinataires.':
    'The employee designated for automatic assignment must remain among the recipients.',
  'Seuls les admins et super administrateurs peuvent gérer une catégorie.':
    'Only admins and super administrators can manage a category.',
  'Une règle par priorité est attendue.': 'One rule per priority is expected.',
  'Le circuit direct n’a pas de délai de validation administrative.':
    'The direct circuit has no administrative validation deadline.',
  'Le délai d’arrivée en classe ne concerne que les couvertures.':
    'The arrival-in-class deadline only applies to coverages.',
  'Une couverture n’a pas de délai de réalisation : utilisez le délai d’arrivée en classe.':
    'A coverage has no completion deadline: use the arrival-in-class deadline.',
  'Une catégorie de couverture n’a pas de mode de routage.': 'A coverage category has no routing mode.',
  'Une catégorie de couverture utilise le circuit direct.': 'A coverage category uses the direct circuit.',
  'Une couverture est prise par le premier employé disponible.':
    'A coverage is taken by the first available employee.',
  'Seuls les admins et le super administrateur créent des affectations.':
    'Only admins and the super administrator create assignments.',
  'Sans validation par l’administration, la clôture revient au demandeur ou se fait automatiquement.':
    'Without administrative validation, closing is done by the requester or happens automatically.',
  'La validation finale n’existe qu’en circuit B.': 'Final validation only exists in circuit B.',
  'L’affectation automatique n’existe qu’en circuit B.': 'Automatic assignment only exists in circuit B.',
  'Choisissez l’employé qui recevra automatiquement les demandes.':
    'Choose the employee who will automatically receive the requests.',
  'L’employé désigné doit d’abord faire partie des destinataires de la catégorie.':
    'The designated employee must first be one of the category’s recipients.',
  'Un des comptes choisis est introuvable ou désactivé.': 'One of the selected accounts was not found or is deactivated.',
  'Curseur invalide': 'Invalid cursor',
  'Entier supérieur ou égal à 1 attendu': 'An integer greater than or equal to 1 is expected',
  'Choisissez l’enseignant concerné, ou « non précisé ».': 'Choose the teacher concerned, or “not specified”.',
  'Cet enseignant n’appartient pas au groupe Enseignants.': 'This teacher does not belong to the Teachers group.',
  'Ce renfort est introuvable ou déjà libéré.': 'This reinforcement was not found or has already been released.',
  'Photo introuvable. Reprenez la photo puis réessayez.': 'Photo not found. Retake the photo and try again.',
  'Étage introuvable ou désactivé.': 'Floor not found or deactivated.',
  'Non modifiable pendant la présence en classe.': 'Cannot be changed while attendance in class is in progress.',
  'L’heure de début doit être comprise entre 12 h avant et 7 jours après maintenant.':
    'The start time must be between 12 hours ago and 7 days from now.',
  'Indiquez l’heure de fin ou une durée.': 'Enter an end time or a duration.',
  'Indiquez l’heure de fin ou une durée, pas les deux.': 'Enter an end time or a duration, not both.',
  'Message vocal introuvable. Enregistrez-le de nouveau.': 'Voice message not found. Record it again.',
  'Le début de période doit précéder la fin': 'The start of the period must come before the end',
  'Fuseau horaire inconnu': 'Unknown time zone',
  'Pièce jointe introuvable. Ajoutez-la de nouveau.': 'Attachment not found. Add it again.',
  'Catégorie introuvable.': 'Category not found.',
  'Les brouillons sont désactivés.': 'Drafts are disabled.',
  'Choisissez une priorité différente.': 'Choose a different priority.',
  'Choisissez un autre enseignant que vous-même.': 'Choose a teacher other than yourself.',
  'Choisissez une classe active d’un niveau scolaire.': 'Choose an active class of a school level.',
  'Vous ne pouvez pas désactiver votre propre compte.': 'You cannot deactivate your own account.',
  'Vous ne pouvez pas retirer votre propre rôle de super administrateur.':
    'You cannot remove your own super administrator role.',
  'Utilisez « Changer mon mot de passe » pour votre propre compte.':
    'Use “Change my password” for your own account.',
  'Une des catégories choisies est introuvable.': 'One of the selected categories was not found.',
  'Un compte désactivé ne peut pas devenir destinataire d’une catégorie.':
    'A deactivated account cannot become a recipient of a category.',
  'Mot de passe actuel incorrect.': 'Current password is incorrect.',
  'Indiquez soit des identifiants, soit « all: true ».': 'Provide either identifiers or “all: true”.',
  'Fichier manquant': 'Missing file',
  'Choisissez une photo.': 'Choose a photo.',
  'Objet attendu.': 'An object is expected.',
  'Réglage inconnu.': 'Unknown setting.',
  'Rôle non paramétrable.': 'This role cannot be configured.',
  'Oui ou non attendu.': 'Yes or no expected.',
  'Heure au format HH:MM attendue.': 'Time in HH:MM format expected.',
  'Nombre entier entre 10 et 600 secondes attendu.': 'A whole number between 10 and 600 seconds is expected.',
  'Nombre entier entre 100 Ko et 25 Mo attendu.': 'A whole number between 100 KB and 25 MB is expected.',
  'Nombre entier entre 1 et 10 attendu.': 'A whole number between 1 and 10 is expected.',
  'Nombre entier entre 1 et 99 % attendu.': 'A whole number between 1 and 99% is expected.',
  'Nombre entier entre 5 et 1440 minutes attendu.': 'A whole number between 5 and 1440 minutes is expected.',
  'Nombre entier entre 1 et 72 heures attendu.': 'A whole number between 1 and 72 hours is expected.',
  'Nombre entier entre 5 et 720 minutes attendu.': 'A whole number between 5 and 720 minutes is expected.',
  'Nombre entier entre 1 et 120 minutes attendu.': 'A whole number between 1 and 120 minutes is expected.',
  'Nombre entier entre 1 et 240 minutes attendu.': 'A whole number between 1 and 240 minutes is expected.',
  'Nombre entier entre 1 et 60 mois attendu.': 'A whole number between 1 and 60 months is expected.',
  'Au moins un type parmi : image/jpeg, image/png, image/webp.':
    'At least one type among: image/jpeg, image/png, image/webp.',
  'Au moins un type parmi : application/pdf.': 'At least one type among: application/pdf.',

  // DTO validation (class-validator)
  'Écrivez une description ou enregistrez un vocal.': 'Write a description or record a voice message.',
  'Le texte ne doit pas dépasser 4 000 caractères.': 'The text must not exceed 4,000 characters.',
  'Catégorie invalide.': 'Invalid category.',
  'Le titre est obligatoire.': 'The title is required.',
  'Le titre ne doit pas dépasser 120 caractères.': 'The title must not exceed 120 characters.',
  'Le texte est obligatoire.': 'The text is required.',
  'Le nouveau mot de passe doit contenir au moins 12 caractères.': 'The new password must be at least 12 characters long.',
  'Le nom est obligatoire.': 'The name is required.',
  'Le nom ne doit pas dépasser 60 caractères.': 'The name must not exceed 60 characters.',
  'Le nom ne doit pas dépasser 100 caractères.': 'The name must not exceed 100 characters.',
  'Au moins un rôle doit pouvoir créer des demandes.': 'At least one role must be able to create requests.',
  'Le délai avant clôture automatique ne peut pas être négatif.': 'The delay before automatic closing cannot be negative.',
  'Nombre entier de minutes attendu (ou vide).': 'A whole number of minutes is expected (or leave empty).',
  'Un délai doit être d’au moins 1 minute.': 'A deadline must be at least 1 minute.',
  'Une règle par priorité est attendue (4).': 'One rule per priority is expected (4).',
  'Type attendu : retard, absence ou classe vide.': 'Expected type: delay, absence or empty class.',
  'Date attendue (AAAA-MM-JJ).': 'Date expected (YYYY-MM-DD).',
  'Choisissez la classe.': 'Choose the class.',
  'Heure de début attendue (HH:MM).': 'Start time expected (HH:MM).',
  'Heure de fin attendue (HH:MM).': 'End time expected (HH:MM).',
  'Type attendu : retard ou absence.': 'Expected type: delay or absence.',
  'Durée en minutes attendue.': 'Duration in minutes expected.',
  'La durée doit être d’au moins 5 minutes.': 'The duration must be at least 5 minutes.',
  'La durée ne doit pas dépasser 12 heures.': 'The duration must not exceed 12 hours.',
  'Décision attendue : CONFIRM ou REJECT.': 'Decision expected: CONFIRM or REJECT.',
  'Choisissez l’étage de la classe.': 'Choose the class’s floor.',
  'Position entière attendue.': 'A whole-number position is expected.',
  'Le message ne doit pas dépasser 4 000 caractères.': 'The message must not exceed 4,000 characters.',
  'Le prénom est obligatoire.': 'The first name is required.',
  'Le prénom ne doit pas dépasser 60 caractères.': 'The first name must not exceed 60 characters.',
  'Choisissez la classe de l’élève.': 'Choose the student’s class.',
  'Numéro invalide : chiffres et espaces, « + » possible au début (8 à 20 caractères).':
    'Invalid number: digits and spaces, with an optional “+” at the start (8 to 20 characters).',
  'Choisissez le service de restauration : cantine ou panier.': 'Choose the meal service: canteen or packed lunch.',
  'L’identifiant doit comporter au moins 3 caractères.': 'The username must be at least 3 characters long.',
  'L’identifiant ne doit pas dépasser 64 caractères.': 'The username must not exceed 64 characters.',
  'L’identifiant ne peut contenir que des lettres sans accent, chiffres, points, tirets et soulignés.':
    'The username can only contain unaccented letters, digits, dots, hyphens and underscores.',
  'La fonction ne doit pas dépasser 100 caractères.': 'The job title must not exceed 100 characters.',
  'Rôle inconnu.': 'Unknown role.',
  'Catégorie inconnue.': 'Unknown category.',
  'Étage inconnu.': 'Unknown floor.',
};
