import { suggestRecipient } from '../../src/assist/domain/suggest-recipient';

/** Création vocale assistée : destinataire proposé seulement parmi les destinataires autorisés. */
const repro = { id: 'u-repro', displayName: 'Reprographie' };
const martin = { id: 'u-martin', displayName: 'Paul Martin' };
const durand = { id: 'u-durand', displayName: 'Léa Durand' };

describe('suggestRecipient', () => {
  it('un seul destinataire autorisé : il est proposé', () => {
    expect(suggestRecipient('La photocopieuse est en panne.', [repro])).toEqual({
      recipientId: 'u-repro',
      recipientName: 'Reprographie',
      recipientReason: 'Seul destinataire prévu pour cette catégorie.',
    });
  });

  it('plusieurs destinataires : celui dont le nom complet est cité, accents et casse ignorés', () => {
    expect(suggestRecipient('Pourrais-tu transmettre à lea DURAND les copies ?', [martin, durand])).toMatchObject({
      recipientId: 'u-durand',
      recipientName: 'Léa Durand',
    });
  });

  it('plusieurs destinataires sans nom cité, ou plusieurs noms cités : à confirmer', () => {
    expect(suggestRecipient('Il faut des copies pour demain.', [martin, durand])).toBeNull();
    expect(suggestRecipient('Paul Martin et Léa Durand ont besoin des copies.', [martin, durand])).toBeNull();
  });

  it('un nom cité qui n’est pas un destinataire autorisé n’est jamais proposé', () => {
    expect(suggestRecipient('Demande pour Jean Dupont, le directeur.', [martin, durand])).toBeNull();
  });

  it('un prénom seul ne suffit pas (le nom complet doit être cité)', () => {
    expect(suggestRecipient('Demande pour Paul.', [martin, durand])).toBeNull();
  });

  it('aucun destinataire autorisé (circuit B) : aucune proposition', () => {
    expect(suggestRecipient('Reprographie en panne.', [])).toBeNull();
  });
});
