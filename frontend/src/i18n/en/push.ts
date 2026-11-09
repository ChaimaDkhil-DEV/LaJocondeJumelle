/** Notifications push et préférences (spec 014). */
export const push: Record<string, string> = {
  // Section « Notifications » : cet appareil.
  'Cet appareil': 'This device',
  'Les notifications push ne sont pas activées par l’établissement.': 'Push notifications are not enabled by the school.',
  'Cet appareil ou ce navigateur ne permet pas les notifications push. Les notifications restent visibles dans l’application.':
    'This device or browser does not support push notifications. Notifications remain visible in the app.',
  'Sur iPhone et iPad (iOS 16.4 ou plus récent), ajoutez d’abord l’application à l’écran d’accueil :':
    'On iPhone and iPad (iOS 16.4 or later), first add the app to the Home Screen:',
  'Installer l’application sur l’écran d’accueil': 'Install the app on the Home Screen',
  'Touchez « Partager ».': 'Tap “Share”.',
  'Choisissez « Sur l’écran d’accueil ».': 'Choose “Add to Home Screen”.',
  'Ouvrez l’application depuis l’écran d’accueil, puis revenez ici.': 'Open the app from the Home Screen, then come back here.',
  'Vous avez refusé les notifications pour ce site. Réactivez-les dans les réglages du navigateur ou du téléphone.':
    'You have blocked notifications for this site. Turn them back on in your browser or phone settings.',
  'Les notifications de cet appareil doivent être réactivées.': 'Notifications on this device need to be turned back on.',
  'Les notifications push sont désactivées sur cet appareil.': 'Push notifications are off on this device.',
  'Les notifications push sont actives sur cet appareil.': 'Push notifications are on for this device.',
  'Activer les notifications sur cet appareil': 'Turn on notifications on this device',
  'Désactiver sur cet appareil': 'Turn off on this device',
  'Sur un appareil partagé, déconnectez-vous en partant : sinon vos notifications continuent d’y arriver.':
    'On a shared device, log out when you leave: otherwise your notifications keep arriving on it.',
  'Activation impossible. Vérifiez votre connexion puis réessayez.': 'Could not turn on notifications. Check your connection and try again.',
  'Désactivation impossible. Réessayez.': 'Could not turn off notifications. Try again.',
  // Catégories et son des urgences (US3).
  'Demandes de travail urgentes.': 'Urgent work requests.',
  Couverture: 'Coverage',
  'Affectations, classes vides, retards et absences signalés, relèves.':
    'Assignments, empty classes, reported delays and absences, handovers.',
  'Gardes restées sans surveillant et alertes non traitées.': 'Coverage left without a supervisor and unhandled alerts.',
  Pointage: 'Attendance',
  'Arrivée de l’enseignant sur votre garde et anomalies de pointage.': 'Teacher arrival on your coverage and attendance anomalies.',
  'Ces choix s’appliquent à tous vos appareils abonnés.': 'These choices apply to all your subscribed devices.',
  'Son des urgences': 'Urgent sound',
  'Signal sonore pour les urgences': 'Sound signal for urgent notifications',
  'Deux notes brèves quand une notification urgente arrive dans l’application.':
    'Two short notes when an urgent notification arrives in the app.',
  'Préférence enregistrée.': 'Preference saved.',
  'La préférence n’a pas pu être enregistrée. Réessayez.': 'The preference could not be saved. Try again.',
  // Plage d'envoi (US4) : réglages du super administrateur et rappel dans « Mon profil ».
  'Plage d’envoi des notifications push': 'Push notification hours',
  'Heure de l’école. En dehors de cette plage, aucune notification push n’est envoyée ni différée ; les notifications restent dans l’application. Les signalements de retard arrivent souvent avant 07:30.':
    'School time. Outside these hours, no push notification is sent or postponed; notifications stay in the app. Lateness reports often arrive before 07:30.',
  'Notifications push : activées': 'Push notifications: on',
  'Notifications push : désactivées (clés non configurées)': 'Push notifications: off (keys not configured)',
  'Jours d’envoi des notifications push': 'Push notification days',
  'Choisissez au moins un jour.': 'Choose at least one day.',
  'L’heure de fin doit être après l’heure de début.': 'The end time must be after the start time.',
  Lundi: 'Monday',
  Mardi: 'Tuesday',
  Mercredi: 'Wednesday',
  Jeudi: 'Thursday',
  Vendredi: 'Friday',
  Samedi: 'Saturday',
  Dimanche: 'Sunday',
  lundi: 'Monday',
  mardi: 'Tuesday',
  mercredi: 'Wednesday',
  jeudi: 'Thursday',
  vendredi: 'Friday',
  samedi: 'Saturday',
  dimanche: 'Sunday',
  'tous les jours': 'every day',
  'du {first} au {last}': 'from {first} to {last}',
  'le {day}': 'on {day}',
  'Envoi {days}, de {start} à {end} (heure de l’école). En dehors, les notifications restent dans l’application.':
    'Sent {days}, from {start} to {end} (school time). Outside these hours, notifications stay in the app.',
  // Mes appareils (US5).
  'Mes appareils': 'My devices',
  'Aucun appareil abonné.': 'No subscribed device.',
  'Activé le {date}': 'Turned on {date}',
  'Dernière utilisation le {date}': 'Last used {date}',
  'Retirer {device}': 'Remove {device}',
  'Retirer cet appareil ?': 'Remove this device?',
  'Retrait impossible. Réessayez.': 'Could not remove the device. Try again.',
  '{device} ne recevra plus vos notifications push.': '{device} will no longer receive your push notifications.',
  // Messages d'erreur du serveur (backend/src/common/errors.ts, push-subscriptions.service.ts).
  'Vous avez déjà 10 appareils abonnés. Retirez-en un pour activer celui-ci.':
    'You already have 10 subscribed devices. Remove one to turn this one on.',
  'Adresse d’envoi refusée : service de notifications non reconnu.': 'Delivery address refused: unrecognised notification service.',
  'Clés d’abonnement invalides.': 'Invalid subscription keys.',
};
