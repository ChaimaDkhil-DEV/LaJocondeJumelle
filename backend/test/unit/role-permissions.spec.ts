import { CONFIGURABLE_PERMISSIONS } from '../../src/settings/admin-settings.service';
import { DEFAULT_PERMISSIONS } from '../../src/settings/default-permissions';

/**
 * Permissions par rôle : la surveillante générale (rôle ADMIN) valide les communications aux parents
 * (015). Accordée par défaut, retirable dans les réglages ; jamais attribuable aux employés ni aux parents.
 */

describe('permissions par défaut', () => {
  it('le rôle ADMIN valide les communications aux parents, en plus de ses permissions existantes', () => {
    expect(DEFAULT_PERMISSIONS.ADMIN).toEqual([
      'REQUEST_CREATE',
      'PRIORITY_CHANGE_OWN',
      'PRIORITY_CHANGE_MANAGED',
      'REQUEST_REASSIGN',
      'PARENT_COMMUNICATION_VALIDATE',
    ]);
  });

  it('ni les employés ni les parents ne valident par défaut', () => {
    expect(DEFAULT_PERMISSIONS.EMPLOYEE).not.toContain('PARENT_COMMUNICATION_VALIDATE');
    expect(DEFAULT_PERMISSIONS.PARENT).toEqual([]);
  });
});

describe('permissions attribuables dans les réglages', () => {
  it('la validation des communications aux parents ne se règle que pour le rôle ADMIN', () => {
    expect(CONFIGURABLE_PERMISSIONS.ADMIN).toContain('PARENT_COMMUNICATION_VALIDATE');
    expect(CONFIGURABLE_PERMISSIONS.EMPLOYEE).not.toContain('PARENT_COMMUNICATION_VALIDATE');
  });

  it('l’administration et l’audit restent réservés au super administrateur', () => {
    for (const permissions of Object.values(CONFIGURABLE_PERMISSIONS)) {
      expect(permissions).not.toContain('ADMIN_MANAGE');
      expect(permissions).not.toContain('AUDIT_READ');
    }
  });

  it('chaque permission par défaut est réglable pour son rôle (sinon les réglages ne s’enregistrent plus)', () => {
    for (const role of ['EMPLOYEE', 'ADMIN'] as const) {
      for (const permission of DEFAULT_PERMISSIONS[role]) {
        expect(CONFIGURABLE_PERMISSIONS[role]).toContain(permission);
      }
    }
  });
});
