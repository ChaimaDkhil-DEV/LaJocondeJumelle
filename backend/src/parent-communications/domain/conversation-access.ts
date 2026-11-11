import type {
  ConversationStatus,
  ConversationType,
  ParentCommunicationAuthor,
  ParentCommunicationStatus,
  Permission,
  Role,
} from '@prisma/client';

/**
 * Règles d'accès des communications (017, FR-015 à FR-026), fonctions pures. Le service charge les faits
 * (affectation de classe, lien du représentant, compte, permissions) ; ces fonctions décident. Toute lecture
 * et tout envoi passent par ici : aucun identifiant ne suffit à lui seul (FR-025).
 */

export interface Viewer {
  userId: string;
  role: Role;
  active: boolean;
  /** Membre du groupe « Enseignants ». */
  isTeacher: boolean;
  /** Compte parent : représentant actif rattaché à ce compte ; null sinon. */
  guardianId: string | null;
  permissions: ReadonlySet<Permission>;
}

export interface ConversationFacts {
  type: ConversationType;
  status: ConversationStatus;
  teacherId: string | null;
  guardianId: string | null;
}

export interface MessageFacts {
  author: ParentCommunicationAuthor;
  authorId: string | null;
  status: ParentCommunicationStatus;
}

/** Faits revérifiés à chaque envoi (FR-022). */
export interface PostFacts {
  /** L'enseignant de la conversation a encore la classe de l'élève, élève actif (INTERNAL). */
  teacherAssigned: boolean;
  /** Représentant actif, compte parent actif, encore lié à l'élève actif (PARENT). */
  guardianLinked: boolean;
}

/** À quel titre le lecteur prend part à la conversation. */
export type Party = 'ADMIN' | 'TEACHER' | 'GUARDIAN';
export type SendMode = 'DIRECT' | 'SUBMIT' | 'FORBIDDEN';
export type Refusal = 'OUT_OF_SCOPE' | 'ARCHIVED' | 'CLOSED' | 'RECIPIENT_INVALID' | 'SEND_FORBIDDEN';
export type Decision = { ok: true; mode: 'DIRECT' | 'SUBMIT' } | { ok: false; reason: Refusal };

const VISIBLE: ReadonlySet<ParentCommunicationStatus> = new Set(['SENT', 'APPROVED']);

export function isAdministration(viewer: Pick<Viewer, 'role' | 'active'>): boolean {
  return viewer.active && (viewer.role === 'ADMIN' || viewer.role === 'SUPER_ADMIN');
}

/**
 * Partie du lecteur, ou null s'il n'a pas accès (FR-017 à FR-021, D3). L'enseignant de la conversation
 * passe avant l'administration : un administrateur qui est aussi l'enseignant y parle comme enseignant.
 */
export function partyOf(viewer: Viewer, conversation: ConversationFacts): Party | null {
  if (!viewer.active) return null;
  const { type, teacherId, guardianId } = conversation;
  if (type !== 'PARENT' && viewer.role !== 'PARENT' && teacherId === viewer.userId) return 'TEACHER';
  if (
    type !== 'INTERNAL' &&
    viewer.role === 'PARENT' &&
    viewer.guardianId !== null &&
    guardianId === viewer.guardianId
  )
    return 'GUARDIAN';
  if (isAdministration(viewer)) return 'ADMIN';
  return null;
}

/**
 * Message visible pour une partie. L'administration voit tout. Ailleurs : ses propres messages (hors
 * brouillon côté parent) et les messages envoyés ou approuvés des autres. Archive (D3, D4) : l'enseignant
 * garde tous ses messages, le parent tous les siens ; chacun ne voit de l'autre que les messages approuvés.
 */
export function canSeeMessage(
  party: Party,
  viewerId: string,
  conversation: Pick<ConversationFacts, 'type'>,
  message: MessageFacts,
): boolean {
  if (party === 'ADMIN') return true;
  const own = message.authorId === viewerId;
  if (conversation.type === 'LEGACY_TEACHER_PARENT') {
    const ownSide = party === 'TEACHER' ? message.author === 'TEACHER' : message.author === 'PARENT';
    if (ownSide) return party === 'TEACHER' || message.status !== 'DRAFT';
    return message.status === 'APPROVED';
  }
  if (own) return message.status !== 'DRAFT' || party !== 'GUARDIAN';
  return VISIBLE.has(message.status);
}

/** Mode d'envoi (D6, R3) : seuls les messages de l'administration aux parents peuvent exiger une validation. */
export function sendMode(viewer: Pick<Viewer, 'role' | 'permissions'>, type: ConversationType): SendMode {
  if (type === 'LEGACY_TEACHER_PARENT') return 'FORBIDDEN';
  if (type === 'INTERNAL' || viewer.role === 'PARENT') return 'DIRECT';
  if (viewer.permissions.has('PARENT_COMM_SEND_DIRECT')) return 'DIRECT';
  if (viewer.permissions.has('PARENT_COMM_SUBMIT_FOR_APPROVAL')) return 'SUBMIT';
  return 'FORBIDDEN';
}

function deliver(viewer: Viewer, party: Party, type: ConversationType, facts: PostFacts): Decision {
  if (party === 'TEACHER' && !facts.teacherAssigned) return { ok: false, reason: 'RECIPIENT_INVALID' };
  if (party === 'ADMIN' && type === 'INTERNAL' && !facts.teacherAssigned)
    return { ok: false, reason: 'RECIPIENT_INVALID' };
  if (type === 'PARENT' && !facts.guardianLinked) return { ok: false, reason: 'RECIPIENT_INVALID' };
  const mode = sendMode(viewer, type);
  if (mode === 'FORBIDDEN') return { ok: false, reason: 'SEND_FORBIDDEN' };
  return { ok: true, mode };
}

/** Écrire dans une conversation existante (FR-006, FR-015, FR-016, FR-022). */
export function canPost(viewer: Viewer, conversation: ConversationFacts, facts: PostFacts): Decision {
  const party = partyOf(viewer, conversation);
  if (!party) return { ok: false, reason: 'OUT_OF_SCOPE' };
  if (conversation.type === 'LEGACY_TEACHER_PARENT') return { ok: false, reason: 'ARCHIVED' };
  if (conversation.status === 'CLOSED') return { ok: false, reason: 'CLOSED' };
  // L'administration répond à un enseignant même s'il a perdu la classe : il garde la lecture (FR-023).
  if (party === 'ADMIN' && conversation.type === 'INTERNAL') return { ok: true, mode: 'DIRECT' };
  return deliver(viewer, party, conversation.type, facts);
}

/**
 * Commencer une conversation. L'enseignant : INTERNAL seulement ; le parent (représentant actif) : PARENT
 * seulement ; l'administration : les deux (INTERNAL avec l'enseignant de la classe de l'élève).
 */
export function canStart(viewer: Viewer, type: ConversationType, facts: PostFacts): Decision {
  if (!viewer.active) return { ok: false, reason: 'OUT_OF_SCOPE' };
  if (type === 'LEGACY_TEACHER_PARENT') return { ok: false, reason: 'ARCHIVED' };
  let party: Party | null = null;
  if (isAdministration(viewer)) party = 'ADMIN';
  else if (type === 'INTERNAL' && viewer.isTeacher && viewer.role !== 'PARENT') party = 'TEACHER';
  else if (type === 'PARENT' && viewer.role === 'PARENT' && viewer.guardianId !== null) party = 'GUARDIAN';
  if (!party) return { ok: false, reason: 'OUT_OF_SCOPE' };
  return deliver(viewer, party, type, facts);
}

/** Décider sur un message soumis (FR-010) : un autre validateur actif, jamais l'auteur. */
export function canDecide(viewer: Viewer, message: Pick<MessageFacts, 'authorId'>): boolean {
  return (
    viewer.active &&
    viewer.permissions.has('PARENT_COMMUNICATION_VALIDATE') &&
    message.authorId !== viewer.userId
  );
}

/** Nom de l'expéditeur affiché (D7). */
export function authorLabel(
  party: Party,
  message: { author: ParentCommunicationAuthor; displayName: string },
): string {
  if (message.author !== 'ADMIN' || party === 'ADMIN') return message.displayName;
  return party === 'GUARDIAN' ? 'L’école' : `Administration (${message.displayName})`;
}
