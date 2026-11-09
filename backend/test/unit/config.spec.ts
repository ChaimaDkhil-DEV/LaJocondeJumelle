import { createECDH } from 'node:crypto';
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
      transcriptionTimeoutMs: 120_000,
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
    expect(config.assist.whisper).toEqual({ url: 'http://whisper.ecole.local:8000', model: 'Systran/faster-whisper-small', apiKey: null, caFile: null });
    expect(
      loadConfig({
        ...valid,
        NODE_ENV: 'production',
        ASSIST_TRANSCRIPTION_PROVIDER: 'whisper',
        ASSIST_WHISPER_URL: 'https://whisper.ecole.fr',
        ASSIST_WHISPER_MODEL: 'Systran/faster-whisper-medium',
        ASSIST_WHISPER_API_KEY: 'secret',
      }).assist.whisper,
    ).toEqual({ url: 'https://whisper.ecole.fr', model: 'Systran/faster-whisper-medium', apiKey: 'secret', caFile: null });
    // 011 : autorité interne de Caddy (certificat racine, lu à chaque appel par le connecteur).
    expect(
      loadConfig({ ...valid, ASSIST_TRANSCRIPTION_PROVIDER: 'whisper', ASSIST_WHISPER_URL: 'https://caddy:8444', ASSIST_WHISPER_CA_FILE: ' /caddy/root.crt ' })
        .assist.whisper?.caFile,
    ).toBe('/caddy/root.crt');
    for (const url of [undefined, '', 'pas une url', 'ftp://whisper.ecole.fr']) {
      expect(() => loadConfig({ ...valid, ASSIST_TRANSCRIPTION_PROVIDER: 'whisper', ASSIST_WHISPER_URL: url })).toThrow(ConfigError);
    }
    // Échanges chiffrés exigés en production (constitution, principe IV).
    expect(() =>
      loadConfig({ ...valid, NODE_ENV: 'production', ASSIST_TRANSCRIPTION_PROVIDER: 'whisper', ASSIST_WHISPER_URL: 'http://whisper.ecole.fr' }),
    ).toThrow(/https/);
  });

  // 011 : propositions par règles (moteur demoSuggest), sans service externe, autorisées en production.
  it('fournisseur de propositions rules : accepté en production, sans clé ni configuration', () => {
    const config = loadConfig({ ...valid, NODE_ENV: 'production', ASSIST_SUGGESTION_PROVIDER: 'rules' });
    expect(config.assist).toMatchObject({ suggestionProvider: 'rules', claude: null });
    expect(loadConfig({ ...valid, ASSIST_SUGGESTION_PROVIDER: 'rules' }).assist.suggestionProvider).toBe('rules');
  });

  it('rules n’existe pas pour la transcription ; la transcription demo reste interdite en production', () => {
    expect(() => loadConfig({ ...valid, ASSIST_TRANSCRIPTION_PROVIDER: 'rules' })).toThrow(ConfigError);
    expect(() =>
      loadConfig({ ...valid, NODE_ENV: 'production', ASSIST_SUGGESTION_PROVIDER: 'rules', ASSIST_TRANSCRIPTION_PROVIDER: 'demo' }),
    ).toThrow(/ASSIST_TRANSCRIPTION_PROVIDER=demo/);
  });

  it('n’accepte chaque connecteur que pour son usage', () => {
    expect(() => loadConfig({ ...valid, ASSIST_SUGGESTION_PROVIDER: 'whisper' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...valid, ASSIST_TRANSCRIPTION_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' })).toThrow(ConfigError);
  });

  // 011 : délai propre à la transcription (un vocal de 3 min sur processeur dépasse 20 s).
  it('borne le délai de transcription entre 1 000 et 300 000 ms, indépendamment des propositions', () => {
    const config = loadConfig({ ...valid, ASSIST_TRANSCRIPTION_TIMEOUT_MS: '180000', ASSIST_TIMEOUT_MS: '5000' });
    expect(config.assist).toMatchObject({ transcriptionTimeoutMs: 180_000, timeoutMs: 5000 });
    expect(loadConfig({ ...valid, ASSIST_TRANSCRIPTION_TIMEOUT_MS: '300000' }).assist.transcriptionTimeoutMs).toBe(300_000);
    for (const value of ['999', '300001', 'abc', '2.5']) {
      expect(() => loadConfig({ ...valid, ASSIST_TRANSCRIPTION_TIMEOUT_MS: value })).toThrow(ConfigError);
    }
  });

  it('exige une limite d’appels entière et positive', () => {
    expect(loadConfig({ ...valid, ASSIST_RATE_LIMIT: '3' }).assist.rateLimit).toBe(3);
    for (const value of ['0', '-1', '2.5', 'x']) {
      expect(() => loadConfig({ ...valid, ASSIST_RATE_LIMIT: value })).toThrow(ConfigError);
    }
  });
});

/** 014, T004 : clés d'identification du serveur pour le push (D9, FR-013, research R10). */
describe('loadConfig — notifications push (014)', () => {
  // Paire P-256 réelle, produite pour le test : jamais versionnée.
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const publicKey = ecdh.getPublicKey().toString('base64url');
  const privateKey = ecdh.getPrivateKey().toString('base64url');
  const push = {
    PUSH_VAPID_PUBLIC_KEY: publicKey,
    PUSH_VAPID_PRIVATE_KEY: privateKey,
    PUSH_VAPID_SUBJECT: 'mailto:direction@ecole.example',
  };

  it('est désactivé sans aucune des trois variables', () => {
    expect(loadConfig(valid).push).toBeNull();
  });

  it('traite des variables vides ou faites d’espaces comme absentes', () => {
    expect(loadConfig({ ...valid, PUSH_VAPID_PUBLIC_KEY: '', PUSH_VAPID_PRIVATE_KEY: '  ', PUSH_VAPID_SUBJECT: '' }).push).toBeNull();
  });

  it('lit les trois variables valides', () => {
    expect(loadConfig({ ...valid, ...push }).push).toEqual({
      publicKey,
      privateKey,
      subject: 'mailto:direction@ecole.example',
    });
    expect(loadConfig({ ...valid, ...push, PUSH_VAPID_SUBJECT: 'https://ecole.example/contact' }).push?.subject).toBe(
      'https://ecole.example/contact',
    );
  });

  it.each([
    [['PUSH_VAPID_PUBLIC_KEY'], 'PUSH_VAPID_PUBLIC_KEY'],
    [['PUSH_VAPID_PRIVATE_KEY'], 'PUSH_VAPID_PRIVATE_KEY'],
    [['PUSH_VAPID_SUBJECT'], 'PUSH_VAPID_SUBJECT'],
    [['PUSH_VAPID_PUBLIC_KEY', 'PUSH_VAPID_SUBJECT'], 'PUSH_VAPID_PUBLIC_KEY, PUSH_VAPID_SUBJECT'],
  ])('refuse une configuration partielle (manque %j) en nommant les variables manquantes', (absent, named) => {
    const env: Record<string, string> = { ...valid, ...push };
    for (const key of absent) delete env[key];
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(named);
  });

  it('refuse une clé publique qui n’est pas un point P-256 non compressé (65 octets, 0x04)', () => {
    const compressed = Buffer.concat([Buffer.from([0x02]), ecdh.getPublicKey().subarray(1, 33)]).toString('base64url');
    const wrongPrefix = Buffer.concat([Buffer.from([0x05]), ecdh.getPublicKey().subarray(1)]).toString('base64url');
    for (const value of [compressed, wrongPrefix, 'pas-du-base64url!', publicKey.slice(0, 40)]) {
      expect(() => loadConfig({ ...valid, ...push, PUSH_VAPID_PUBLIC_KEY: value })).toThrow(ConfigError);
    }
  });

  it('refuse une clé privée qui ne fait pas 32 octets, sans jamais la citer', () => {
    const tooLong = Buffer.alloc(48, 7).toString('base64url');
    for (const value of [tooLong, privateKey.slice(0, 20), 'cle privee secrete']) {
      let message = '';
      try {
        loadConfig({ ...valid, ...push, PUSH_VAPID_PRIVATE_KEY: value });
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        message = (error as Error).message;
      }
      expect(message).toContain('PUSH_VAPID_PRIVATE_KEY');
      expect(message).not.toContain(value);
    }
  });

  it('exige un sujet mailto: ou https:', () => {
    for (const value of ['direction@ecole.example', 'http://ecole.example', 'mailto:', 'https://', 'ftp://ecole.example']) {
      expect(() => loadConfig({ ...valid, ...push, PUSH_VAPID_SUBJECT: value })).toThrow(ConfigError);
    }
  });

  it('ne cite jamais la clé privée, quelle que soit l’erreur', () => {
    for (const env of [
      { ...valid, PUSH_VAPID_PRIVATE_KEY: privateKey },
      { ...valid, ...push, PUSH_VAPID_SUBJECT: 'pas un sujet' },
      { ...valid, ...push, PUSH_VAPID_PUBLIC_KEY: 'x' },
    ]) {
      expect(() => loadConfig(env)).toThrow(ConfigError);
      try {
        loadConfig(env);
      } catch (error) {
        expect((error as Error).message).not.toContain(privateKey);
      }
    }
  });
});

/** 015 — automatisations externes (n8n) et canaux des communications aux parents : désactivés par défaut. */
describe('loadConfig : n8n et canaux externes (015)', () => {
  const secret = 's'.repeat(32);

  it('sans variable : aucun envoi vers n8n, aucun canal externe', () => {
    const config = loadConfig(valid);
    expect(config.n8n).toBeNull();
    expect(config.parentCommunicationChannels).toEqual([]);
  });

  it('URL et secret ensemble, délai par défaut de 10 s', () => {
    const config = loadConfig({ ...valid, N8N_WEBHOOK_URL: 'http://n8n:5678/webhook/ljj', N8N_SHARED_SECRET: secret });
    expect(config.n8n).toEqual({ webhookUrl: 'http://n8n:5678/webhook/ljj', secret, timeoutMs: 10_000 });
  });

  it.each([
    [{ N8N_WEBHOOK_URL: 'http://n8n:5678/webhook/ljj' }, /N8N_SHARED_SECRET/],
    [{ N8N_SHARED_SECRET: secret }, /N8N_WEBHOOK_URL/],
    [{ N8N_WEBHOOK_URL: 'ftp://n8n', N8N_SHARED_SECRET: secret }, /N8N_WEBHOOK_URL/],
    [{ N8N_WEBHOOK_URL: 'http://n8n:5678/x', N8N_SHARED_SECRET: 'court' }, /32 caractères/],
    [{ N8N_WEBHOOK_URL: 'http://n8n:5678/x', N8N_SHARED_SECRET: secret, N8N_TIMEOUT_MS: '50' }, /N8N_TIMEOUT_MS/],
    [{ PARENT_COMM_CHANNELS: 'EMAIL,SMS' }, /PARENT_COMM_CHANNELS/],
  ])('refuse une configuration incomplète ou invalide (%j)', (extra, message) => {
    expect(() => loadConfig({ ...valid, ...extra })).toThrow(message);
  });

  it('le secret n’apparaît jamais dans un message d’erreur', () => {
    const leaky = 'secret-tres-confidentiel'.padEnd(40, 'x');
    expect(() => loadConfig({ ...valid, N8N_WEBHOOK_URL: 'pas une url', N8N_SHARED_SECRET: leaky })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(leaky) }),
    );
  });

  it('canaux activés : e-mail et WhatsApp Business, sans doublon ni espace', () => {
    expect(loadConfig({ ...valid, PARENT_COMM_CHANNELS: ' whatsapp, EMAIL ,email' }).parentCommunicationChannels).toEqual(['EMAIL', 'WHATSAPP']);
  });
});
