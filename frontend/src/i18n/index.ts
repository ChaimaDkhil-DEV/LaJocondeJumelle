import { en } from './en';

export type Language = 'fr' | 'en';

const STORAGE_KEY = 'ljj-language';

function savedLanguage(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
}

/**
 * The language is read once at startup and changing it reloads the page, so labels defined at
 * module level (status names, date formats) are always built in the right language.
 */
const current = savedLanguage();
document.documentElement.lang = current;

export function language(): Language {
  return current;
}

/** Locale for dates and numbers. */
export function locale(): string {
  return current === 'en' ? 'en-GB' : 'fr-FR';
}

export function setLanguage(next: Language, reload: () => void = () => window.location.reload()): void {
  if (next === current) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage blocked by the browser: the page simply stays in the current language.
  }
  reload();
}

/**
 * Translates a French text. The French text is the key: it is returned unchanged in French, and
 * when the English dictionary has no entry. Values replace {name} placeholders.
 */
export function t(text: string, values?: Record<string, string | number>): string {
  const translated = current === 'en' ? (en[text] ?? text) : text;
  if (!values) return translated;
  return translated.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in values ? String(values[name]) : placeholder,
  );
}

/** French uses the singular for 0 and 1; English only for exactly 1. */
export function isPlural(count: number): boolean {
  return current === 'en' ? count !== 1 : count > 1;
}
