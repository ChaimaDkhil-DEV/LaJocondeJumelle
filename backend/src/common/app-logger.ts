import { ConsoleLogger } from '@nestjs/common';
import { SENSITIVE_KEY } from './sensitive-keys';

const MASK = '[masqué]';

/** Motifs de secrets dans du texte libre (messages d'erreur, piles d'appel). */
const PATTERNS: Array<[RegExp, string]> = [
  [/\$argon2(id|i|d)\$\S+/g, MASK],
  [/((?:cookie|authorization)\s*:\s*)[^\r\n]*/gi, `$1${MASK}`],
  [/("[\w-]*(?:pass(?:word)?|token|secret)[\w-]*"\s*:\s*")[^"]*(")/gi, `$1${MASK}$2`],
  [/(\b[\w-]*(?:pass(?:word)?|token|secret)[\w-]*\s*:\s*")[^"]*(")/gi, `$1${MASK}$2`],
  [/(\b[\w-]*(?:pass(?:word)?|token|secret)[\w-]*=)[^\s&;,]+/gi, `$1${MASK}`],
  [/(\bsid=)[^\s;,]+/gi, `$1${MASK}`],
];

/** Masque les secrets d'une valeur à journaliser (chaînes et objets, récursivement). */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (value instanceof Error) {
    const copy = new Error(redact(value.message) as string);
    copy.name = value.name;
    copy.stack = value.stack === undefined ? undefined : (redact(value.stack) as string);
    return copy;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, v]) => [key, SENSITIVE_KEY.test(key) ? MASK : redact(v, depth + 1)]),
  );
}

/**
 * Journaux de l'API (T116) : une ligne JSON par entrée sur la sortie standard (erreurs sur la
 * sortie d'erreur), lisible par `docker compose logs`, avec masquage des secrets.
 * Aucune requête HTTP n'est journalisée : ni corps, ni en-têtes, ni chaîne de requête.
 */
export class AppLogger extends ConsoleLogger {
  constructor(context?: string) {
    super(context ?? 'App', { json: true, colors: false });
  }

  override log(message: unknown, ...params: unknown[]): void {
    super.log(redact(message), ...params.map((p) => redact(p)));
  }

  override error(message: unknown, ...params: unknown[]): void {
    super.error(redact(message), ...params.map((p) => redact(p)));
  }

  override warn(message: unknown, ...params: unknown[]): void {
    super.warn(redact(message), ...params.map((p) => redact(p)));
  }

  override debug(message: unknown, ...params: unknown[]): void {
    super.debug(redact(message), ...params.map((p) => redact(p)));
  }

  override verbose(message: unknown, ...params: unknown[]): void {
    super.verbose(redact(message), ...params.map((p) => redact(p)));
  }

  override fatal(message: unknown, ...params: unknown[]): void {
    super.fatal(redact(message), ...params.map((p) => redact(p)));
  }
}
