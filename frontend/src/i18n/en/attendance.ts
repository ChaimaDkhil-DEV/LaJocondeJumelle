export const attendance: Record<string, string> = {
  // Tabs and QR entry page
  'Présences': 'Attendance',
  'Mes présences': 'My attendance',
  'Chargement de la classe': 'Loading the class',
  'Enregistrer mon arrivée': 'Record my arrival',
  'Je suis ici en tant que surveillant': 'I am here as a supervisor',
  'Heure actuelle du serveur : {time}': 'Current server time: {time}',
  'Vous avez annoncé un retard pour cette classe : votre arrivée y sera rattachée.':
    'You announced a lateness for this class: your arrival will be linked to it.',
  'Vous avez annoncé une absence couvrant ce moment. Si vous êtes bien présent(e), l’admin sera prévenue.':
    'You announced an absence covering this time. If you are indeed present, the admin will be notified.',
  'Vous êtes le remplaçant autorisé : votre présence est enregistrée à votre nom.':
    'You are the authorized substitute: your presence is recorded under your name.',
  'Votre arrivée sera enregistrée à l’heure du serveur.': 'Your arrival will be recorded at the server time.',
  'Votre arrivée est enregistrée.': 'Your arrival is recorded.',
  'Votre arrivée était déjà enregistrée pour aujourd’hui.': 'Your arrival was already recorded for today.',
  'Heure du scan': 'Scan time',
  'L’heure enregistrée est celle du serveur au moment du scan.': 'The recorded time is the server’s time at the moment of the scan.',
  'L’arrivée n’a pas pu être enregistrée. Réessayez.': 'The arrival could not be recorded. Please try again.',

  // Statuses and labels
  'Arrivée enregistrée': 'Arrival recorded',
  'Présent': 'Present',
  'Scan du QR code': 'QR code scan',
  'Saisie de l’admin': 'Entered by the admin',
  'Retard annoncé : {minutes} min après l’heure indiquée': 'Announced lateness: {minutes} min after the stated time',
  'Remplacement de {name}': 'Substituting for {name}',
  'Absence annoncée : à vérifier': 'Announced absence: to be checked',
  'Absence annoncée': 'Announced absence',
  'Absence annoncée mais enseignant présent': 'Absence announced but teacher present',
  'Enseignant arrivé': 'Teacher arrived',

  // My attendance
  'Scannez le QR code affiché dans la classe, avec cette application ou l’appareil photo de votre téléphone.':
    'Scan the QR code displayed in the classroom, with this app or your phone’s camera.',
  'Scanner QR Code': 'Scan QR Code',
  'Chargement de vos présences': 'Loading your attendance',
  'Impossible de charger vos présences.': 'Could not load your attendance.',
  'Aucune présence enregistrée': 'No attendance recorded',
  'Votre arrivée en classe apparaîtra ici après le scan du QR code.': 'Your arrival in class will appear here after you scan the QR code.',
  'Saisi par {name}': 'Entered by {name}',

  // QR scanner
  'Scanner le QR code de la classe': 'Scan the class QR code',
  'La caméra ne s’ouvre que sur une adresse sécurisée (https) : prenez une photo du QR code, ou ouvrez l’application par son adresse https.':
    'The camera only opens on a secure (https) address: take a photo of the QR code, or open the app at its https address.',
  'La caméra n’est pas disponible dans ce navigateur : prenez une photo du QR code, ou ouvrez le lien dans Safari ou Chrome.':
    'The camera is not available in this browser: take a photo of the QR code, or open the link in Safari or Chrome.',
  'L’accès à la caméra est refusé : autorisez la caméra pour ce site dans les réglages du navigateur, ou prenez une photo du QR code.':
    'Camera access is denied: allow the camera for this site in the browser settings, or take a photo of the QR code.',
  'Aucune caméra n’a été trouvée sur cet appareil : choisissez une photo du QR code, ou collez son lien ou son code.':
    'No camera was found on this device: choose a photo of the QR code, or paste its link or code.',
  'La caméra est déjà utilisée par une autre application : fermez-la, puis rouvrez le scan, ou prenez une photo du QR code.':
    'The camera is already in use by another app: close it, then reopen the scan, or take a photo of the QR code.',
  'La caméra n’a pas pu s’ouvrir : prenez une photo du QR code, ou collez son lien ou son code.':
    'The camera could not open: take a photo of the QR code, or paste its link or code.',
  'Image de la caméra : placez le QR code de la classe dans le cadre': 'Camera image: place the class QR code in the frame',
  'Ce QR code n’est pas celui d’une classe.': 'This QR code is not a class QR code.',
  'Prendre une photo du QR code': 'Take a photo of the QR code',
  'Lecture de la photo…': 'Reading the photo…',
  'Aucun QR code n’a été trouvé sur la photo : reprenez-la de plus près, avec le QR code entier et net.':
    'No QR code was found in the photo: take it again from closer, with the whole QR code sharp.',
  'Cette photo n’a pas pu être lue : reprenez-la, ou collez le lien ou le code du QR code.':
    'This photo could not be read: take it again, or paste the QR code link or code.',
  'Saisir le lien ou le code du QR code': 'Enter the QR code link or code',
  'Lien ou code du QR code': 'QR code link or code',
  'Ce lien ou ce code n’est pas celui d’un QR code de classe.': 'This link or code is not a class QR code.',
  'Continuer': 'Continue',

  // Admin follow-up
  'Suivi des présences': 'Attendance tracking',
  'Les arrivées sont enregistrées automatiquement au scan. Intervenez seulement pour un oubli de scan : un défaut de scan n’est jamais une absence.':
    'Arrivals are recorded automatically on scan. Step in only when a scan was forgotten: a missing scan is never an absence.',
  'Chargement des présences': 'Loading attendance',
  'Impossible de charger les présences.': 'Could not load attendance.',
  'Aucune arrivée enregistrée ce jour': 'No arrival recorded on this day',
  'Arrivées enregistrées': 'Recorded arrivals',
  'arrivée à {time}': 'arrived at {time}',
  'saisi par {name} à {time}': 'entered by {name} at {time}',
  'Retards et absences annoncés': 'Announced lateness and absences',
  'Aucune demande annoncée ce jour': 'No announced request on this day',
  'Arrivée scannée': 'Arrival scanned',
  'Aucun scan enregistré': 'No scan recorded',
  'À partir de {start}': 'From {start}',
  'jusqu’à {end}': 'until {end}',
  'Remplaçant autorisé : {name}': 'Authorized substitute: {name}',
  'État des classes': 'Class status',
  'Aucun événement de classe ce jour': 'No class event on this day',
  'Vide': 'Empty',
  'Occupée': 'Occupied',
  'Arrivée': 'Arrival',
  'Corriger': 'Correct',

  // Manual entry
  'Régulariser une présence': 'Regularize attendance',
  'Choisissez l’enseignant et la classe.': 'Choose the teacher and the class.',
  'Présence enregistrée.': 'Attendance recorded.',
  'Pour un enseignant présent qui a oublié de scanner. Le jour concerné : {day}.':
    'For a present teacher who forgot to scan. Day concerned: {day}.',
  'Situation': 'Situation',
  'Marquer présent': 'Mark present',
  'Marquer en retard': 'Mark late',
  'Marquer absent': 'Mark absent',
  'Heure réelle d’arrivée (facultatif)': 'Actual arrival time (optional)',
  'Distincte de l’heure de saisie, enregistrée par le serveur.': 'Separate from the entry time, which the server records.',
  'Motif de l’absence': 'Reason for the absence',
  'Commentaire (facultatif)': 'Comment (optional)',

  // Correction
  'Corriger : {name}': 'Correct: {name}',
  'Nouveau statut': 'New status',
  'Inchangé': 'Unchanged',
  'Nouvelle heure d’arrivée': 'New arrival time',
  'Motif de la correction': 'Reason for the correction',
  'Conservé dans le journal d’audit avec l’ancien et le nouveau statut.': 'Kept in the audit log with the old and the new status.',
  'Indiquez le motif de la correction.': 'Enter the reason for the correction.',
  'Indiquez ce qui change : le statut ou l’heure d’arrivée.': 'Enter what changes: the status or the arrival time.',
  'Présence corrigée.': 'Attendance corrected.',
  'Correction impossible.': 'Correction not possible.',

  // Substitute
  'Remplaçant de {name}': 'Substitute for {name}',
  'l’enseignant': 'the teacher',
  'Le remplaçant pointe sous son propre compte ; le titulaire reste identifié sur la demande.':
    'The substitute clocks in under their own account; the titular teacher stays identified on the request.',
  'Enseignant remplaçant': 'Substitute teacher',
  'Aucun remplaçant': 'No substitute',
  'Désigner un remplaçant': 'Appoint a substitute',
  'Changer le remplaçant': 'Change the substitute',
  'Remplaçant désigné.': 'Substitute appointed.',
  'Remplaçant retiré.': 'Substitute removed.',

  // Request history
  'Arrivée de l’enseignant enregistrée': 'Teacher arrival recorded',
  'Remplaçant désigné': 'Substitute appointed',
  'Arrivée par QR code, {minutes} min après l’heure annoncée': 'Arrival by QR code, {minutes} min after the announced time',
  'Arrivée du remplaçant autorisé': 'Arrival of the authorized substitute',
  'Arrivée de l’enseignant alors qu’une absence était annoncée': 'Teacher arrived although an absence was announced',
  'Un enseignant remplaçant est désigné': 'A substitute teacher is appointed',
  'Le remplaçant est retiré': 'The substitute is removed',

  // Server messages (backend/src/attendance)
  'Une présence est déjà enregistrée pour cet enseignant, cette classe et ce jour.':
    'Attendance is already recorded for this teacher, class and day.',
  'La date ne peut pas être dans le futur.': 'The date cannot be in the future.',
  'La date ne peut pas remonter à plus de 7 jours.': 'The date cannot be more than 7 days back.',
  'Une absence n’a pas d’heure d’arrivée.': 'An absence has no arrival time.',
  'Indiquez le motif de l’absence.': 'Enter the reason for the absence.',
  'L’heure d’arrivée ne peut pas être dans le futur.': 'The arrival time cannot be in the future.',
  'Un remplaçant se désigne sur une absence annoncée par un enseignant.':
    'A substitute is appointed on an absence announced by a teacher.',
  'Cette demande est annulée.': 'This request is cancelled.',
  'Le remplaçant doit être un autre enseignant que le titulaire.': 'The substitute must be a different teacher than the titular.',
  'Indiquez ce qui change : statut, heure d’arrivée ou commentaire.': 'Enter what changes: status, arrival time or comment.',
  'Le statut « arrivée enregistrée » est posé par le scan : choisissez à l’heure, en retard ou absent.':
    'The “arrival recorded” status is set by the scan: choose on time, late or absent.',
  'Un scan valide existe pour cette journée : l’enseignant ne peut pas être marqué absent.':
    'A valid scan exists for this day: the teacher cannot be marked absent.',
  'L’heure d’un scan est celle du serveur : elle ne peut pas être modifiée.':
    'A scan’s time is the server’s time: it cannot be changed.',
  'Choisissez l’enseignant.': 'Choose the teacher.',
  'Choisissez l’enseignant remplaçant.': 'Choose the substitute teacher.',
  'Statut attendu : présent, en retard ou absent.': 'Expected status: present, late or absent.',
  'Heure d’arrivée attendue (HH:MM).': 'Arrival time expected (HH:MM).',
};
