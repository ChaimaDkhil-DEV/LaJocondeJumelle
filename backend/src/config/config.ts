import { isIP } from 'node:net';

/**
 * Configuration lue depuis les variables d'environnement et validée au démarrage :
 * l'application refuse de démarrer si une valeur obligatoire manque (principe IV,
 * aucun secret dans le code).
 */
export interface AppConfig {
  databaseUrl: string;
  sessionSecret: string;
  filesDir: string;
  appOrigin: string;
  port: number;
  ffmpegPath: string;
  ffprobePath: string;
  /** Cookie de session `Secure` (désactivable en développement HTTP pour Safari/WebKit). */
  cookieSecure: boolean;
  /** Tentatives de connexion par minute et par (IP, identifiant) ; toujours 5 en production. */
  loginRateLimit: number;
  /** Jobs planifiés (clôture automatique, retards). Désactivés dans les tests d'intégration. */
  jobsEnabled: boolean;
  isProduction: boolean;
  /** Réglage `trust proxy` d'Express : booléen, nombre de proxys, ou liste de sous-réseaux. */
  trustProxy: boolean | number | string;
  /** Fuseau de l'école (identifiant IANA) : jours et heures locales des affectations (R4). */
  schoolTimezone: string;
  /** Assistance IA à la création des demandes (spec 009) : désactivée par défaut. */
  assist: AssistConfig;
}

/** `disabled` : aucune assistance ; `demo` : fournisseur local déterministe, refusé en production. */
export type AssistProviderName = 'disabled' | 'demo';

export interface AssistConfig {
  suggestionProvider: AssistProviderName;
  transcriptionProvider: AssistProviderName;
  /** Délai maximal d'un appel de fournisseur (1 000 à 20 000 ms). */
  timeoutMs: number;
  /** Appels (transcription et propositions réunies) par utilisateur et par 5 minutes. */
  rateLimit: number;
  /** Texte renvoyé par la transcription de démonstration ; null : phrase par défaut. */
  demoTranscript: string | null;
}

export class ConfigError extends Error {}

const DEFAULT_SCHOOL_TIMEZONE = 'Europe/Paris';

/** Valide SCHOOL_TIMEZONE (défaut : Europe/Paris) : tout identifiant accepté par Intl. */
function parseSchoolTimezone(raw: string | undefined): string {
  const value = raw?.trim() || DEFAULT_SCHOOL_TIMEZONE;
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: value });
  } catch {
    throw new ConfigError(
      `SCHOOL_TIMEZONE invalide : « ${value} » n'est pas un fuseau IANA (ex. Europe/Paris)`,
    );
  }
  return value;
}

let cachedTimezone: { raw: string | undefined; value: string } | null = null;

/**
 * Fuseau de l'école pour le code pur (règles de créneaux) : même lecture et même validation que
 * `loadConfig` (déjà faite au démarrage), mise en cache.
 */
export function schoolTimezoneFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  if (!cachedTimezone || cachedTimezone.raw !== env.SCHOOL_TIMEZONE) {
    cachedTimezone = { raw: env.SCHOOL_TIMEZONE, value: parseSchoolTimezone(env.SCHOOL_TIMEZONE) };
  }
  return cachedTimezone.value;
}

const ASSIST_PROVIDERS: readonly AssistProviderName[] = ['disabled', 'demo'];
const DEFAULT_ASSIST_TIMEOUT_MS = 15_000;
const DEFAULT_ASSIST_RATE_LIMIT = 10;

function parseAssistProvider(key: string, raw: string | undefined, isProduction: boolean): AssistProviderName {
  const value = raw === undefined || raw.trim() === '' ? 'disabled' : raw;
  if (!ASSIST_PROVIDERS.includes(value as AssistProviderName)) {
    throw new ConfigError(`${key} invalide : utilisez ${ASSIST_PROVIDERS.join(' ou ')}`);
  }
  // Une transcription ou des propositions factices ne doivent jamais atteindre les utilisateurs réels.
  if (value === 'demo' && isProduction) {
    throw new ConfigError(`${key}=demo est réservé au développement et aux tests`);
  }
  return value as AssistProviderName;
}

function parseBoundedInt(key: string, raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw.trim()) || value < min || value > max) {
    throw new ConfigError(`${key} doit être un entier entre ${min} et ${max}`);
  }
  return value;
}

function parseAssist(env: NodeJS.ProcessEnv, isProduction: boolean): AssistConfig {
  return {
    suggestionProvider: parseAssistProvider('ASSIST_SUGGESTION_PROVIDER', env.ASSIST_SUGGESTION_PROVIDER, isProduction),
    transcriptionProvider: parseAssistProvider('ASSIST_TRANSCRIPTION_PROVIDER', env.ASSIST_TRANSCRIPTION_PROVIDER, isProduction),
    timeoutMs: parseBoundedInt('ASSIST_TIMEOUT_MS', env.ASSIST_TIMEOUT_MS, DEFAULT_ASSIST_TIMEOUT_MS, 1_000, 20_000),
    rateLimit: parseBoundedInt('ASSIST_RATE_LIMIT', env.ASSIST_RATE_LIMIT, DEFAULT_ASSIST_RATE_LIMIT, 1, 1_000),
    demoTranscript: env.ASSIST_DEMO_TRANSCRIPT?.trim() || null,
  };
}

const MIN_SECRET_LENGTH = 32;
const DEFAULT_LOGIN_RATE_LIMIT = 5;
const TRUST_PROXY_NAMES = new Set(['loopback', 'linklocal', 'uniquelocal']);

/** Adresse IP, ou plage CIDR dont le préfixe tient dans la famille d'adresses. */
function isAddressOrRange(value: string): boolean {
  const [address, prefix, extra] = value.split('/');
  const family = isIP(address);
  if (family === 0 || extra !== undefined) return false;
  if (prefix === undefined) return true;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (family === 4 ? 32 : 128);
}

/** Valide TRUST_PROXY (défaut : loopback) ; refuse toute valeur qu'Express interpréterait mal. */
function parseTrustProxy(raw: string | undefined): boolean | number | string {
  const value = raw?.trim() || 'loopback';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  const entries = value.split(',').map((entry) => entry.trim());
  if (entries.every((entry) => TRUST_PROXY_NAMES.has(entry) || isAddressOrRange(entry)))
    return entries.join(',');
  throw new ConfigError(
    'TRUST_PROXY invalide : utilisez true, false, un nombre de proxys, ou une liste parmi loopback, linklocal, uniquelocal, adresses IP ou plages CIDR',
  );
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const missing = ['DATABASE_URL', 'SESSION_SECRET', 'FILES_DIR', 'APP_ORIGIN'].filter(
    (key) => !env[key]?.trim(),
  );
  if (missing.length > 0) {
    throw new ConfigError(`Variables d'environnement manquantes : ${missing.join(', ')}`);
  }

  const sessionSecret = env.SESSION_SECRET!;
  if (sessionSecret.length < MIN_SECRET_LENGTH) {
    throw new ConfigError(`SESSION_SECRET doit contenir au moins ${MIN_SECRET_LENGTH} caractères`);
  }

  let appOrigin: string;
  try {
    appOrigin = new URL(env.APP_ORIGIN!).origin;
  } catch {
    throw new ConfigError('APP_ORIGIN doit être une URL valide (ex. https://demandes.ecole.fr)');
  }

  const port = Number(env.PORT ?? 3002);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new ConfigError('PORT doit être un entier entre 1 et 65535');
  }

  return {
    databaseUrl: env.DATABASE_URL!,
    sessionSecret,
    filesDir: env.FILES_DIR!,
    appOrigin,
    port,
    ffmpegPath: env.FFMPEG_PATH?.trim() || 'ffmpeg',
    ffprobePath: env.FFPROBE_PATH?.trim() || 'ffprobe',
    cookieSecure: env.NODE_ENV === 'production' || env.COOKIE_SECURE !== 'false',
    loginRateLimit:
      env.NODE_ENV !== 'production' && Number(env.LOGIN_RATE_LIMIT) > 0
        ? Number(env.LOGIN_RATE_LIMIT)
        : DEFAULT_LOGIN_RATE_LIMIT,
    jobsEnabled: env.JOBS_ENABLED !== 'false',
    isProduction: env.NODE_ENV === 'production',
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    schoolTimezone: parseSchoolTimezone(env.SCHOOL_TIMEZONE),
    assist: parseAssist(env, env.NODE_ENV === 'production'),
  };
}
