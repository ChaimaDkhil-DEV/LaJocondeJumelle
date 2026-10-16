import type { Permission, RequestStatus, Role } from '@prisma/client';
import { permissionsFor, type PolicyUser } from '../../src/common/authorization';
import {
  actorsFor,
  allowedActions,
  canCreateInCategory,
  canPickRecipient,
  canReadRequest,
  canWriteInThread,
  isReadOnlyStatus,
  type PolicyCategory,
  type PolicyRequest,
} from '../../src/requests/domain/access-policy';
import type { RulesSnapshot } from '../../src/requests/domain/request-state-machine';

/** Matrice d'accès — data-model.md §Matrice d'accès. */

const DEFAULT_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [],
  EMPLOYEE: ['REQUEST_CREATE', 'PRIORITY_CHANGE_OWN'],
  MANAGER: ['REQUEST_CREATE', 'PRIORITY_CHANGE_OWN', 'PRIORITY_CHANGE_MANAGED', 'REQUEST_REASSIGN'],
};

function user(id: string, role: Role, extra: Partial<PolicyUser> = {}): PolicyUser {
  return {
    id,
    role,
    active: true,
    permissions: permissionsFor(role, DEFAULT_PERMISSIONS[role]),
    ...extra,
  };
}

const enseignante = user('enseignante', 'EMPLOYEE');
const reprographie = user('reprographie', 'EMPLOYEE');
const reprographie2 = user('reprographie-2', 'EMPLOYEE');
const autreEmploye = user('autre', 'EMPLOYEE');
const responsable = user('responsable', 'MANAGER');
const autreResponsable = user('autre-responsable', 'MANAGER');
const superadmin = user('superadmin', 'SUPER_ADMIN');

const category: PolicyCategory = {
  id: 'photocopies',
  active: true,
  creatorRoles: ['EMPLOYEE', 'MANAGER'],
  recipientIds: new Set(['reprographie', 'reprographie-2']),
  managerIds: new Set(['responsable']),
};

const rules: RulesSnapshot = {
  circuit: 'A_DIRECT',
  closureMode: 'REQUESTER',
  autoCloseAfterMinutes: 1440,
  finalValidation: false,
  assignmentMode: 'MANUAL',
  photoRequired: false,
};

function request(status: RequestStatus, extra: Partial<PolicyRequest> = {}): PolicyRequest {
  return {
    kind: 'WORK',
    status,
    rules,
    hasVoice: true,
    hasDescription: false,
    requesterId: 'enseignante',
    assigneeId: 'reprographie',
    autoCloseAt: null,
    categoryId: 'photocopies',
    ...extra,
  };
}

describe('actorsFor', () => {
  it('cumule les relations de l’utilisateur avec la demande', () => {
    expect(actorsFor(enseignante, request('SENT'), category)).toEqual(['REQUESTER']);
    expect(actorsFor(reprographie, request('SENT'), category)).toEqual(['ASSIGNEE']);
    expect(actorsFor(responsable, request('SENT'), category)).toEqual(['MANAGER']);
    expect(actorsFor(superadmin, request('SENT'), category)).toEqual(['MANAGER']);
    expect(actorsFor(autreEmploye, request('SENT'), category)).toEqual([]);
    expect(
      actorsFor(responsable, request('SENT', { requesterId: 'responsable' }), category).sort(),
    ).toEqual(['MANAGER', 'REQUESTER']);
  });

  it('n’accorde aucune relation à un compte désactivé', () => {
    expect(actorsFor({ ...enseignante, active: false }, request('SENT'), category)).toEqual([]);
  });
});

describe('canReadRequest', () => {
  it.each([
    ['le demandeur', enseignante, true],
    ['l’employé affecté', reprographie, true],
    ['un responsable de la catégorie', responsable, true],
    ['le super administrateur', superadmin, true],
    ['un destinataire de la catégorie non affecté', reprographie2, false],
    ['un autre employé', autreEmploye, false],
    ['un responsable d’une autre catégorie', autreResponsable, false],
  ] as const)('%s → %s', (_label, who, expected) => {
    expect(canReadRequest(who, request('SENT'), category)).toBe(expected);
  });

  it('l’ancien affecté perd l’accès après réaffectation', () => {
    expect(canReadRequest(reprographie, request('SENT', { assigneeId: 'reprographie-2' }), category)).toBe(false);
  });

  it('en circuit B, la demande est invisible des destinataires avant approbation', () => {
    const pending = request('PENDING_ADMIN_VALIDATION', {
      assigneeId: null,
      rules: { ...rules, circuit: 'B_ADMIN_VALIDATION' },
    });
    expect(canReadRequest(reprographie, pending, category)).toBe(false);
    expect(canReadRequest(reprographie2, pending, category)).toBe(false);
    expect(canReadRequest(responsable, pending, category)).toBe(true);
    expect(canReadRequest(enseignante, pending, category)).toBe(true);
  });

  it('un brouillon n’est visible que de son auteur', () => {
    const draft = request('DRAFT', { assigneeId: null });
    expect(canReadRequest(enseignante, draft, category)).toBe(true);
    expect(canReadRequest(responsable, draft, category)).toBe(false);
    expect(canReadRequest(superadmin, draft, category)).toBe(false);
  });

  it('un compte désactivé ne voit rien', () => {
    expect(canReadRequest({ ...enseignante, active: false }, request('SENT'), category)).toBe(false);
  });
});

describe('allowedActions', () => {
  it('combine la machine à états et la relation de l’utilisateur', () => {
    expect(allowedActions(reprographie, request('SENT'), category).sort()).toEqual(['ACCEPT', 'DECLINE']);
    expect(allowedActions(enseignante, request('SENT'), category).sort()).toEqual(['CANCEL', 'CHANGE_PRIORITY']);
    expect(allowedActions(autreEmploye, request('SENT'), category)).toEqual([]);
  });

  it('REASSIGN exige la permission REQUEST_REASSIGN', () => {
    expect(allowedActions(responsable, request('IN_PROGRESS'), category)).toContain('REASSIGN');
    const sansReaffectation = user('responsable', 'MANAGER', {
      permissions: permissionsFor('MANAGER', ['REQUEST_CREATE']),
    });
    expect(allowedActions(sansReaffectation, request('IN_PROGRESS'), category)).not.toContain('REASSIGN');
    expect(allowedActions(superadmin, request('IN_PROGRESS'), category)).toContain('REASSIGN');
  });

  it.each(['DRAFT', 'PENDING_ADMIN_VALIDATION', 'SENT'] as const)(
    'le demandeur avec PRIORITY_CHANGE_OWN peut changer la priorité en %s',
    (status) => {
      expect(allowedActions(enseignante, request(status), category)).toContain('CHANGE_PRIORITY');
    },
  );

  it('le demandeur ne peut plus changer la priorité après acceptation', () => {
    expect(allowedActions(enseignante, request('ACCEPTED'), category)).not.toContain('CHANGE_PRIORITY');
  });

  it('le demandeur sans PRIORITY_CHANGE_OWN ne peut pas changer la priorité', () => {
    const sansPriorite = user('enseignante', 'EMPLOYEE', { permissions: permissionsFor('EMPLOYEE', ['REQUEST_CREATE']) });
    expect(allowedActions(sansPriorite, request('SENT'), category)).not.toContain('CHANGE_PRIORITY');
  });

  it.each([
    ['ACCEPTED', true],
    ['IN_PROGRESS', true],
    ['TO_CORRECT', true],
    ['DONE', false],
    ['CLOSED', false],
    ['REJECTED', false],
    ['CANCELLED', false],
  ] as const)('le responsable avec PRIORITY_CHANGE_MANAGED en %s → %s', (status, expected) => {
    expect(allowedActions(responsable, request(status), category).includes('CHANGE_PRIORITY')).toBe(expected);
  });

  it('aucune action sur une demande illisible', () => {
    expect(allowedActions(responsable, request('DRAFT'), category)).toEqual([]);
  });
});

describe('canCreateInCategory', () => {
  it('exige un compte actif, une catégorie active, un rôle autorisé et REQUEST_CREATE', () => {
    expect(canCreateInCategory(enseignante, category)).toBe(true);
    expect(canCreateInCategory({ ...enseignante, active: false }, category)).toBe(false);
    expect(canCreateInCategory(enseignante, { ...category, active: false })).toBe(false);
    expect(canCreateInCategory(enseignante, { ...category, creatorRoles: ['MANAGER'] })).toBe(false);
    const sansCreation = user('x', 'EMPLOYEE', { permissions: permissionsFor('EMPLOYEE', []) });
    expect(canCreateInCategory(sansCreation, category)).toBe(false);
  });

  it('le super administrateur peut créer dans toute catégorie active', () => {
    expect(canCreateInCategory(superadmin, { ...category, creatorRoles: [] })).toBe(true);
  });
});

describe('canPickRecipient', () => {
  it('accepte uniquement un utilisateur actif parmi les destinataires de la catégorie', () => {
    expect(canPickRecipient(category, { id: 'reprographie', active: true })).toBe(true);
    expect(canPickRecipient(category, { id: 'reprographie', active: false })).toBe(false);
    expect(canPickRecipient(category, { id: 'autre', active: true })).toBe(false);
    expect(canPickRecipient(category, null)).toBe(false);
  });
});

describe('canWriteInThread', () => {
  it('réserve l’écriture aux participants, sur une demande ni brouillon ni finale', () => {
    expect(canWriteInThread(enseignante, request('IN_PROGRESS'), category)).toBe(true);
    expect(canWriteInThread(reprographie, request('IN_PROGRESS'), category)).toBe(true);
    expect(canWriteInThread(responsable, request('IN_PROGRESS'), category)).toBe(true);
    expect(canWriteInThread(autreEmploye, request('IN_PROGRESS'), category)).toBe(false);
    for (const status of ['CLOSED', 'REJECTED', 'CANCELLED', 'DRAFT'] as const) {
      expect(canWriteInThread(enseignante, request(status), category)).toBe(false);
    }
  });
});

describe('Demande en lecture seule', () => {
  it('fige le travail terminé et les statuts finaux, pas les demandes actives', () => {
    const readOnly = ['DONE', 'PENDING_FINAL_VALIDATION', 'CLOSED', 'REJECTED', 'CANCELLED'];
    const all: RequestStatus[] = ['DRAFT', 'PENDING_ADMIN_VALIDATION', 'SENT', 'ACCEPTED', 'IN_PROGRESS', 'TO_CORRECT', ...(readOnly as RequestStatus[])];
    expect(all.filter(isReadOnlyStatus).sort()).toEqual([...readOnly].sort());
  });

  it('ferme la discussion à tous les participants et retire le changement de priorité', () => {
    for (const status of ['DONE', 'PENDING_FINAL_VALIDATION'] as const) {
      for (const user of [enseignante, reprographie, responsable]) {
        expect(canWriteInThread(user, request(status), category)).toBe(false);
        expect(allowedActions(user, request(status), category)).not.toContain('CHANGE_PRIORITY');
      }
    }
    expect(canWriteInThread(enseignante, request('TO_CORRECT'), category)).toBe(true);
  });
});
