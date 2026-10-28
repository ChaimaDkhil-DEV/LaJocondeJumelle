import { ConfigError, loadConfig } from '../../src/config/config';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/app',
  SESSION_SECRET: 'x'.repeat(32),
  FILES_DIR: './data/files',
  APP_ORIGIN: 'https://demandes.ecole.fr/',
};

describe('loadConfig', () => {
  it('charge une configuration valide avec les valeurs par défaut', () => {
    const config = loadConfig(valid);
    expect(config.appOrigin).toBe('https://demandes.ecole.fr');
    expect(config.port).toBe(3002);
    expect(config.ffmpegPath).toBe('ffmpeg');
  });

  it.each(['DATABASE_URL', 'SESSION_SECRET', 'FILES_DIR', 'APP_ORIGIN'])(
    'refuse de démarrer sans %s',
    (key) => {
      expect(() => loadConfig({ ...valid, [key]: '' })).toThrow(ConfigError);
    },
  );

  it('rend le cookie Secure par défaut, et toujours en production', () => {
    expect(loadConfig(valid).cookieSecure).toBe(true);
    expect(loadConfig({ ...valid, COOKIE_SECURE: 'false' }).cookieSecure).toBe(false);
    expect(loadConfig({ ...valid, COOKIE_SECURE: 'false', NODE_ENV: 'production' }).cookieSecure).toBe(true);
  });

  it('limite les connexions à 5 par minute, réglable hors production uniquement', () => {
    expect(loadConfig(valid).loginRateLimit).toBe(5);
    expect(loadConfig({ ...valid, LOGIN_RATE_LIMIT: '1000' }).loginRateLimit).toBe(1000);
    expect(loadConfig({ ...valid, LOGIN_RATE_LIMIT: '1000', NODE_ENV: 'production' }).loginRateLimit).toBe(5);
  });

  it('active les jobs planifiés sauf si JOBS_ENABLED=false', () => {
    expect(loadConfig(valid).jobsEnabled).toBe(true);
    expect(loadConfig({ ...valid, JOBS_ENABLED: 'false' }).jobsEnabled).toBe(false);
  });

  it('refuse un secret de session trop court', () => {
    expect(() => loadConfig({ ...valid, SESSION_SECRET: 'court' })).toThrow(/32 caractères/);
  });

  it('refuse une origine invalide', () => {
    expect(() => loadConfig({ ...valid, APP_ORIGIN: 'pas une url' })).toThrow(ConfigError);
  });
});

describe('loadConfig — SCHOOL_TIMEZONE (R4)', () => {
  it('vaut Europe/Paris par défaut', () => {
    expect(loadConfig(valid).schoolTimezone).toBe('Europe/Paris');
    expect(loadConfig({ ...valid, SCHOOL_TIMEZONE: '  ' }).schoolTimezone).toBe('Europe/Paris');
  });

  it('accepte un identifiant IANA valide', () => {
    expect(loadConfig({ ...valid, SCHOOL_TIMEZONE: ' America/Montreal ' }).schoolTimezone).toBe('America/Montreal');
  });

  it.each(['Europe/Nulle-Part', 'GMT+25', 'pas un fuseau'])('refuse « %s » au démarrage avec un message explicite', (value) => {
    expect(() => loadConfig({ ...valid, SCHOOL_TIMEZONE: value })).toThrow(ConfigError);
    expect(() => loadConfig({ ...valid, SCHOOL_TIMEZONE: value })).toThrow(/^SCHOOL_TIMEZONE invalide/);
  });
});

describe('loadConfig — TRUST_PROXY (FR-004)', () => {
  const trustProxy = (value?: string) => loadConfig(value === undefined ? valid : { ...valid, TRUST_PROXY: value }).trustProxy;

  it('vaut loopback par défaut', () => {
    expect(trustProxy()).toBe('loopback');
  });

  it('accepte true, false et un nombre de proxys', () => {
    expect(trustProxy('true')).toBe(true);
    expect(trustProxy('false')).toBe(false);
    expect(trustProxy('2')).toBe(2);
  });

  it.each([
    ['uniquelocal', 'uniquelocal'],
    ['loopback, 10.0.0.0/8', 'loopback,10.0.0.0/8'],
    ['::1', '::1'],
    [' linklocal ', 'linklocal'],
  ])('accepte la liste « %s »', (value, expected) => {
    expect(trustProxy(value)).toBe(expected);
  });

  it.each(["n'importe quoi", '-1', '10.0.0.0/99', 'loopback,'])('refuse « %s » au démarrage', (value) => {
    expect(() => trustProxy(value)).toThrow(ConfigError);
    expect(() => trustProxy(value)).toThrow(/^TRUST_PROXY invalide/);
  });
});

describe('loadConfig — assistance IA (009, FR-019, FR-020)', () => {
  it('est désactivée par défaut, délai de 15 s et 10 appels par fenêtre', () => {
    expect(loadConfig(valid).assist).toEqual({
      suggestionProvider: 'disabled',
      transcriptionProvider: 'disabled',
      timeoutMs: 15_000,
      rateLimit: 10,
      demoTranscript: null,
      claude: null,
      whisper: null,
    });
  });

  it('accepte le fournisseur de démonstration hors production', () => {
    const config = loadConfig({
      ...valid,
      ASSIST_SUGGESTION_PROVIDER: 'demo',
      ASSIST_TRANSCRIPTION_PROVIDER: 'demo',
      ASSIST_DEMO_TRANSCRIPT: '  Texte fixe  ',
    });
    expect(config.assist).toMatchObject({ suggestionProvider: 'demo', transcriptionProvider: 'demo', demoTranscript: 'Texte fixe' });
  });

  it.each(['ASSIST_SUGGESTION_PROVIDER', 'ASSIST_TRANSCRIPTION_PROVIDER'])('refuse demo en production (%s)', (key) => {
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production', [key]: 'demo' })).toThrow(ConfigError);
  });

  it.each(['openai', 'DEMO ', 'on'])('refuse un fournisseur inconnu (%s)', (value) => {
    expect(() => loadConfig({ ...valid, ASSIST_SUGGESTION_PROVIDER: value })).toThrow(ConfigError);
  });

  it('borne le délai entre 1 000 et 20 000 ms', () => {
    expect(loadConfig({ ...valid, ASSIST_TIMEOUT_MS: '1000' }).assist.timeoutMs).toBe(1000);
    expect(loadConfig({ ...valid, ASSIST_TIMEOUT_MS: '20000' }).assist.timeoutMs).toBe(20_000);
    for (const value of ['999', '20001', 'abc', '1.5']) {
      expect(() => loadConfig({ ...valid, ASSIST_TIMEOUT_MS: value })).toThrow(ConfigError);
    }
  });

  // 010 : connecteurs réels, désactivés par défaut ; configuration complète exigée au démarrage.
  it('connecteur Claude : clé obligatoire, modèle par défaut, clé jamais citée dans l’erreur', () => {
    const config = loadConfig({ ...valid, ASSIST_SUGGESTION_PROVIDER: 'claude', ANTHROPIC_API_KEY: ' sk-ant-test ' });
    expect(config.assist.suggestionProvider).toBe('claude');
    expect(config.assist.claude).toEqual({ apiKey: 'sk-ant-test', model: 'claude-opus-5-5' });
    expect(loadConfig({ ...valid, ASSIST_SUGGESTION_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k', ASSIST_CLAUDE_MODEL: 'claude-sonnet-5-5' }).assist.claude?.model).toBe(
      'claude-sonnet-5-5',
    );
    // Autorisé en production (contrairement à demo), avec sa clé.
    expect(loadConfig({ ...valid, NODE_ENV: 'production', ASSIST_SUGGESTION_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' }).assist.claude).not.toBeNull();
    expect(() => loadConfig({ ...valid, ASSIST_SUGGESTION_PROVIDER: 'claude' })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => loadConfig({ ...valid, ASSIST_SUGGESTION_PROVIDER: 'claude', ANTHROPIC_API_KEY: '  ' })).toThrow(ConfigError);
    // Sans le connecteur choisi, la clé éventuelle n'est pas retenue.
    expect(loadConfig({ ...valid, ANTHROPIC_API_KEY: 'k' }).assist.claude).toBeNull();
  });

  it('connecteur Whisper : adresse valide obligatoire, https en production, modèle par défaut', () => {
    const config = loadConfig({ ...valid, ASSIST_TRANSCRIPTION_PROVIDER: 'whisper', ASSIST_WHISPER_URL: 'http://whisper.ecole.local:8000' });
    expect(config.assist.transcriptionProvider).toBe('whisper');
    expect(config.assist.whisper).toEqual({ url: 'http://whisper.ecole.local:8000', model: 'Systran/faster-whisper-small', apiKey: null });
    expect(
      loadConfig({
        ...valid,
        NODE_ENV: 'production',
        ASSIST_TRANSCRIPTION_PROVIDER: 'whisper',
        ASSIST_WHISPER_URL: 'https://whisper.ecole.fr',
        ASSIST_WHISPER_MODEL: 'Systran/faster-whisper-medium',
        ASSIST_WHISPER_API_KEY: 'secret',
      }).assist.whisper,
    ).toEqual({ url: 'https://whisper.ecole.fr', model: 'Systran/faster-whisper-medium', apiKey: 'secret' });
    for (const url of [undefined, '', 'pas une url', 'ftp://whisper.ecole.fr']) {
      expect(() => loadConfig({ ...valid, ASSIST_TRANSCRIPTION_PROVIDER: 'whisper', ASSIST_WHISPER_URL: url })).toThrow(ConfigError);
    }
    // Échanges chiffrés exigés en production (constitution, principe IV).
    expect(() =>
      loadConfig({ ...valid, NODE_ENV: 'production', ASSIST_TRANSCRIPTION_PROVIDER: 'whisper', ASSIST_WHISPER_URL: 'http://whisper.ecole.fr' }),
    ).toThrow(/https/);
  });

  it('n’accepte chaque connecteur que pour son usage', () => {
    expect(() => loadConfig({ ...valid, ASSIST_SUGGESTION_PROVIDER: 'whisper' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...valid, ASSIST_TRANSCRIPTION_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' })).toThrow(ConfigError);
  });

  it('exige une limite d’appels entière et positive', () => {
    expect(loadConfig({ ...valid, ASSIST_RATE_LIMIT: '3' }).assist.rateLimit).toBe(3);
    for (const value of ['0', '-1', '2.5', 'x']) {
      expect(() => loadConfig({ ...valid, ASSIST_RATE_LIMIT: value })).toThrow(ConfigError);
    }
  });
});
