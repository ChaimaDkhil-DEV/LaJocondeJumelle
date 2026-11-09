/**
 * Libellé lisible d'un appareil abonné, ex. « iPhone · Safari » (spec 014, FR-011, research R16).
 * Calculé à partir de l'agent utilisateur avec une liste fixe : rien n'en est recopié, et l'agent
 * utilisateur brut n'est jamais conservé.
 */

const UNKNOWN = 'Appareil inconnu';

/** Système, dans l'ordre de reconnaissance (l'iPad avant l'iPhone, Android avant Linux). */
const SYSTEMS: Array<[RegExp, string]> = [
  [/iPad/, 'iPad'],
  [/iPhone|iPod/, 'iPhone'],
  [/Android/, 'Android'],
  [/Windows NT/, 'Windows'],
  [/Macintosh|Mac OS X/, 'macOS'],
  [/Linux|X11|CrOS/, 'Linux'],
];

/** Navigateur, dans l'ordre de reconnaissance (Samsung et Edge annoncent aussi Chrome). */
const BROWSERS: Array<[RegExp, string]> = [
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Edg(A|iOS)?\//, 'Edge'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/CriOS\/|Chrome\//, 'Chrome'],
  [/Version\/[\d.]+.*Safari\//, 'Safari'],
];

const first = (rules: Array<[RegExp, string]>, value: string) => rules.find(([pattern]) => pattern.test(value))?.[1];

export function deviceLabel(userAgent: string | undefined): string {
  const ua = userAgent?.trim() ?? '';
  const system = ua ? first(SYSTEMS, ua) : undefined;
  if (!system) return UNKNOWN;
  const browser = first(BROWSERS, ua);
  return browser ? `${system} · ${browser}` : system;
}
