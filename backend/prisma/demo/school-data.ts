import type { ClosureMode, Priority, Role, RoutingMode, SchoolCycle } from '@prisma/client';
import type { DeadlineDurations } from '../../src/categories/category-defaults';
import { usernameOf } from './random';

/**
 * Établissement fictif « La Joconde Jumelle » (école privée, cycles préparatoire et primaire) :
 * étages, niveaux, classes, personnel, catégories de demandes et consignes. Toutes les personnes
 * sont fictives.
 */

// ---------------------------------------------------------------------------
// Étages, niveaux et classes
// ---------------------------------------------------------------------------

export const FLOORS = [
  { key: 'rdc', name: 'Rez-de-chaussée', position: 0, roomPrefix: '0' },
  { key: 'e1', name: '1er étage', position: 1, roomPrefix: '1' },
  { key: 'e2', name: '2e étage', position: 2, roomPrefix: '2' },
  { key: 'e3', name: '3e étage', position: 3, roomPrefix: '3' },
  { key: 'e4', name: '4e étage', position: 4, roomPrefix: '4' },
] as const;

export type FloorKey = (typeof FLOORS)[number]['key'];

export interface LevelSeed {
  name: string;
  cycle: SchoolCycle;
  position: number;
  floor: FloorKey;
  flowers: readonly [string, string, string, string];
}

/** 8 niveaux, 4 classes chacun, noms de fleurs tous différents (aucune confusion d'un niveau à l'autre). */
export const LEVELS: readonly LevelSeed[] = [
  { name: 'Préparatoire 1', cycle: 'PREPARATORY', position: 1, floor: 'rdc', flowers: ['Rose', 'Tulipe', 'Jasmin', 'Iris'] },
  { name: 'Préparatoire 2', cycle: 'PREPARATORY', position: 2, floor: 'rdc', flowers: ['Orchidée', 'Violette', 'Lys', 'Pivoine'] },
  { name: '1re primaire', cycle: 'PRIMARY', position: 3, floor: 'e1', flowers: ['Marguerite', 'Lavande', 'Dahlia', 'Camélia'] },
  { name: '2e primaire', cycle: 'PRIMARY', position: 4, floor: 'e1', flowers: ['Coquelicot', 'Magnolia', 'Géranium', 'Azalée'] },
  { name: '3e primaire', cycle: 'PRIMARY', position: 5, floor: 'e2', flowers: ['Hortensia', 'Mimosa', 'Anémone', 'Jonquille'] },
  { name: '4e primaire', cycle: 'PRIMARY', position: 6, floor: 'e2', flowers: ['Tournesol', 'Gardénia', 'Freesia', 'Lotus'] },
  { name: '5e primaire', cycle: 'PRIMARY', position: 7, floor: 'e3', flowers: ['Glycine', 'Pervenche', 'Capucine', 'Bruyère'] },
  { name: '6e primaire', cycle: 'PRIMARY', position: 8, floor: 'e4', flowers: ['Bégonia', 'Narcisse', 'Zinnia', 'Aster'] },
];

export interface ClassSeed {
  key: string;
  /** « Préparatoire 1 - Rose » : niveau et fleur, unique dans l'établissement. */
  name: string;
  flower: string;
  level: string;
  floor: FloorKey;
  room: string;
}

export const CLASSES: readonly ClassSeed[] = (() => {
  const perFloor = new Map<FloorKey, number>();
  return LEVELS.flatMap((level) =>
    level.flowers.map((flower) => {
      const index = (perFloor.get(level.floor) ?? 0) + 1;
      perFloor.set(level.floor, index);
      const prefix = FLOORS.find((f) => f.key === level.floor)!.roomPrefix;
      return {
        key: `${level.position}-${flower}`,
        name: `${level.name} - ${flower}`,
        flower,
        level: level.name,
        floor: level.floor,
        room: `Salle ${prefix}${String(index).padStart(2, '0')}`,
      };
    }),
  );
})();

// ---------------------------------------------------------------------------
// Personnel : 49 membres + la direction (compte super administrateur)
// ---------------------------------------------------------------------------

export type StaffKind = 'teacher' | 'specialist' | 'supervisor' | 'bursar' | 'technician' | 'it' | 'headSupervisor' | 'direction';

export interface StaffSeed {
  key: string;
  username: string;
  firstName: string;
  lastName: string;
  displayName: string;
  jobTitle: string;
  role: Role;
  kind: StaffKind;
  /** Titulaire de cette classe (enseignants). */
  classKey?: string;
  /** Étage de rattachement (surveillants) ou étage de la classe (enseignants). */
  floor?: FloorKey;
  feminine: boolean;
}

function person(
  firstName: string,
  lastName: string,
  feminine: boolean,
  rest: Omit<StaffSeed, 'key' | 'username' | 'firstName' | 'lastName' | 'displayName' | 'feminine'>,
): StaffSeed {
  const username = usernameOf(firstName, lastName);
  return { key: username, username, firstName, lastName, displayName: `${firstName} ${lastName}`, feminine, ...rest };
}

const CLASS_TEACHERS: ReadonlyArray<readonly [string, string, boolean]> = [
  ['Amira', 'Ben Salem', true],
  ['Sonia', 'Trabelsi', true],
  ['Ines', 'Gharbi', true],
  ['Mariem', 'Jaziri', true],
  ['Hela', 'Bouazizi', true],
  ['Yasmine', 'Chaabane', true],
  ['Rim', 'Haddad', true],
  ['Olfa', 'Mansour', true],
  ['Nadia', 'Ferchichi', true],
  ['Karim', 'Bouslama', false],
  ['Salma', 'Ayari', true],
  ['Fatma', 'Zouari', true],
  ['Leila', 'Karoui', true],
  ['Sami', 'Ouertani', false],
  ['Khaoula', 'Dridi', true],
  ['Meriem', 'Saidi', true],
  ['Sarra', 'Khemiri', true],
  ['Claire', 'Martin', true],
  ['Mohamed Ali', 'Hamdi', false],
  ['Hanen', 'Belhadj', true],
  ['Sophie', 'Lefèvre', true],
  ['Anis', 'Chouchane', false],
  ['Nour', 'Riahi', true],
  ['Asma', 'Mejri', true],
  ['Walid', 'Guesmi', false],
  ['Wafa', 'Jlassi', true],
  ['Imen', 'Baccouche', true],
  ['Thomas', 'Bernard', false],
  ['Hatem', 'Rekik', false],
  ['Rania', 'Masmoudi', true],
  ['Youssef', 'Amri', false],
  ['Dorra', 'Kallel', true],
];

export const STAFF: readonly StaffSeed[] = [
  ...CLASS_TEACHERS.map(([first, last, feminine], i) => {
    const schoolClass = CLASSES[i];
    return person(first, last, feminine, {
      jobTitle: `${feminine ? 'Enseignante' : 'Enseignant'} — ${schoolClass.name}`,
      role: 'EMPLOYEE',
      kind: 'teacher',
      classKey: schoolClass.key,
      floor: schoolClass.floor,
    });
  }),
  person('Emna', 'Sellami', true, { jobTitle: 'Professeure d’anglais', role: 'EMPLOYEE', kind: 'specialist' }),
  person('Bilel', 'Nasri', false, { jobTitle: 'Professeur d’éducation physique', role: 'EMPLOYEE', kind: 'specialist' }),
  person('Chiraz', 'Ben Amor', true, { jobTitle: 'Professeure de musique et d’arts plastiques', role: 'EMPLOYEE', kind: 'specialist' }),
  // Deux surveillants par étage.
  ...(
    [
      ['Mourad', 'Ben Youssef', false, 'rdc'],
      ['Samia', 'Hammami', true, 'rdc'],
      ['Lotfi', 'Mabrouk', false, 'e1'],
      ['Houda', 'Chebbi', true, 'e1'],
      ['Nabil', 'Arfaoui', false, 'e2'],
      ['Faten', 'Labidi', true, 'e2'],
      ['Riadh', 'Toumi', false, 'e3'],
      ['Souad', 'Bouzid', true, 'e3'],
      ['Adel', 'Mzoughi', false, 'e4'],
      ['Najet', 'Ghanmi', true, 'e4'],
    ] as const
  ).map(([first, last, feminine, floor]) =>
    person(first, last, feminine, {
      jobTitle: `${feminine ? 'Surveillante' : 'Surveillant'} — ${FLOORS.find((f) => f.key === floor)!.name}`,
      role: 'EMPLOYEE',
      kind: 'supervisor',
      floor,
    }),
  ),
  person('Hichem', 'Ben Romdhane', false, { jobTitle: 'Économe', role: 'EMPLOYEE', kind: 'bursar' }),
  person('Slim', 'Jebali', false, { jobTitle: 'Technicien de maintenance', role: 'EMPLOYEE', kind: 'technician' }),
  person('Aymen', 'Kchaou', false, { jobTitle: 'Responsable informatique', role: 'EMPLOYEE', kind: 'it' }),
  person('Samira', 'Belkhodja', true, { jobTitle: 'Surveillante générale — administration', role: 'ADMIN', kind: 'headSupervisor' }),
];

/** Compte de la direction (super administrateur), hors des 49 membres du personnel. */
export const DIRECTION: StaffSeed = {
  key: 'direction',
  username: 'direction',
  firstName: 'Leïla',
  lastName: 'Ben Hassine',
  displayName: 'Leïla Ben Hassine',
  jobTitle: 'Directrice',
  role: 'SUPER_ADMIN',
  kind: 'direction',
  feminine: true,
};

export const ALL_ACCOUNTS: readonly StaffSeed[] = [...STAFF, DIRECTION];

export const staffOf = (kind: StaffKind) => STAFF.filter((s) => s.kind === kind);
export const oneStaff = (kind: StaffKind): StaffSeed => {
  const found = ALL_ACCOUNTS.find((s) => s.kind === kind);
  if (!found) throw new Error(`Personnel introuvable : ${kind}`);
  return found;
};

// ---------------------------------------------------------------------------
// Catégories de demandes de travail
// ---------------------------------------------------------------------------

export type CategoryKey = 'it' | 'maintenance' | 'supplies' | 'supervision' | 'catering' | 'peer' | 'organisation';

export interface CategorySeed {
  key: CategoryKey;
  name: string;
  routingMode: RoutingMode;
  closureMode: ClosureMode;
  autoCloseAfterMinutes: number;
  finalValidation: boolean;
  deadlines: Record<Priority, DeadlineDurations>;
  /** Destinataires (circuit A) ou employés affectables (circuit B). */
  recipients: StaffKind[];
}

/**
 * Délais de démonstration (minutes calendaires, comme dans l'application) : réglés pour une école
 * ouverte en semaine, où une demande du vendredi soir est traitée le lundi.
 */
const SCHOOL_DEADLINES: Record<Priority, DeadlineDurations> = {
  NORMAL: { validationMinutes: 2880, takeoverMinutes: 2880, completionMinutes: 7200 },
  MEDIUM: { validationMinutes: 1440, takeoverMinutes: 1440, completionMinutes: 4320 },
  HIGH: { validationMinutes: 240, takeoverMinutes: 240, completionMinutes: 1440 },
  URGENT: { validationMinutes: 30, takeoverMinutes: 30, completionMinutes: 240 },
};

const SUPERVISION_DEADLINES: Record<Priority, DeadlineDurations> = {
  NORMAL: { validationMinutes: 1440, takeoverMinutes: 1440, completionMinutes: 2880 },
  MEDIUM: { validationMinutes: 480, takeoverMinutes: 480, completionMinutes: 1440 },
  HIGH: { validationMinutes: 60, takeoverMinutes: 60, completionMinutes: 480 },
  URGENT: { validationMinutes: 15, takeoverMinutes: 10, completionMinutes: 60 },
};

const WORKS_DEADLINES: Record<Priority, DeadlineDurations> = {
  ...SCHOOL_DEADLINES,
  NORMAL: { validationMinutes: 2880, takeoverMinutes: 2880, completionMinutes: 10080 },
  MEDIUM: { validationMinutes: 1440, takeoverMinutes: 1440, completionMinutes: 5760 },
};

export const CATEGORIES: readonly CategorySeed[] = [
  {
    key: 'it',
    name: 'Informatique et numérique',
    routingMode: 'DIRECT',
    closureMode: 'REQUESTER',
    autoCloseAfterMinutes: 0,
    finalValidation: false,
    deadlines: SCHOOL_DEADLINES,
    recipients: ['it'],
  },
  {
    key: 'maintenance',
    name: 'Maintenance et réparations',
    routingMode: 'VIA_ADMIN',
    closureMode: 'MANAGER',
    autoCloseAfterMinutes: 0,
    finalValidation: true,
    deadlines: WORKS_DEADLINES,
    recipients: ['technician', 'it'],
  },
  {
    key: 'supplies',
    name: 'Fournitures et matériel pédagogique',
    routingMode: 'DIRECT',
    closureMode: 'AUTO',
    autoCloseAfterMinutes: 1440,
    finalValidation: false,
    deadlines: SCHOOL_DEADLINES,
    recipients: ['bursar'],
  },
  {
    key: 'supervision',
    name: 'Surveillance et organisation des étages',
    routingMode: 'VIA_ADMIN',
    closureMode: 'MANAGER',
    autoCloseAfterMinutes: 0,
    finalValidation: false,
    deadlines: SUPERVISION_DEADLINES,
    recipients: ['supervisor'],
  },
  {
    key: 'catering',
    name: 'Restauration (cantine et panier)',
    routingMode: 'DIRECT',
    closureMode: 'AUTO',
    autoCloseAfterMinutes: 720,
    finalValidation: false,
    deadlines: SCHOOL_DEADLINES,
    recipients: ['bursar'],
  },
  {
    key: 'peer',
    name: 'Entraide entre enseignants',
    routingMode: 'PEER',
    closureMode: 'REQUESTER',
    autoCloseAfterMinutes: 0,
    finalValidation: false,
    deadlines: SCHOOL_DEADLINES,
    recipients: ['teacher', 'specialist'],
  },
  {
    key: 'organisation',
    name: 'Activités, salles et événements',
    routingMode: 'VIA_ADMIN',
    closureMode: 'REQUESTER',
    autoCloseAfterMinutes: 0,
    finalValidation: false,
    deadlines: WORKS_DEADLINES,
    recipients: ['technician', 'bursar', 'it', 'supervisor'],
  },
];

/** Consignes de l'assistance (009), rédigées par la direction ; servent de sources aux propositions. */
export const GUIDELINES: ReadonlyArray<{ key: string; title: string; body: string; category: CategoryKey | null }> = [
  {
    key: 'securite',
    title: 'Sécurité des élèves avant tout',
    body: 'Consigne de démonstration. Tout danger pour les élèves (fil électrique apparent, vitre brisée, fuite près d’une prise, porte de secours bloquée) : Priorité : Urgente, catégorie Maintenance et réparations.',
    category: null,
  },
  {
    key: 'informatique',
    title: 'Pannes informatiques en classe',
    body: 'Consigne de démonstration. Vidéoprojecteur, tableau interactif ou ordinateur indispensable au cours : Priorité : Haute. Installation de logiciel ou compte à créer : Priorité : Normale.',
    category: 'it',
  },
  {
    key: 'fournitures',
    title: 'Commandes de fournitures',
    body: 'Consigne de démonstration. Les fournitures courantes sont servies sous 48 h par l’économat : Priorité : Normale, sauf rupture bloquant une activité prévue le jour même (Priorité : Moyenne).',
    category: 'supplies',
  },
  {
    key: 'restauration',
    title: 'Hygiène et restauration',
    body: 'Consigne de démonstration. Chaîne du froid, allergie ou matériel de cantine hors d’usage pendant le service : Priorité : Haute ; organisation du service panier : Priorité : Moyenne.',
    category: 'catering',
  },
];

// ---------------------------------------------------------------------------
// Élèves (prénoms et noms fictifs)
// ---------------------------------------------------------------------------

export const GIRL_NAMES = [
  'Aya', 'Lina', 'Yasmine', 'Malak', 'Nour', 'Eya', 'Farah', 'Rania', 'Sarra', 'Mariem', 'Ines', 'Salma', 'Jana', 'Lilia',
  'Rayhane', 'Emna', 'Hiba', 'Maram', 'Asma', 'Yara', 'Chaima', 'Amal', 'Dina', 'Selma', 'Louna', 'Inès', 'Léa', 'Chloé',
  'Emma', 'Sofia', 'Zeineb', 'Myriam', 'Khadija', 'Rim', 'Alya', 'Tasnim', 'Ghada', 'Siwar', 'Nesrine', 'Hana', 'Camille',
  'Maya', 'Mila', 'Elyssa', 'Assil', 'Joud', 'Roua', 'Baya',
] as const;

export const BOY_NAMES = [
  'Adam', 'Youssef', 'Mohamed', 'Ahmed', 'Rayen', 'Iyed', 'Yassine', 'Amine', 'Omar', 'Ali', 'Aziz', 'Karim', 'Mehdi', 'Hamza',
  'Ilyes', 'Anas', 'Skander', 'Firas', 'Malek', 'Elyes', 'Nour', 'Wassim', 'Zied', 'Bilel', 'Sami', 'Taha', 'Rami', 'Lucas',
  'Nathan', 'Hugo', 'Louis', 'Gabriel', 'Ayoub', 'Mohamed Amine', 'Yahya', 'Idris', 'Aymen', 'Fares', 'Ghaith', 'Seif',
  'Achraf', 'Haroun', 'Jad', 'Kais', 'Moez', 'Naim', 'Oussama', 'Tarek',
] as const;

export const LAST_NAMES = [
  'Abidi', 'Ammar', 'Ayadi', 'Baccar', 'Ben Abdallah', 'Ben Ali', 'Ben Brahim', 'Ben Hamida', 'Ben Mahmoud', 'Ben Nasr',
  'Ben Othman', 'Bouaziz', 'Bouhlel', 'Boukadi', 'Chakroun', 'Charfi', 'Chebil', 'Cherif', 'Dahmani', 'Daoud', 'Ellouze',
  'Elloumi', 'Fakhfakh', 'Feki', 'Garbi', 'Ghorbel', 'Hachicha', 'Hamrouni', 'Hammami', 'Hannachi', 'Hassen', 'Jaballah',
  'Jemai', 'Jouini', 'Kamoun', 'Karray', 'Khalfallah', 'Ksouri', 'Laabidi', 'Lahmar', 'Lassoued', 'Maalej', 'Mahjoub',
  'Marzouki', 'Mathlouthi', 'Mekki', 'Messaoudi', 'Mili', 'Mokni', 'Nefzi', 'Ouni', 'Rebai', 'Romdhani', 'Sahli', 'Sassi',
  'Sfaxi', 'Slimani', 'Souissi', 'Tlili', 'Turki', 'Yahyaoui', 'Zaied', 'Zghal', 'Zribi', 'Dubois', 'Moreau', 'Laurent',
  'Garcia', 'Rossi', 'Petit', 'Lambert', 'Fontaine',
] as const;

/** Numéros réservés à la fiction (plage 06 39 98 xx xx de l'ARCEP) : jamais attribués à un abonné. */
export function fictionalPhone(index: number): string {
  const n = String(index % 10_000).padStart(4, '0');
  return `06 39 98 ${n.slice(0, 2)} ${n.slice(2)}`;
}
