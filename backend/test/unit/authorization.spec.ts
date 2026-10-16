import type { Permission, Role } from '@prisma/client';
import { canManageAdministration, canReadAudit, permissionsFor, type PolicyUser } from '../../src/common/authorization';

/** Règles transverses, déplacées de access-policy.spec.ts (T035) : attendus inchangés. */

const DEFAULT_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [],
  EMPLOYEE: ['REQUEST_CREATE', 'PRIORITY_CHANGE_OWN'],
  MANAGER: ['REQUEST_CREATE', 'PRIORITY_CHANGE_OWN', 'PRIORITY_CHANGE_MANAGED', 'REQUEST_REASSIGN'],
};

function user(id: string, role: Role): PolicyUser {
  return { id, role, active: true, permissions: permissionsFor(role, DEFAULT_PERMISSIONS[role]) };
}

const enseignante = user('enseignante', 'EMPLOYEE');
const responsable = user('responsable', 'MANAGER');
const superadmin = user('superadmin', 'SUPER_ADMIN');

describe('permissionsFor', () => {
  it('donne toutes les permissions au super administrateur, sans les stocker', () => {
    expect(superadmin.permissions.size).toBe(6);
  });

  it('reprend les permissions configurées pour les autres rôles', () => {
    expect([...enseignante.permissions].sort()).toEqual(['PRIORITY_CHANGE_OWN', 'REQUEST_CREATE']);
  });
});

describe('administration et audit', () => {
  it('sont réservés au super administrateur', () => {
    expect(canManageAdministration(superadmin)).toBe(true);
    expect(canReadAudit(superadmin)).toBe(true);
    for (const who of [responsable, enseignante]) {
      expect(canManageAdministration(who)).toBe(false);
      expect(canReadAudit(who)).toBe(false);
    }
    expect(canManageAdministration({ ...superadmin, active: false })).toBe(false);
  });
});
