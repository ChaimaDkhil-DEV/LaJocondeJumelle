import { toMeResponse, type AuthenticatedUser } from '../../src/auth/auth.types';

/** Spec 005 (FR-003, R1) : `/api/auth/me` renvoie aussi l'identifiant et la fonction du compte. */

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u1',
    username: 'enseignante',
    displayName: 'Enseignante',
    jobTitle: 'Professeure des écoles',
    role: 'EMPLOYEE',
    active: true,
    mustChangePassword: false,
    permissions: new Set(['PRIORITY_CHANGE_OWN', 'REQUEST_CREATE']),
    ...overrides,
  };
}

describe('toMeResponse', () => {
  it('renvoie l’identifiant de connexion et la fonction', () => {
    const me = toMeResponse(user());
    expect(me.username).toBe('enseignante');
    expect(me.jobTitle).toBe('Professeure des écoles');
  });

  it('renvoie une fonction nulle quand elle n’est pas renseignée', () => {
    expect(toMeResponse(user({ jobTitle: null })).jobTitle).toBeNull();
  });

  it('garde les champs existants inchangés', () => {
    expect(toMeResponse(user(), { isTeacher: true, isSupervisor: false })).toEqual({
      id: 'u1',
      username: 'enseignante',
      displayName: 'Enseignante',
      jobTitle: 'Professeure des écoles',
      role: 'EMPLOYEE',
      permissions: ['PRIORITY_CHANGE_OWN', 'REQUEST_CREATE'],
      mustChangePassword: false,
      isTeacher: true,
      isSupervisor: false,
    });
  });
});
