import type { Permission, Role } from '@prisma/client';
import { canManageAdministration, canUseAdministrationSpace, permissionsFor, type PolicyUser } from '../../src/common/authorization';

/** Règles transverses, déplacées de access-policy.spec.ts (T035) : attendus inchangés. */

const DEFAULT_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [],
  EMPLOYEE: ['REQUEST_CREATE', 'PRIORITY_CHANGE_OWN'],
  ADMIN: ['REQUEST_CREATE', 'PRIORITY_CHANGE_OWN', 'PRIORITY_CHANGE_MANAGED', 'REQUEST_REASSIGN'],
  PARENT: [],
};

function user(id: string, role: Role): PolicyUser {
  return { id, role, active: true, permissions: permissionsFor(role, DEFAULT_PERMISSIONS[role]) };
}

const enseignante = user('enseignante', 'EMPLOYEE');
const responsable = user('responsable', 'ADMIN');
const superadmin = user('superadmin', 'SUPER_ADMIN');

describe('permissionsFor', () => {
  it('donne toutes les permissions au super administrateur, sans les stocker', () => {
    // 015 : PARENT_COMMUNICATION_VALIDATE s'ajoute aux six permissions existantes ; 017 : envoi direct et
    // soumission aux parents.
    expect(superadmin.permissions.size).toBe(9);
    expect(superadmin.permissions.has('PARENT_COMMUNICATION_VALIDATE')).toBe(true);
    expect(superadmin.permissions.has('PARENT_COMM_SEND_DIRECT')).toBe(true);
    expect(superadmin.permissions.has('PARENT_COMM_SUBMIT_FOR_APPROVAL')).toBe(true);
  });

  it('reprend les permissions configurées pour les autres rôles', () => {
    expect([...enseignante.permissions].sort()).toEqual(['PRIORITY_CHANGE_OWN', 'REQUEST_CREATE']);
  });
});

describe('administration et audit', () => {
  it('sont réservés au super administrateur', () => {
    expect(canManageAdministration(superadmin)).toBe(true);
    for (const who of [responsable, enseignante]) {
      expect(canManageAdministration(who)).toBe(false);
    }
    expect(canManageAdministration({ ...superadmin, active: false })).toBe(false);
  });
});

/** 011 (FR-001 à FR-004, FR-007) : données de référence et liste des employés, admin et super administrateur actifs. */
describe('canUseAdministrationSpace', () => {
  it.each([
    ['SUPER_ADMIN', true, true],
    ['ADMIN', true, true],
    ['EMPLOYEE', true, false],
    ['SUPER_ADMIN', false, false],
    ['ADMIN', false, false],
    ['EMPLOYEE', false, false],
  ] as const)('%s actif=%s → %s', (role, active, expected) => {
    expect(canUseAdministrationSpace({ role, active })).toBe(expected);
  });

  it('n’élargit pas la gestion de l’administration réservée au super administrateur', () => {
    expect(canManageAdministration(responsable)).toBe(false);
    expect(canUseAdministrationSpace(responsable)).toBe(true);
  });
});
