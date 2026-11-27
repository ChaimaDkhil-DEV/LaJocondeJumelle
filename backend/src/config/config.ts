import type { CommunicationChannel } from '@prisma/client';
import { isIP } from 'node:net';

/**
 * Configuration lue depuis les variables d'environnement et validée au démarrage :
 * l'application refuse de démarrer si une valeur obligatoire manque (principe IV,
 * aucun secret dans le code).
 */
export interface AppConfig {
  databaseUrl: string;
  sessionSecret: string;
  /** Secret des QR codes imprimés : QR_SIGNING_SECRET, sinon sessionSecret (QR imprimés avant ce réglage). */
  qrSecret: string;
  filesDir: string;
  /** Origine publique de l'application : liens envoyés (QR codes, n8n) et règle d'origine. */
  appOrigin: string;
  /**
   * Origines acceptées par la règle d'origine (FR-006) : APP_ORIGIN, plus APP_LOCAL_ORIGINS hors
   * production (démonstration en ligne : l'interface locale http://127.0.0.1:4173).
   */
  allowedOrigins: string[];
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
  /**
   * Notifications push (spec 014, D9) : clés d'identification du serveur (VAPID) et contact de
   * l'établissement. null : push désactivé (aucune des trois variables). La clé privée ne quitte
   * jamais le serveur et n'est jamais journalisée.
   */
  push: PushConfig | null;
  /**
   * Automatisations externes (spec 015) : webhook n8n et secret partagé. null : rien n'est envoyé, les
   * événements outbox attendent ; l'espace parent fonctionne normalement.
   */
  n8n: N8nConfig | null;
  /** Canaux externes activés pour les communications aux parents (015) ; vide : espace parent seulement. */
  parentCommunicationChannels: CommunicationChannel[];
  /** CAPTCHA Cloudflare Turnstile de la connexion. null : désactivé (aucune des deux clés). */
  turnstile: TurnstileConfig | null;
}

export interface TurnstileConfig {
  /** Clé publique, transmise au navigateur. */
  siteKey: string;
  /** Clé secrète : ne quitte le serveur que vers Siteverify, jamais journalisée. */
  secretKey: string;
  /** Clés de test officielles de Cloudflare (jeton factice, aucun domaine) ; refusées en production. */
  testKeys: boolean;
}

export interface N8nConfig {
  /** Adresse du webhook n8n (réseau interne Docker en production, ex. http://n8n:5678/webhook/…). */
  webhookUrl: string;
  /** Secret partagé (≥ 32 caractères) : signature des événements, jeton des appels de n8n. Jamais journalisé. */
  secret: string;
  /** Délai maximal d'un envoi à n8n (1 000 à 30 000 ms). */
  timeoutMs: number;
}

export interface PushConfig {
  /** Clé publique P-256 non compressée (65 octets), en base64url : transmise aux navigateurs. */
  publicKey: string;
  /** Clé privée P-256 (32 octets), en base64url. */
  privateKey: string;
  /** Contact de l'établissement, `mailto:` ou `https:` (exigé par les services de push). */
  subject: string;
}

/**
 * `disabled` : aucune assistance ; `demo` : fournisseur local déterministe, refusé en production ;
 * `rules` : propositions par règles (même moteur que `demo`, consignes et mots-clés), sans service
 * externe, autorisé en production (spec 010, US5) ; `claude` / `whisper` : connecteurs réels
 * (spec 010), à n'activer qu'après la décision de l'établissement (accord de traitement, conservation) ;
 * `ollama` : modèle de langage auto-hébergé (analyse locale, aucun service externe).
 */
export type SuggestionProviderName = 'disabled' | 'demo' | 'rules' | 'claude' | 'ollama';
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
  /** Connecteur Ollama auto-hébergé (`ollama` seulement) : adresse du serveur et modèle. */
  ollama: { url: string; model: string } | null;
  /**
   * Connecteur Whisper auto-hébergé (`whisper` seulement) : adresse, modèle, clé facultative et
   * certificat d'autorité supplémentaire (autorité interne de Caddy, spec 010 R11), lu à chaque appel.
   */
  whisper: { url: string; model: string; apiKey: string | null; caFile: string | null; language: string | null } | null;
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

const SUGGESTION_PROVIDERS: readonly SuggestionProviderName[] = ['disabled', 'demo', 'rules', 'claude', 'ollama'];
const TRANSCRIPTION_PROVIDERS: readonly TranscriptionProviderName[] = ['disabled', 'demo', 'whisper'];
const DEFAULT_ASSIST_TIMEOUT_MS = 15_000;
// Valeur provisoire, à calibrer sur une mesure réelle (docs/validation/verification-011.md).
const DEFAULT_TRANSCRIPTION_TIMEOUT_MS = 120_000;
const DEFAULT_ASSIST_RATE_LIMIT = 10;
const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';
/** Service Ollama du réseau interne (nom de service) et modèle par défaut. */
const DEFAULT_OLLAMA_URL = 'http://ljj-ollama:11434';
const DEFAULT_OLLAMA_MODEL = 'qwen3:4b';
const DEFAULT_WHISPER_MODEL = 'Systran/faster-whisper-small';
/** Langue des vocaux par défaut (comportement historique) ; `auto` laisse Whisper la détecter. */
const DEFAULT_WHISPER_LANGUAGE = 'fr';

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

function parseOllama(env: NodeJS.ProcessEnv, isProduction: boolean): AssistConfig['ollama'] {
  const raw = trimmed(env.ASSIST_OLLAMA_URL) ?? DEFAULT_OLLAMA_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError('ASSIST_OLLAMA_URL doit être une adresse http(s) valide avec ASSIST_SUGGESTION_PROVIDER=ollama');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigError('ASSIST_OLLAMA_URL doit être une adresse http(s) valide avec ASSIST_SUGGESTION_PROVIDER=ollama');
  }
  // Échanges chiffrés exigés en production (constitution, principe IV), comme pour Whisper.
  if (isProduction && url.protocol !== 'https:') {
    throw new ConfigError('ASSIST_OLLAMA_URL doit utiliser https en production');
  }
  return { url: raw.replace(/\/+$/, ''), model: trimmed(env.ASSIST_OLLAMA_MODEL) ?? DEFAULT_OLLAMA_MODEL };
}

/** Langue de transcription : code ISO 639-1 (`fr`, `ar`, `en`…) ou `auto` (détection, renvoyé `null`). */
function parseWhisperLanguage(raw: string | undefined): string | null {
  const value = (trimmed(raw) ?? DEFAULT_WHISPER_LANGUAGE).toLowerCase();
  if (value === 'auto') return null;
  if (!/^[a-z]{2}$/.test(value)) {
    throw new ConfigError('ASSIST_WHISPER_LANGUAGE invalide : code de langue à deux lettres (fr, ar, en…) ou auto attendu');
  }
  return value;
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
    language: parseWhisperLanguage(env.ASSIST_WHISPER_LANGUAGE),
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
    ollama: suggestionProvider === 'ollama' ? parseOllama(env, isProduction) : null,
    whisper: transcriptionProvider === 'whisper' ? parseWhisper(env, isProduction) : null,
  };
}

const PUSH_VARIABLES = ['PUSH_VAPID_PUBLIC_KEY', 'PUSH_VAPID_PRIVATE_KEY', 'PUSH_VAPID_SUBJECT'] as const;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Octets d'une valeur base64url, ou null si elle n'en est pas une. */
function base64urlBytes(value: string): Buffer | null {
  return BASE64URL.test(value) ? Buffer.from(value, 'base64url') : null;
}

/** Sujet VAPID : adresse `mailto:` ou adresse `https:` valide. */
function isPushSubject(value: string): boolean {
  if (value.startsWith('mailto:')) return /^mailto:[^@\s]+@[^@\s]+$/.test(value);
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname !== '';
  } catch {
    return false;
  }
}

/**
 * Notifications push (spec 014, D9, research R10) : les trois variables ou aucune. Une variable vide
 * compte comme absente (docker-compose transmet des valeurs vides). Les clés sont contrôlées dès le
 * démarrage ; la clé privée n'est jamais citée dans une erreur.
 */
function parsePush(env: NodeJS.ProcessEnv): PushConfig | null {
  const [publicKey, privateKey, subject] = PUSH_VARIABLES.map((key) => trimmed(env[key]));
  if (!publicKey && !privateKey && !subject) return null;

  const missing = PUSH_VARIABLES.filter((key) => !trimmed(env[key]));
  if (missing.length > 0) {
    throw new ConfigError(
      `Notifications push : variables manquantes : ${missing.join(', ')} (renseignez les trois ou aucune)`,
    );
  }
  const publicBytes = base64urlBytes(publicKey!);
  if (!publicBytes || publicBytes.length !== 65 || publicBytes[0] !== 0x04) {
    throw new ConfigError('PUSH_VAPID_PUBLIC_KEY invalide : clé publique P-256 non compressée (65 octets) en base64url attendue');
  }
  const privateBytes = base64urlBytes(privateKey!);
  if (!privateBytes || privateBytes.length !== 32) {
    throw new ConfigError('PUSH_VAPID_PRIVATE_KEY invalide : clé privée P-256 (32 octets) en base64url attendue');
  }
  if (!isPushSubject(subject!)) {
    throw new ConfigError('PUSH_VAPID_SUBJECT invalide : adresse mailto: ou https: attendue');
  }
  return { publicKey: publicKey!, privateKey: privateKey!, subject: subject! };
}

const TURNSTILE_VARIABLES = ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'] as const;
/** Clés de test publiées par Cloudflare : 1x000…AA, 2x000…AB, 3x000…FF. */
const TURNSTILE_TEST_KEY = /^[123]x0{20,}[A-F]{2}$/;

/**
 * CAPTCHA Cloudflare Turnstile : les deux clés ou aucune. Une variable vide compte comme absente. Les clés de test
 * acceptent (ou refusent) tout le monde : jamais en production. Aucune valeur n'est citée dans une erreur.
 */
function parseTurnstile(env: NodeJS.ProcessEnv, isProduction: boolean): TurnstileConfig | null {
  const [siteKey, secretKey] = TURNSTILE_VARIABLES.map((key) => trimmed(env[key]));
  if (!siteKey && !secretKey) return null;

  for (const key of TURNSTILE_VARIABLES) {
    const value = trimmed(env[key]);
    if (!value) throw new ConfigError(`${key} manquante (renseignez ${TURNSTILE_VARIABLES.join(' et ')}, ou aucune)`);
    if (!BASE64URL.test(value) || value.startsWith('remplacer-par-')) {
      throw new ConfigError(`${key} invalide : copiez la clé du widget depuis le tableau de bord Cloudflare`);
    }
  }
  if (siteKey === secretKey) throw new ConfigError('TURNSTILE_SITE_KEY et TURNSTILE_SECRET_KEY doivent être différentes');

  const testKeys = TURNSTILE_TEST_KEY.test(siteKey!);
  const testSecret = TURNSTILE_TEST_KEY.test(secretKey!);
  if (isProduction && (testKeys || testSecret)) {
    throw new ConfigError('Turnstile : les clés de test de Cloudflare sont interdites en production');
  }
  if (testKeys !== testSecret) {
    throw new ConfigError('Turnstile : une clé de test et une vraie clé ne vont pas ensemble');
  }
  return { siteKey: siteKey!, secretKey: secretKey!, testKeys };
}

const CHANNELS: readonly CommunicationChannel[] = ['EMAIL', 'WHATSAPP'];

/**
 * n8n (spec 015) : URL et secret ensemble, ou aucun. Une variable vide compte comme absente. Le secret
 * n'est jamais cité dans une erreur. En production : https hors du réseau Docker (nom de service, sans point), et un
 * secret propre à n8n.
 */
function parseN8n(env: NodeJS.ProcessEnv, isProduction: boolean, otherSecrets: readonly string[]): N8nConfig | null {
  const webhookUrl = trimmed(env.N8N_WEBHOOK_URL);
  const secret = trimmed(env.N8N_SHARED_SECRET);
  if (!webhookUrl && !secret) return null;
  if (!webhookUrl) throw new ConfigError('N8N_WEBHOOK_URL manquante (renseignez N8N_WEBHOOK_URL et N8N_SHARED_SECRET, ou aucune)');
  if (!secret) throw new ConfigError('N8N_SHARED_SECRET manquant (renseignez N8N_WEBHOOK_URL et N8N_SHARED_SECRET, ou aucune)');
  let url: URL;
  try {
    url = new URL(webhookUrl);
  } catch {
    throw new ConfigError('N8N_WEBHOOK_URL doit être une adresse http(s) valide');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ConfigError('N8N_WEBHOOK_URL doit être une adresse http(s) valide');
  if (isProduction && url.protocol !== 'https:' && !/^[a-z0-9-]+$/i.test(url.hostname)) {
    throw new ConfigError('N8N_WEBHOOK_URL doit utiliser https en production, sauf vers un service du réseau Docker (http://n8n:5678/…)');
  }
  checkSecret('N8N_SHARED_SECRET', secret, isProduction);
  if (isProduction && otherSecrets.includes(secret)) {
    throw new ConfigError('N8N_SHARED_SECRET doit être différent de SESSION_SECRET et de QR_SIGNING_SECRET');
  }
  const timeoutMs = trimmed(env.N8N_TIMEOUT_MS) ? Number(env.N8N_TIMEOUT_MS) : 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new ConfigError('N8N_TIMEOUT_MS doit être un entier entre 1000 et 30000');
  }
  return { webhookUrl: url.toString(), secret, timeoutMs };
}

/** PARENT_COMM_CHANNELS : liste séparée par des virgules parmi EMAIL et WHATSAPP (WhatsApp Business Platform). */
function parseChannels(value: string | undefined): CommunicationChannel[] {
  const names = (value ?? '').split(',').map((v) => v.trim().toUpperCase()).filter(Boolean);
  const unknown = names.filter((n) => !(CHANNELS as readonly string[]).includes(n));
  if (unknown.length > 0) throw new ConfigError(`PARENT_COMM_CHANNELS : canal inconnu (${unknown.join(', ')}) ; valeurs possibles : EMAIL, WHATSAPP`);
  return CHANNELS.filter((c) => names.includes(c));
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

const MAX_PROXY_HOPS = 2;

/**
 * En production, un réglage qui fait confiance à tout le monde laisserait chaque visiteur choisir son adresse IP
 * (limite de connexion, journal d'audit). Deux proxys au plus : Caddy et le tunnel.
 */
function isTooTrusting(value: boolean | number | string): boolean {
  if (typeof value !== 'string') return value === true || Number(value) > MAX_PROXY_HOPS;
  return value.split(',').some((entry) => entry.includes('/') && Number(entry.split('/')[1]) < 8);
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * APP_LOCAL_ORIGINS : origines supplémentaires de ce poste (localhost, 127.0.0.1, [::1]), séparées
 * par des virgules. Interdit en production : seule APP_ORIGIN y est acceptée.
 */
function parseLocalOrigins(value: string | undefined, isProduction: boolean): string[] {
  const entries = (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
  if (entries.length === 0) return [];
  if (isProduction) throw new ConfigError('APP_LOCAL_ORIGINS est interdit en production : seule APP_ORIGIN est acceptée');
  return entries.map((entry) => {
    let url: URL | null = null;
    try {
      url = new URL(entry);
    } catch {
      // message ci-dessous
    }
    if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:') || !LOOPBACK_HOSTS.has(url.hostname))
      throw new ConfigError(
        `APP_LOCAL_ORIGINS invalide : « ${entry} ». Seules les adresses de ce poste (http://127.0.0.1:4173, http://localhost:4173) sont admises`,
      );
    return url.origin;
  });
}

const RESERVED_HOST = /\.(example|invalid|localhost)$/;

/** APP_ORIGIN : adresse http(s) ; en production, https et un vrai nom de domaine, sans chemin ni identifiants. */
function parseAppOrigin(raw: string, isProduction: boolean): string {
  let url: URL | null = null;
  try {
    url = new URL(raw);
  } catch {
    // message ci-dessous
  }
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new ConfigError('APP_ORIGIN doit être une URL valide (ex. https://demandes.ecole.fr)');
  }
  if (isProduction) {
    if (url.protocol !== 'https:') throw new ConfigError('APP_ORIGIN doit utiliser https en production');
    const bare = url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
    const realName = url.hostname.includes('.') && !LOOPBACK_HOSTS.has(url.hostname) && !RESERVED_HOST.test(url.hostname);
    if (!bare || !realName) {
      throw new ConfigError(
        'APP_ORIGIN invalide en production : https:// suivi du seul nom de domaine réel (DOMAIN dans deploy/.env, sans https:// ni chemin)',
      );
    }
  }
  return url.origin;
}

/** Secrets publiés dans le dépôt (tests, démonstration), répétitions, ou trop peu de caractères différents. */
function isWeakSecret(value: string): boolean {
  return new Set(value).size < 8 || /^(.+?)\1+$/.test(value) || /session-secret|0123456789/i.test(value);
}

/** Secret serveur ; sa valeur n'est jamais citée dans une erreur. */
function checkSecret(key: string, value: string, isProduction: boolean): void {
  if (value.length < MIN_SECRET_LENGTH) throw new ConfigError(`${key} doit contenir au moins ${MIN_SECRET_LENGTH} caractères`);
  if (value.startsWith('remplacer-par-')) {
    throw new ConfigError(`${key} est la valeur d’exemple de .env.example : générez une valeur aléatoire`);
  }
  if (isProduction && isWeakSecret(value)) {
    throw new ConfigError(`${key} trop faible : générez une valeur aléatoire (openssl rand -base64 48)`);
  }
}

const NODE_ENVS: readonly string[] = ['development', 'test', 'production'];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // « Production », « prod »… démarreraient sans aucune protection de production (cookie Secure, moindre privilège,
  // documentation de l'API fermée). Absente ou vide : développement.
  if (env.NODE_ENV && !NODE_ENVS.includes(env.NODE_ENV)) {
    throw new ConfigError(`NODE_ENV invalide : « ${env.NODE_ENV} ». Valeurs possibles : ${NODE_ENVS.join(', ')}`);
  }

  const missing = ['DATABASE_URL', 'SESSION_SECRET', 'FILES_DIR', 'APP_ORIGIN'].filter(
    (key) => !env[key]?.trim(),
  );
  if (missing.length > 0) {
    throw new ConfigError(`Variables d'environnement manquantes : ${missing.join(', ')}`);
  }

  const isProduction = env.NODE_ENV === 'production';

  const sessionSecret = env.SESSION_SECRET!;
  checkSecret('SESSION_SECRET', sessionSecret, isProduction);
  const qrSecret = trimmed(env.QR_SIGNING_SECRET) ?? sessionSecret;
  if (qrSecret !== sessionSecret) checkSecret('QR_SIGNING_SECRET', qrSecret, isProduction);

  const appOrigin = parseAppOrigin(env.APP_ORIGIN!, isProduction);

  const trustProxy = parseTrustProxy(env.TRUST_PROXY);
  if (isProduction && isTooTrusting(trustProxy)) {
    throw new ConfigError('TRUST_PROXY trop large en production : utilisez uniquelocal, loopback ou l’adresse du proxy');
  }
  const jobsEnabled = env.JOBS_ENABLED !== 'false';
  if (isProduction && !jobsEnabled) {
    throw new ConfigError('JOBS_ENABLED=false est réservé aux tests : clôtures, rappels et anonymisation seraient arrêtés');
  }

  const n8n = parseN8n(env, isProduction, [sessionSecret, qrSecret]);
  const parentCommunicationChannels = parseChannels(env.PARENT_COMM_CHANNELS);
  if (isProduction && !n8n && parentCommunicationChannels.length > 0) {
    throw new ConfigError('PARENT_COMM_CHANNELS exige N8N_WEBHOOK_URL et N8N_SHARED_SECRET : sans eux, rien ne serait envoyé');
  }

  const port = Number(env.PORT ?? 3002);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new ConfigError('PORT doit être un entier entre 1 et 65535');
  }

  return {
    databaseUrl: env.DATABASE_URL!,
    sessionSecret,
    qrSecret,
    filesDir: env.FILES_DIR!,
    appOrigin,
    allowedOrigins: [appOrigin, ...parseLocalOrigins(env.APP_LOCAL_ORIGINS, isProduction)],
    port,
    ffmpegPath: env.FFMPEG_PATH?.trim() || 'ffmpeg',
    ffprobePath: env.FFPROBE_PATH?.trim() || 'ffprobe',
    cookieSecure: isProduction || env.COOKIE_SECURE !== 'false',
    loginRateLimit:
      !isProduction && Number(env.LOGIN_RATE_LIMIT) > 0
        ? Number(env.LOGIN_RATE_LIMIT)
        : DEFAULT_LOGIN_RATE_LIMIT,
    jobsEnabled,
    isProduction,
    trustProxy,
    schoolTimezone: parseSchoolTimezone(env.SCHOOL_TIMEZONE),
    assist: parseAssist(env, isProduction),
    push: parsePush(env),
    n8n,
    parentCommunicationChannels,
    turnstile: parseTurnstile(env, isProduction),
  };
}
