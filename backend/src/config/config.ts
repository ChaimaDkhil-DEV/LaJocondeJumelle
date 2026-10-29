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

/**
 * `disabled` : aucune assistance ; `demo` : fournisseur local déterministe, refusé en production ;
 * `rules` : propositions par règles (même moteur que `demo`, consignes et mots-clés), sans service
 * externe, autorisé en production (spec 010, US5) ; `claude` / `whisper` : connecteurs réels
 * (spec 010), à n'activer qu'après la décision de l'établissement (accord de traitement, conservation).
 */
export type SuggestionProviderName = 'disabled' | 'demo' | 'rules' | 'claude';
export type TranscriptionProviderName = 'disabled' | 'demo' | 'whisper';

export interface AssistConfig {
  suggestionProvider: SuggestionProviderName;
  transcriptionProvider: TranscriptionProviderName;
  /** Délai maximal d'un appel de fournisseur de propositions (1 000 à 20 000 ms). */
  timeoutMs: number;
  /**
   * Délai maximal d'une transcription (1 000 à 300 000 ms) : un vocal peut durer jusqu'à
   * voiceMaxSeconds (180 s par défaut), et sa transcription sur processeur prend plus de 20 s.
   */
  transcriptionTimeoutMs: number;
  /** Appels (transcription et propositions réunies) par utilisateur et par 5 minutes. */
  rateLimit: number;
  /** Texte renvoyé par la transcription de démonstration ; null : phrase par défaut. */
  demoTranscript: string | null;
  /** Connecteur Claude (`claude` seulement) : clé secrète et modèle. */
  claude: { apiKey: string; model: string } | null;
  /**
   * Connecteur Whisper auto-hébergé (`whisper` seulement) : adresse, modèle, clé facultative et
   * certificat d'autorité supplémentaire (autorité interne de Caddy, spec 010 R11), lu à chaque appel.
   */
  whisper: { url: string; model: string; apiKey: string | null; caFile: string | null } | null;
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

const SUGGESTION_PROVIDERS: readonly SuggestionProviderName[] = ['disabled', 'demo', 'rules', 'claude'];
const TRANSCRIPTION_PROVIDERS: readonly TranscriptionProviderName[] = ['disabled', 'demo', 'whisper'];
const DEFAULT_ASSIST_TIMEOUT_MS = 15_000;
// Valeur provisoire, à calibrer sur une mesure réelle (docs/validation/verification-011.md).
const DEFAULT_TRANSCRIPTION_TIMEOUT_MS = 120_000;
const DEFAULT_ASSIST_RATE_LIMIT = 10;
const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';
const DEFAULT_WHISPER_MODEL = 'Systran/faster-whisper-small';

function parseAssistProvider<T extends string>(key: string, raw: string | undefined, allowed: readonly T[], isProduction: boolean): T {
  const value = raw === undefined || raw.trim() === '' ? 'disabled' : raw;
  if (!allowed.includes(value as T)) {
    throw new ConfigError(`${key} invalide : utilisez ${allowed.join(', ')}`);
  }
  // Une transcription ou des propositions factices ne doivent jamais atteindre les utilisateurs réels.
  if (value === 'demo' && isProduction) {
    throw new ConfigError(`${key}=demo est réservé au développement et aux tests`);
  }
  return value as T;
}

/** Valeur non vide (rognée) ou null ; la valeur d'un secret n'est jamais citée dans une erreur. */
function trimmed(raw: string | undefined): string | null {
  return raw?.trim() || null;
}

function parseClaude(env: NodeJS.ProcessEnv): AssistConfig['claude'] {
  const apiKey = trimmed(env.ANTHROPIC_API_KEY);
  if (!apiKey) throw new ConfigError('ANTHROPIC_API_KEY est obligatoire avec ASSIST_SUGGESTION_PROVIDER=claude');
  return { apiKey, model: trimmed(env.ASSIST_CLAUDE_MODEL) ?? DEFAULT_CLAUDE_MODEL };
}

function parseWhisper(env: NodeJS.ProcessEnv, isProduction: boolean): AssistConfig['whisper'] {
  const raw = trimmed(env.ASSIST_WHISPER_URL);
  let url: URL;
  try {
    url = new URL(raw ?? '');
  } catch {
    throw new ConfigError('ASSIST_WHISPER_URL doit être une adresse http(s) valide avec ASSIST_TRANSCRIPTION_PROVIDER=whisper');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigError('ASSIST_WHISPER_URL doit être une adresse http(s) valide avec ASSIST_TRANSCRIPTION_PROVIDER=whisper');
  }
  // Échanges chiffrés exigés en production (constitution, principe IV).
  if (isProduction && url.protocol !== 'https:') {
    throw new ConfigError('ASSIST_WHISPER_URL doit utiliser https en production');
  }
  return {
    url: raw!.replace(/\/+$/, ''),
    model: trimmed(env.ASSIST_WHISPER_MODEL) ?? DEFAULT_WHISPER_MODEL,
    apiKey: trimmed(env.ASSIST_WHISPER_API_KEY),
    caFile: trimmed(env.ASSIST_WHISPER_CA_FILE),
  };
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
  const suggestionProvider = parseAssistProvider('ASSIST_SUGGESTION_PROVIDER', env.ASSIST_SUGGESTION_PROVIDER, SUGGESTION_PROVIDERS, isProduction);
  const transcriptionProvider = parseAssistProvider(
    'ASSIST_TRANSCRIPTION_PROVIDER',
    env.ASSIST_TRANSCRIPTION_PROVIDER,
    TRANSCRIPTION_PROVIDERS,
    isProduction,
  );
  return {
    suggestionProvider,
    transcriptionProvider,
    timeoutMs: parseBoundedInt('ASSIST_TIMEOUT_MS', env.ASSIST_TIMEOUT_MS, DEFAULT_ASSIST_TIMEOUT_MS, 1_000, 20_000),
    // Plafond sous le requestTimeout de Node (300 s) : le navigateur et Caddy n'imposent aucun délai.
    transcriptionTimeoutMs: parseBoundedInt(
      'ASSIST_TRANSCRIPTION_TIMEOUT_MS',
      env.ASSIST_TRANSCRIPTION_TIMEOUT_MS,
      DEFAULT_TRANSCRIPTION_TIMEOUT_MS,
      1_000,
      300_000,
    ),
    rateLimit: parseBoundedInt('ASSIST_RATE_LIMIT', env.ASSIST_RATE_LIMIT, DEFAULT_ASSIST_RATE_LIMIT, 1, 1_000),
    demoTranscript: env.ASSIST_DEMO_TRANSCRIPT?.trim() || null,
    // Configuration retenue seulement pour le connecteur choisi, et complète dès le démarrage.
    claude: suggestionProvider === 'claude' ? parseClaude(env) : null,
    whisper: transcriptionProvider === 'whisper' ? parseWhisper(env, isProduction) : null,
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
