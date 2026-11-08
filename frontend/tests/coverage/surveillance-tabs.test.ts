import { describe, expect, it } from 'vitest';
import {
  ADMIN_TAB_KEYS,
  DEFAULT_TRACKING_FILTER,
  resolveLegacyTab,
  TRACKING_FILTERS,
  TRACKING_SCOPE,
  trackingFilterOf,
} from '../../src/features/coverage/surveillanceTabs';

/** 012 (research R4, data-model.md) : clés des onglets de « Surveillance » et anciennes adresses. */

describe('clés des onglets et des filtres', () => {
  it('trois onglets d’administration, dans l’ordre', () => {
    expect(ADMIN_TAB_KEYS).toEqual(['absences-retards', 'affectation', 'suivi']);
  });

  it('trois filtres de suivi, « Prise en charge » par défaut', () => {
    expect(TRACKING_FILTERS).toEqual(['en-attente', 'prise-en-charge', 'terminee']);
    expect(DEFAULT_TRACKING_FILTER).toBe('prise-en-charge');
  });

  it('chaque filtre reprend la liste d’un ancien onglet', () => {
    expect(TRACKING_SCOPE).toEqual({ 'en-attente': 'pending', 'prise-en-charge': 'active', terminee: 'finished' });
  });

  it.each([
    [null, 'prise-en-charge'],
    ['', 'prise-en-charge'],
    ['inconnu', 'prise-en-charge'],
    ['en-attente', 'en-attente'],
    ['terminee', 'terminee'],
  ])('filtre %s → %s', (value, expected) => {
    expect(trackingFilterOf(value)).toBe(expected);
  });
});

describe('anciennes adresses', () => {
  it.each([
    ['presences', { onglet: 'absences-retards', filtre: null, hash: null }],
    ['en-attente', { onglet: 'affectation', filtre: null, hash: null }],
    ['doublons', { onglet: 'affectation', filtre: null, hash: 'doublons' }],
    ['equipe', { onglet: 'affectation', filtre: null, hash: 'equipe' }],
    ['en-cours', { onglet: 'suivi', filtre: 'prise-en-charge', hash: null }],
    ['terminees', { onglet: 'suivi', filtre: 'terminee', hash: null }],
  ])('?onglet=%s → nouvelle organisation', (former, expected) => {
    expect(resolveLegacyTab(former)).toEqual(expected);
  });

  it.each([null, 'absences-retards', 'affectation', 'suivi', 'mes-signalements', 'mes-presences', 'mes-affectations', 'historique', 'inconnu'])(
    '?onglet=%s : rien à traduire',
    (key) => {
      expect(resolveLegacyTab(key)).toBeNull();
    },
  );
});
