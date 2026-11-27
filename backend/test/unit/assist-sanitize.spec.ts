import { sanitizeSuggestion } from '../../src/assist/domain/sanitize-suggestion';

/** 009, FR-005, FR-012, research R3 : la réponse du fournisseur n'est utilisée qu'après contrôle. */
const allowed = { categoryIds: ['cat-a', 'cat-b'], sourceIds: ['g1', 'g2'] };
const valid = {
  title: '  Photocopieuse   en panne ',
  categoryId: 'cat-a',
  priority: 'URGENT',
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
        priority: 'URGENT',
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
    ['priorité en minuscules', { priority: 'urgent' }, 'priority'],
    ['priorité retirée (MEDIUM, 016)', { priority: 'MEDIUM' }, 'priority'],
    ['priorité retirée (HIGH, 016)', { priority: 'HIGH' }, 'priority'],
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

  // 010 (T014) : garde-fou indépendant de la contrainte de sortie d'un connecteur réel (Claude).
  it('écarte les valeurs hors liste d’une sortie de connecteur, même structurée', () => {
    const fromConnector = { title: 'Photocopieuse en panne', categoryId: 'cat-inconnue', priority: 'CRITICAL', missing: [], sourceIds: ['g-inconnue', 'g2'] };
    const { suggestion, discarded } = sanitizeSuggestion(fromConnector, allowed);
    expect(suggestion).toEqual({ title: 'Photocopieuse en panne', missing: [], sourceIds: ['g2'] });
    expect(discarded).toBe(3);
  });

  // Ollama : résumé informatif et destinataire proposé, contrôlés comme le reste.
  describe('résumé et destinataire proposés par le fournisseur', () => {
    const withRecipients = { ...allowed, recipientIds: { 'cat-a': ['u1', 'u2'], 'cat-b': [] } };

    it('garde un résumé valide (espaces normalisés) ; écarte un résumé vide, trop long ou non textuel', () => {
      expect(sanitizeSuggestion({ ...valid, summary: '  La photocopieuse   ne marche plus. ' }, allowed).suggestion?.summary).toBe('La photocopieuse ne marche plus.');
      for (const summary of ['   ', 'x'.repeat(1001), 42]) {
        const result = sanitizeSuggestion({ ...valid, summary }, allowed);
        expect(result.suggestion).not.toHaveProperty('summary');
        expect(result.discarded).toBe(1);
      }
    });

    it('un résumé seul ne fait pas une proposition fiable', () => {
      expect(sanitizeSuggestion({ summary: 'Résumé.' }, allowed).suggestion).toBeNull();
    });

    it('garde un destinataire autorisé pour la catégorie proposée', () => {
      expect(sanitizeSuggestion({ ...valid, recipientId: 'u2' }, withRecipients)).toMatchObject({ suggestion: { categoryId: 'cat-a', recipientId: 'u2' }, discarded: 0 });
    });

    it.each([
      ['identifiant inconnu', { recipientId: 'u9' }],
      ['identifiant non textuel', { recipientId: 7 }],
      ['destinataire d’une autre catégorie', { categoryId: 'cat-b', recipientId: 'u1' }],
      ['sans catégorie retenue', { categoryId: 'cat-x', recipientId: 'u1' }],
    ])('écarte un destinataire non autorisé (%s)', (_label, patch) => {
      const result = sanitizeSuggestion({ ...valid, ...patch }, withRecipients);
      expect(result.suggestion).not.toHaveProperty('recipientId');
      expect(result.discarded).toBeGreaterThanOrEqual(1);
    });

    it('sans liste de destinataires transmise, aucun destinataire n’est retenu', () => {
      expect(sanitizeSuggestion({ ...valid, recipientId: 'u1' }, allowed).suggestion).not.toHaveProperty('recipientId');
    });

    it('catégorie choisie par l’utilisateur : le destinataire est contrôlé pour elle, même sans catégorie renvoyée', () => {
      const chosen = { ...withRecipients, categoryIds: ['cat-a'], chosenCategoryId: 'cat-a' };
      const withoutCategory = { ...valid, categoryId: undefined };
      expect(sanitizeSuggestion({ ...withoutCategory, recipientId: 'u1' }, chosen).suggestion?.recipientId).toBe('u1');
      expect(sanitizeSuggestion({ ...withoutCategory, recipientId: 'u9' }, chosen).suggestion).not.toHaveProperty('recipientId');
    });
  });
});
