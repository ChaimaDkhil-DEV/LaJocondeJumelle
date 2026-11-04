import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'ljj-language';

async function load() {
  vi.resetModules();
  return import('../../src/i18n');
}

describe('language', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
  });

  it('defaults to French', async () => {
    const { language, locale, t } = await load();
    expect(language()).toBe('fr');
    expect(locale()).toBe('fr-FR');
    expect(t('Mot de passe')).toBe('Mot de passe');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('reads the saved language and updates the document language', async () => {
    localStorage.setItem(KEY, 'en');
    const { language, locale, t } = await load();
    expect(language()).toBe('en');
    expect(locale()).toBe('en-GB');
    expect(t('Mot de passe')).toBe('Password');
    expect(document.documentElement.lang).toBe('en');
  });

  it('ignores an unknown saved value', async () => {
    localStorage.setItem(KEY, 'de');
    expect((await load()).language()).toBe('fr');
  });

  it('falls back to the French text when a translation is missing', async () => {
    localStorage.setItem(KEY, 'en');
    expect((await load()).t('Texte sans traduction')).toBe('Texte sans traduction');
  });

  it('fills in values in both languages', async () => {
    const fr = await load();
    expect(fr.t('{count} sur {total}', { count: 2, total: 5 })).toBe('2 sur 5');
    expect(fr.t('Page {page}', { page: 3 })).toBe('Page 3');
    localStorage.setItem(KEY, 'en');
    expect((await load()).t('Page {page}', { page: 3 })).toBe('Page 3');
  });

  it('leaves unknown placeholders visible', async () => {
    expect((await load()).t('Bonjour {name}')).toBe('Bonjour {name}');
  });

  it('saves the choice then reloads the page', async () => {
    const { setLanguage } = await load();
    const reload = vi.fn();
    setLanguage('en', reload);
    expect(localStorage.getItem(KEY)).toBe('en');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not reload when the language does not change', async () => {
    const { setLanguage } = await load();
    const reload = vi.fn();
    setLanguage('fr', reload);
    expect(reload).not.toHaveBeenCalled();
  });

  it('still works when the browser blocks storage', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { language, setLanguage } = await load();
    expect(language()).toBe('fr');
    expect(() => setLanguage('en', vi.fn())).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
