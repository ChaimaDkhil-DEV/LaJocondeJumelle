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
  isProduction: boolean;
}

export class ConfigError extends Error {}

const MIN_SECRET_LENGTH = 32;

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

  const port = Number(env.PORT ?? 3000);
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
    isProduction: env.NODE_ENV === 'production',
  };
}
