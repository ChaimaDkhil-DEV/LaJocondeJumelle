import { sanitizeSuggestion } from '../../src/assist/domain/sanitize-suggestion';

/** 009, FR-005, FR-012, research R3 : la réponse du fournisseur n'est utilisée qu'après contrôle. */
const allowed = { categoryIds: ['cat-a', 'cat-b'], sourceIds: ['g1', 'g2'] };
const valid = {
  title: '  Photocopieuse   en panne ',
  categoryId: 'cat-a',
  priority: 'HIGH',
  reason: 'D’après la consigne « Pannes ».',
  missing: ['Précisez l’étage.'],
  sourceIds: ['g1'],
};

describe('sanitizeSuggestion', () => {
  it('garde une proposition valide, espaces normalisés', () => {
    expect(sanitizeSuggestion(valid, allowed)).toEqual({
      suggestion: {
        title: 'Photocopieuse en panne',
        categoryId: 'cat-a',
        priority: 'HIGH',
        reason: 'D’après la consigne « Pannes ».',
        missing: ['Précisez l’étage.'],
        sourceIds: ['g1'],
      },
      discarded: 0,
    });
  });

  it.each([
    ['catégorie inconnue', { categoryId: 'cat-x' }, 'categoryId'],
    ['catégorie non textuelle', { categoryId: 42 }, 'categoryId'],
    ['priorité inexistante', { priority: 'CRITICAL' }, 'priority'],
    ['priorité en minuscules', { priority: 'high' }, 'priority'],
    ['titre trop long', { title: 'x'.repeat(121) }, 'title'],
    ['titre vide', { title: '   ' }, 'title'],
    ['justification trop longue', { reason: 'x'.repeat(501) }, 'reason'],
    ['plus de 3 informations manquantes', { missing: ['a', 'b', 'c', 'd'] }, 'missing'],
    ['information manquante trop longue', { missing: ['x'.repeat(201)] }, 'missing'],
    ['informations manquantes non textuelles', { missing: [1] }, 'missing'],
  ])('écarte %s', (_label, patch, field) => {
    const result = sanitizeSuggestion({ ...valid, ...patch }, allowed);
    expect(result.discarded).toBe(1);
    expect(result.suggestion).not.toBeNull();
    expect(result.suggestion).not.toHaveProperty(field === 'missing' ? 'missing.0' : field);
    if (field === 'missing') expect(result.suggestion?.missing).toEqual([]);
  });

  it('ne garde que les sources effectivement transmises au fournisseur', () => {
    const result = sanitizeSuggestion({ ...valid, sourceIds: ['g1', 'g9', 3, 'g1'] }, allowed);
    expect(result.suggestion?.sourceIds).toEqual(['g1']);
    expect(result.discarded).toBe(2);
  });

  it('ignore les champs inconnus (aucune action possible)', () => {
    const result = sanitizeSuggestion({ ...valid, action: 'DELETE', sql: 'DROP TABLE x' }, allowed);
    expect(result.suggestion).not.toHaveProperty('action');
    expect(result.suggestion).not.toHaveProperty('sql');
  });

  it('sans titre, catégorie ni priorité valides : aucune proposition fiable', () => {
    expect(
      sanitizeSuggestion({ categoryId: 'cat-x', priority: 'NOW', reason: 'parce que', sourceIds: ['g1'] }, allowed).suggestion,
    ).toBeNull();
  });

  it.each([null, undefined, 'texte', 42, [], [valid], {}])('réponse inutilisable (%p) : aucune proposition', (raw) => {
    expect(sanitizeSuggestion(raw, allowed).suggestion).toBeNull();
  });
});
