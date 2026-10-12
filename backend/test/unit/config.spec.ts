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
    expect(config.port).toBe(3000);
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

  it('refuse un secret de session trop court', () => {
    expect(() => loadConfig({ ...valid, SESSION_SECRET: 'court' })).toThrow(/32 caractères/);
  });

  it('refuse une origine invalide', () => {
    expect(() => loadConfig({ ...valid, APP_ORIGIN: 'pas une url' })).toThrow(ConfigError);
  });
});
