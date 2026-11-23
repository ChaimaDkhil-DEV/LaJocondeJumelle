import { describe, expect, it } from 'vitest';
import type { Me } from '../../src/api/types';
import { navItemsFor } from '../../src/app/AppLayout';

/** « Mon emploi du temps » est une section du menu de gauche, pour les membres du groupe Enseignants. */

const me = (overrides: Partial<Me>): Me =>
  ({
    id: 'u1',
    username: 'u',
    displayName: 'U',
    jobTitle: null,
    role: 'EMPLOYEE',
    permissions: [],
    mustChangePassword: false,
    isTeacher: false,
    isSupervisor: false,
    ...overrides,
  }) as Me;

const LABEL = 'Mon emploi du temps';
const labels = (user: Me) => navItemsFor(user).map((item) => item.label);

describe('Menu : Mon emploi du temps', () => {
  it('un enseignant a la section, qui mène à /emploi-du-temps', () => {
    const item = navItemsFor(me({ isTeacher: true })).find((i) => i.label === LABEL);
    expect(item?.to).toBe('/emploi-du-temps');
  });

  it.each([
    ['employé enseignant', me({ isTeacher: true })],
    ['admin enseignant', me({ role: 'ADMIN', isTeacher: true })],
    ['super administrateur enseignant', me({ role: 'SUPER_ADMIN', isTeacher: true })],
  ])('%s : la section est dans le menu', (_label, user) => {
    expect(labels(user)).toContain(LABEL);
  });

  it.each([
    ['employé non enseignant', me({})],
    ['surveillant', me({ isSupervisor: true })],
    ['admin non enseignant', me({ role: 'ADMIN' })],
    ['super administrateur non enseignant', me({ role: 'SUPER_ADMIN' })],
    ['parent', me({ role: 'PARENT', isTeacher: true })],
  ])('%s : pas de section (il n’a pas d’emploi du temps)', (_label, user) => {
    expect(labels(user)).not.toContain(LABEL);
  });

  it('elle vient après « Nouvelle demande » et avant « Mon assiduité », une seule fois', () => {
    const all = labels(me({ isTeacher: true }));
    expect(all.filter((l) => l === LABEL)).toHaveLength(1);
    expect(all.indexOf(LABEL)).toBeGreaterThan(all.indexOf('Nouvelle demande'));
    expect(all.indexOf(LABEL)).toBeLessThan(all.indexOf('Mon assiduité'));
  });

  it('l’entrée est mise en évidence sur /emploi-du-temps, et seulement là', () => {
    const item = navItemsFor(me({ isTeacher: true })).find((i) => i.label === LABEL)!;
    expect(item.matches('/emploi-du-temps')).toBe(true);
    expect(item.matches('/emploi-du-temps?vue=liste'.split('?')[0]!)).toBe(true);
    expect(item.matches('/')).toBe(false);
    expect(item.matches('/demandes')).toBe(false);
    expect(item.matches('/gardes')).toBe(false);
  });
});

/** La section « Surveillance » s'appelle « Mon assiduité » pour un enseignant qui n'est ni surveillant ni gestionnaire. */
describe('Menu : « Surveillance » ou « Mon assiduité » selon le rôle', () => {
  const coverage = (user: Me) => navItemsFor(user).find((i) => i.to === '/gardes');

  it('un enseignant voit « Mon assiduité », à la même adresse, et plus « Surveillance »', () => {
    const user = me({ isTeacher: true });
    expect(labels(user)).toContain('Mon assiduité');
    expect(labels(user)).not.toContain('Surveillance');
    expect(coverage(user)?.label).toBe('Mon assiduité');
    expect(coverage(user)?.to).toBe('/gardes');
  });

  it('l’entrée reste mise en évidence sur toute la section (/gardes et ses pages)', () => {
    const item = coverage(me({ isTeacher: true }))!;
    for (const path of ['/gardes', '/gardes/signaler', '/gardes/signalements/abc', '/gardes/presence']) expect(item.matches(path)).toBe(true);
    expect(item.matches('/emploi-du-temps')).toBe(false);
  });

  it.each([
    ['surveillant', me({ isSupervisor: true })],
    ['enseignant et surveillant', me({ isTeacher: true, isSupervisor: true })],
    ['admin', me({ role: 'ADMIN' })],
    ['admin enseignant', me({ role: 'ADMIN', isTeacher: true })],
    ['super administrateur enseignant', me({ role: 'SUPER_ADMIN', isTeacher: true })],
  ])('%s : la section garde le nom « Surveillance »', (_label, user) => {
    expect(coverage(user)?.label).toBe('Surveillance');
    expect(labels(user)).not.toContain('Mon assiduité');
  });

  it('un employé qui n’est ni enseignant ni surveillant n’a pas la section', () => {
    expect(coverage(me({}))).toBeUndefined();
  });
});
