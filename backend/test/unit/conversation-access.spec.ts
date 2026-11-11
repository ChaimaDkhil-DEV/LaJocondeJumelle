import type { Permission, Role } from '@prisma/client';
import { permissionsFor } from '../../src/common/authorization';
import {
  authorLabel,
  canDecide,
  canPost,
  canStart,
  canSeeMessage,
  partyOf,
  sendMode,
  type ConversationFacts,
  type MessageFacts,
  type Viewer,
} from '../../src/parent-communications/domain/conversation-access';

/**
 * 017 — règles d'accès des communications (FR-015 à FR-026), fonctions pures. Le service charge les faits
 * (affectation de classe, lien représentant, compte, permissions), ces fonctions décident.
 */

const TEACHER = 'u-teacher';
const OTHER_TEACHER = 'u-teacher-2';
const PARENT_USER = 'u-parent';
const OTHER_PARENT_USER = 'u-parent-2';
const ADMIN = 'u-admin';
const OTHER_ADMIN = 'u-admin-2';
const GUARDIAN = 'g-1';
const OTHER_GUARDIAN = 'g-2';

function viewer(
  userId: string,
  role: Role,
  extra: Partial<Viewer> & { granted?: Permission[] } = {},
): Viewer {
  const { granted = [], ...rest } = extra;
  return {
    userId,
    role,
    active: true,
    isTeacher: false,
    guardianId: null,
    permissions: permissionsFor(role, granted),
    ...rest,
  };
}

const teacher = viewer(TEACHER, 'EMPLOYEE', { isTeacher: true });
const otherTeacher = viewer(OTHER_TEACHER, 'EMPLOYEE', { isTeacher: true });
const parent = viewer(PARENT_USER, 'PARENT', { guardianId: GUARDIAN });
const otherParent = viewer(OTHER_PARENT_USER, 'PARENT', { guardianId: OTHER_GUARDIAN });
const admin = viewer(ADMIN, 'ADMIN', {
  granted: ['PARENT_COMM_SUBMIT_FOR_APPROVAL', 'PARENT_COMMUNICATION_VALIDATE'],
});
const directAdmin = viewer(OTHER_ADMIN, 'ADMIN', {
  granted: ['PARENT_COMM_SEND_DIRECT', 'PARENT_COMMUNICATION_VALIDATE'],
});
const bareAdmin = viewer('u-admin-3', 'ADMIN');
const superAdmin = viewer('u-super', 'SUPER_ADMIN');
const plainEmployee = viewer('u-employee', 'EMPLOYEE');

const internal: ConversationFacts = { type: 'INTERNAL', status: 'OPEN', teacherId: TEACHER, guardianId: null };
const family: ConversationFacts = { type: 'PARENT', status: 'OPEN', teacherId: null, guardianId: GUARDIAN };
const archive: ConversationFacts = {
  type: 'LEGACY_TEACHER_PARENT',
  status: 'CLOSED',
  teacherId: TEACHER,
  guardianId: GUARDIAN,
};
const closed = (c: ConversationFacts): ConversationFacts => ({ ...c, status: 'CLOSED' });

const message = (author: MessageFacts['author'], authorId: string, status: MessageFacts['status']): MessageFacts => ({
  author,
  authorId,
  status,
});

const OK = { teacherAssigned: true, guardianLinked: true };

describe('partyOf — qui lit une conversation, et à quel titre', () => {
  it('FR-018 : l’enseignant n’accède qu’à ses conversations internes', () => {
    expect(partyOf(teacher, internal)).toBe('TEACHER');
    expect(partyOf(otherTeacher, internal)).toBeNull();
  });

  it('FR-019 : un enseignant n’accède jamais à une conversation parent', () => {
    expect(partyOf(teacher, family)).toBeNull();
    expect(partyOf(otherTeacher, family)).toBeNull();
  });

  it('FR-017 : un parent n’accède qu’aux conversations parent de son représentant', () => {
    expect(partyOf(parent, family)).toBe('GUARDIAN');
    expect(partyOf(otherParent, family)).toBeNull();
  });

  it('FR-020 : un parent n’accède jamais à une conversation interne', () => {
    expect(partyOf(parent, internal)).toBeNull();
  });

  it('FR-021 : l’administration (ADMIN, SUPER_ADMIN actifs) accède aux trois types', () => {
    for (const v of [admin, bareAdmin, superAdmin]) {
      expect(partyOf(v, internal)).toBe('ADMIN');
      expect(partyOf(v, family)).toBe('ADMIN');
      expect(partyOf(v, archive)).toBe('ADMIN');
    }
  });

  it('un employé qui n’est ni enseignant de la conversation ni administrateur n’accède à rien', () => {
    for (const c of [internal, family, archive]) expect(partyOf(plainEmployee, c)).toBeNull();
  });

  it('FR-023 : un compte désactivé ne lit plus rien', () => {
    for (const v of [teacher, parent, admin]) {
      for (const c of [internal, family, archive]) expect(partyOf({ ...v, active: false }, c)).toBeNull();
    }
  });

  it('un parent sans représentant actif rattaché ne lit rien (FR-026)', () => {
    expect(partyOf({ ...parent, guardianId: null }, family)).toBeNull();
  });

  it('D3 : l’archive est lue par son enseignant, son représentant et l’administration', () => {
    expect(partyOf(teacher, archive)).toBe('TEACHER');
    expect(partyOf(parent, archive)).toBe('GUARDIAN');
    expect(partyOf(otherTeacher, archive)).toBeNull();
    expect(partyOf(otherParent, archive)).toBeNull();
  });

  it('un administrateur qui est l’enseignant d’une conversation interne y est l’enseignant', () => {
    const adminTeacher = viewer(TEACHER, 'ADMIN', { isTeacher: true });
    expect(partyOf(adminTeacher, internal)).toBe('TEACHER');
  });
});

describe('canSeeMessage — messages visibles selon la partie', () => {
  it('l’administration voit tout, y compris en attente, retourné ou rejeté', () => {
    for (const status of ['PENDING_ADMIN_VALIDATION', 'RETURNED_FOR_CORRECTION', 'REJECTED', 'CANCELLED', 'DRAFT'] as const) {
      expect(canSeeMessage('ADMIN', ADMIN, family, message('ADMIN', OTHER_ADMIN, status))).toBe(true);
      expect(canSeeMessage('ADMIN', ADMIN, archive, message('TEACHER', TEACHER, status))).toBe(true);
    }
  });

  it('le parent ne voit un message de l’administration qu’envoyé ou approuvé', () => {
    expect(canSeeMessage('GUARDIAN', PARENT_USER, family, message('ADMIN', ADMIN, 'SENT'))).toBe(true);
    expect(canSeeMessage('GUARDIAN', PARENT_USER, family, message('ADMIN', ADMIN, 'APPROVED'))).toBe(true);
    for (const status of ['PENDING_ADMIN_VALIDATION', 'RETURNED_FOR_CORRECTION', 'REJECTED', 'CANCELLED', 'DRAFT'] as const) {
      expect(canSeeMessage('GUARDIAN', PARENT_USER, family, message('ADMIN', ADMIN, status))).toBe(false);
    }
  });

  it('chacun voit ses propres messages', () => {
    expect(canSeeMessage('GUARDIAN', PARENT_USER, family, message('PARENT', PARENT_USER, 'SENT'))).toBe(true);
    expect(canSeeMessage('TEACHER', TEACHER, internal, message('TEACHER', TEACHER, 'SENT'))).toBe(true);
  });

  it('l’enseignant voit les réponses de l’administration dans sa conversation interne', () => {
    expect(canSeeMessage('TEACHER', TEACHER, internal, message('ADMIN', ADMIN, 'SENT'))).toBe(true);
  });

  it('D3 archive, enseignant : ses messages (tous états) et les messages approuvés du parent', () => {
    expect(canSeeMessage('TEACHER', TEACHER, archive, message('TEACHER', TEACHER, 'PENDING_ADMIN_VALIDATION'))).toBe(true);
    expect(canSeeMessage('TEACHER', TEACHER, archive, message('TEACHER', TEACHER, 'DRAFT'))).toBe(true);
    expect(canSeeMessage('TEACHER', TEACHER, archive, message('PARENT', PARENT_USER, 'APPROVED'))).toBe(true);
    expect(canSeeMessage('TEACHER', TEACHER, archive, message('PARENT', PARENT_USER, 'PENDING_ADMIN_VALIDATION'))).toBe(false);
  });

  it('D3/D4 archive, parent : messages approuvés de l’enseignant et ses propres messages, jamais un message non validé', () => {
    expect(canSeeMessage('GUARDIAN', PARENT_USER, archive, message('TEACHER', TEACHER, 'APPROVED'))).toBe(true);
    expect(canSeeMessage('GUARDIAN', PARENT_USER, archive, message('PARENT', PARENT_USER, 'PENDING_ADMIN_VALIDATION'))).toBe(true);
    for (const status of ['PENDING_ADMIN_VALIDATION', 'RETURNED_FOR_CORRECTION', 'REJECTED', 'CANCELLED', 'DRAFT'] as const) {
      expect(canSeeMessage('GUARDIAN', PARENT_USER, archive, message('TEACHER', TEACHER, status))).toBe(false);
    }
  });

  it('un brouillon n’est jamais montré à son auteur côté parent (aucun brouillon parent en 017)', () => {
    expect(canSeeMessage('GUARDIAN', PARENT_USER, family, message('PARENT', PARENT_USER, 'DRAFT'))).toBe(false);
  });
});

describe('canPost — écrire dans une conversation (FR-006, FR-015, FR-016, FR-022)', () => {
  it('l’enseignant écrit tant qu’il a la classe de l’élève', () => {
    expect(canPost(teacher, internal, OK)).toEqual({ ok: true, mode: 'DIRECT' });
    expect(canPost(teacher, internal, { ...OK, teacherAssigned: false })).toEqual({ ok: false, reason: 'RECIPIENT_INVALID' });
  });

  it('le parent écrit tant que son représentant est lié à l’élève', () => {
    expect(canPost(parent, family, OK)).toEqual({ ok: true, mode: 'DIRECT' });
    expect(canPost(parent, family, { ...OK, guardianLinked: false })).toEqual({ ok: false, reason: 'RECIPIENT_INVALID' });
  });

  it('l’administration répond directement dans une conversation interne', () => {
    expect(canPost(bareAdmin, internal, OK)).toEqual({ ok: true, mode: 'DIRECT' });
  });

  it('administration → parent : direct, soumis ou interdit selon les permissions (FR-009)', () => {
    expect(canPost(directAdmin, family, OK)).toEqual({ ok: true, mode: 'DIRECT' });
    expect(canPost(admin, family, OK)).toEqual({ ok: true, mode: 'SUBMIT' });
    expect(canPost(bareAdmin, family, OK)).toEqual({ ok: false, reason: 'SEND_FORBIDDEN' });
    expect(canPost(superAdmin, family, OK)).toEqual({ ok: true, mode: 'DIRECT' });
  });

  it('administration → parent : refusé si le représentant n’est plus lié ou n’a plus de compte actif (FR-026)', () => {
    expect(canPost(directAdmin, family, { ...OK, guardianLinked: false })).toEqual({ ok: false, reason: 'RECIPIENT_INVALID' });
  });

  it('personne n’écrit dans une conversation clôturée', () => {
    for (const [v, c] of [
      [teacher, internal],
      [parent, family],
      [directAdmin, family],
      [bareAdmin, internal],
    ] as const) {
      expect(canPost(v, closed(c), OK)).toEqual({ ok: false, reason: 'CLOSED' });
    }
  });

  it('personne n’écrit dans une archive (D3)', () => {
    for (const v of [teacher, parent, directAdmin, superAdmin]) {
      expect(canPost(v, archive, OK)).toEqual({ ok: false, reason: 'ARCHIVED' });
    }
  });

  it('hors de la conversation : refusé (FR-019, FR-020)', () => {
    expect(canPost(teacher, family, OK)).toEqual({ ok: false, reason: 'OUT_OF_SCOPE' });
    expect(canPost(parent, internal, OK)).toEqual({ ok: false, reason: 'OUT_OF_SCOPE' });
    expect(canPost(otherTeacher, internal, OK)).toEqual({ ok: false, reason: 'OUT_OF_SCOPE' });
  });
});

describe('canStart — commencer une conversation', () => {
  it('FR-015 : l’enseignant commence une conversation interne au sujet d’un élève de ses classes', () => {
    expect(canStart(teacher, 'INTERNAL', OK)).toEqual({ ok: true, mode: 'DIRECT' });
    expect(canStart(teacher, 'INTERNAL', { ...OK, teacherAssigned: false })).toEqual({ ok: false, reason: 'RECIPIENT_INVALID' });
  });

  it('FR-002 : un enseignant ne commence jamais une conversation parent ; un parent jamais une interne', () => {
    expect(canStart(teacher, 'PARENT', OK)).toEqual({ ok: false, reason: 'OUT_OF_SCOPE' });
    expect(canStart(parent, 'INTERNAL', OK)).toEqual({ ok: false, reason: 'OUT_OF_SCOPE' });
  });

  it('FR-016 : le parent commence au sujet de ses enfants seulement', () => {
    expect(canStart(parent, 'PARENT', OK)).toEqual({ ok: true, mode: 'DIRECT' });
    expect(canStart(parent, 'PARENT', { ...OK, guardianLinked: false })).toEqual({ ok: false, reason: 'RECIPIENT_INVALID' });
    expect(canStart({ ...parent, guardianId: null }, 'PARENT', OK)).toEqual({ ok: false, reason: 'OUT_OF_SCOPE' });
  });

  it('l’administration commence une conversation interne avec l’enseignant de la classe de l’élève', () => {
    expect(canStart(bareAdmin, 'INTERNAL', OK)).toEqual({ ok: true, mode: 'DIRECT' });
    expect(canStart(bareAdmin, 'INTERNAL', { ...OK, teacherAssigned: false })).toEqual({ ok: false, reason: 'RECIPIENT_INVALID' });
  });

  it('l’administration commence une conversation parent selon ses permissions', () => {
    expect(canStart(directAdmin, 'PARENT', OK)).toEqual({ ok: true, mode: 'DIRECT' });
    expect(canStart(admin, 'PARENT', OK)).toEqual({ ok: true, mode: 'SUBMIT' });
    expect(canStart(bareAdmin, 'PARENT', OK)).toEqual({ ok: false, reason: 'SEND_FORBIDDEN' });
  });

  it('jamais d’archive, et rien pour un employé sans rôle dans les communications', () => {
    expect(canStart(superAdmin, 'LEGACY_TEACHER_PARENT', OK)).toEqual({ ok: false, reason: 'ARCHIVED' });
    expect(canStart(plainEmployee, 'INTERNAL', OK)).toEqual({ ok: false, reason: 'OUT_OF_SCOPE' });
  });

  it('un compte désactivé ne commence rien', () => {
    expect(canStart({ ...teacher, active: false }, 'INTERNAL', OK)).toEqual({ ok: false, reason: 'OUT_OF_SCOPE' });
  });
});

describe('sendMode (D6, R3)', () => {
  it('interne et réponses des parents : toujours direct', () => {
    expect(sendMode(bareAdmin, 'INTERNAL')).toBe('DIRECT');
    expect(sendMode(teacher, 'INTERNAL')).toBe('DIRECT');
    expect(sendMode(parent, 'PARENT')).toBe('DIRECT');
  });

  it('administration → parent : envoi direct prioritaire sur la soumission', () => {
    const both = viewer('u-both', 'ADMIN', { granted: ['PARENT_COMM_SEND_DIRECT', 'PARENT_COMM_SUBMIT_FOR_APPROVAL'] });
    expect(sendMode(both, 'PARENT')).toBe('DIRECT');
    expect(sendMode(admin, 'PARENT')).toBe('SUBMIT');
    expect(sendMode(bareAdmin, 'PARENT')).toBe('FORBIDDEN');
    expect(sendMode(superAdmin, 'PARENT')).toBe('DIRECT');
  });
});

describe('canDecide — valider un message soumis (FR-010)', () => {
  const submitted = message('ADMIN', ADMIN, 'PENDING_ADMIN_VALIDATION');

  it('un autre validateur décide', () => {
    expect(canDecide(directAdmin, submitted)).toBe(true);
  });

  it('l’auteur ne décide jamais sur son propre message, même super administrateur', () => {
    expect(canDecide(admin, submitted)).toBe(false);
    const superAuthor = viewer(ADMIN, 'SUPER_ADMIN');
    expect(canDecide(superAuthor, submitted)).toBe(false);
  });

  it('sans la permission de validation, personne ne décide', () => {
    expect(canDecide(viewer('u-x', 'ADMIN', { granted: ['PARENT_COMM_SEND_DIRECT'] }), submitted)).toBe(false);
    expect(canDecide({ ...directAdmin, active: false }, submitted)).toBe(false);
  });
});

describe('authorLabel — nom affiché de l’expéditeur (D7)', () => {
  it('le parent voit « L’école » pour tout message de l’administration', () => {
    expect(authorLabel('GUARDIAN', { author: 'ADMIN', displayName: 'Mme Martin' })).toBe('L’école');
  });

  it('l’enseignant voit « Administration (Prénom Nom) »', () => {
    expect(authorLabel('TEACHER', { author: 'ADMIN', displayName: 'Mme Martin' })).toBe('Administration (Mme Martin)');
  });

  it('l’administration voit le nom de l’auteur ; les autres auteurs gardent leur nom', () => {
    expect(authorLabel('ADMIN', { author: 'ADMIN', displayName: 'Mme Martin' })).toBe('Mme Martin');
    expect(authorLabel('ADMIN', { author: 'TEACHER', displayName: 'M. Benali' })).toBe('M. Benali');
    expect(authorLabel('GUARDIAN', { author: 'TEACHER', displayName: 'M. Benali' })).toBe('M. Benali');
    expect(authorLabel('TEACHER', { author: 'PARENT', displayName: 'Mère A' })).toBe('Mère A');
  });
});
