export const imports: Record<string, string> = {
  // Dialogue d'import CSV
  "Importer un fichier": "Import a file",
  "Importer des comptes": "Import accounts",
  "Importer des élèves": "Import students",
  "Choisissez un fichier CSV (enregistré depuis Excel ou LibreOffice). Il est d’abord vérifié en entier : rien n’est créé avant votre confirmation, et rien n’est créé du tout si une ligne est en erreur.":
    "Choose a CSV file (saved from Excel or LibreOffice). It is first checked in full: nothing is created before you confirm, and nothing is created at all if a line has an error.",
  "Colonnes du fichier": "File columns",
  "(obligatoire)": "(required)",
  "(facultatif)": "(optional)",
  "Choisir un fichier": "Choose a file",
  "Choisir un autre fichier": "Choose another file",
  "Choisir un fichier corrigé": "Choose a corrected file",
  "Télécharger le modèle": "Download the template",
  "Fichier CSV à importer": "CSV file to import",
  "Vérification du fichier": "Checking the file",
  "Création en cours": "Creating",
  "Fichier : {name}": "File: {name}",
  "Ce fichier ne peut pas être importé.": "This file cannot be imported.",
  "{count} ligne à corriger sur {total}. Rien n’est créé tant que le fichier n’est pas corrigé.":
    "{count} line to fix out of {total}. Nothing is created until the file is corrected.",
  "{count} lignes à corriger sur {total}. Rien n’est créé tant que le fichier n’est pas corrigé.":
    "{count} lines to fix out of {total}. Nothing is created until the file is corrected.",
  "Le fichier est valide : {noun} à créer.": "The file is valid: {noun} to create.",
  "Lignes à corriger": "Lines to fix",
  "Ligne {line} — {label}": "Line {line} — {label}",
  "Seules les premières erreurs sont affichées : corrigez-les puis rechargez le fichier pour voir la suite.":
    "Only the first errors are shown: fix them, then reload the file to see the rest.",
  "Aperçu des premières lignes": "Preview of the first lines",
  "Créer {noun}": "Create {noun}",
  "{noun} créé.": "{noun} created.",
  "{noun} créés.": "{noun} created.",
  "Fermer sans télécharger": "Close without downloading",
  "Ce fichier dépasse 1 Mo : découpez-le en plusieurs fichiers.": "This file is larger than 1 MB: split it into several files.",
  "Le fichier n’a pas pu être vérifié. Réessayez.": "The file could not be checked. Please try again.",
  "L’import a échoué. Rien n’a été créé : réessayez.": "The import failed. Nothing was created: please try again.",

  // Comptes
  "{count} compte": "{count} account",
  "{count} comptes": "{count} accounts",
  "lettres minuscules sans accent, chiffres, point, tiret ou souligné (3 à 64 caractères)":
    "lowercase letters without accents, digits, dot, hyphen or underscore (3 to 64 characters)",
  "nom complet, tel qu’il s’affichera": "full name, as it will be displayed",
  "poste, par exemple Professeur": "job title, for example Teacher",
  "employé (par défaut) ou admin": "employee (default) or admin",
  "noms de groupes séparés par « | », par exemple Enseignants|Surveillants": "group names separated by “|”, for example Teachers|Supervisors",
  "nom d’un étage existant (pour les surveillants)": "name of an existing floor (for supervisors)",
  "catégories dont la personne reçoit les demandes, séparées par « | »": "categories whose requests the person receives, separated by “|”",
  "Les mots de passe provisoires ne seront plus affichés nulle part. Téléchargez le fichier maintenant, remettez à chaque personne le sien (elle devra le changer à sa première connexion), puis supprimez le fichier.":
    "The temporary passwords will not be shown anywhere again. Download the file now, give each person their own (they must change it at first sign-in), then delete the file.",
  "Télécharger les mots de passe provisoires": "Download the temporary passwords",
  "Vous n’avez pas téléchargé les mots de passe provisoires : ils seront perdus et il faudra réinitialiser chaque compte. Fermer quand même ?":
    "You have not downloaded the temporary passwords: they will be lost and each account will have to be reset. Close anyway?",

  // Élèves
  "{count} élève": "{count} student",
  "{count} élèves": "{count} students",
  "prénom de l’élève": "student’s first name",
  "nom de famille de l’élève": "student’s last name",
  "nom exact d’une classe rattachée à un niveau scolaire": "exact name of a class attached to a school level",
  "téléphone d’un parent, par exemple 06 12 34 56 78 ou +216 20 123 456": "a parent’s phone number, for example 06 12 34 56 78 or +216 20 123 456",
  "cantine ou panier": "canteen or packed lunch",
};
