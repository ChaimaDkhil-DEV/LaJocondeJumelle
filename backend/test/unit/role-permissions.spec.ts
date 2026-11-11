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
      'PARENT_COMM_SUBMIT_FOR_APPROVAL',
    ]);
  });

  it('017 (D6) : le rôle ADMIN soumet ses messages aux parents pour validation, sans envoi direct par défaut', () => {
    expect(DEFAULT_PERMISSIONS.ADMIN).toContain('PARENT_COMM_SUBMIT_FOR_APPROVAL');
    expect(DEFAULT_PERMISSIONS.ADMIN).not.toContain('PARENT_COMM_SEND_DIRECT');
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

  it('017 : l’envoi direct et la soumission aux parents ne se règlent que pour le rôle ADMIN', () => {
    for (const permission of ['PARENT_COMM_SEND_DIRECT', 'PARENT_COMM_SUBMIT_FOR_APPROVAL'] as const) {
      expect(CONFIGURABLE_PERMISSIONS.ADMIN).toContain(permission);
      expect(CONFIGURABLE_PERMISSIONS.EMPLOYEE).not.toContain(permission);
    }
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
