import { AppLogger, redact } from '../../src/common/app-logger';

/** T116 — journaux JSON sur la sortie standard, sans mot de passe, jeton, cookie ni contenu de message. */
describe('redact', () => {
  it.each([
    ['password=Secret-123 ok', 'password=[masqué] ok'],
    ['{"password":"Secret-123","username":"x"}', '{"password":"[masqué]","username":"x"}'],
    ['Cookie: sid=abcdef123456; autre=1', 'Cookie: [masqué]'],
    ['sid=abcdef123456', 'sid=[masqué]'],
    ['Authorization: Bearer eyJhbGciOi.payload.sig', 'Authorization: [masqué]'],
    ['haché $argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA', 'haché [masqué]'],
    ['newPassword: "Nouveau-456"', 'newPassword: "[masqué]"'],
    ['échec postgresql://app:Secret-123@db:5432/app', 'échec postgresql://app:[masqué]@db:5432/app'],
    ['clé sk-ant-api03-Ab_c-123 refusée', 'clé [masqué] refusée'],
    ['x-api-key: Secret-123', 'x-api-key: [masqué]'],
    ['ANTHROPIC_API_KEY=Secret-123 ok', 'ANTHROPIC_API_KEY=[masqué] ok'],
    ['PUSH_VAPID_PRIVATE_KEY=Secret-123', 'PUSH_VAPID_PRIVATE_KEY=[masqué]'],
    ['{"apiKey":"Secret-123"}', '{"apiKey":"[masqué]"}'],
    ['privateKey: "Secret-123"', 'privateKey: "[masqué]"'],
  ])('masque les secrets dans « %s »', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it('retire les clés sensibles et le contenu des messages dans les objets', () => {
    expect(
      redact({ username: 'enseignante', password: 'x', currentPassword: 'y', token: 't', text: 'Bonjour', nested: { cookie: 'sid=1', id: 3 } }),
    ).toEqual({ username: 'enseignante', password: '[masqué]', currentPassword: '[masqué]', token: '[masqué]', text: '[masqué]', nested: { cookie: '[masqué]', id: 3 } });
  });

  it('retire les clés d’API, clés privées et adresses de base des objets', () => {
    expect(redact({ apiKey: 'a', privateKey: 'b', databaseUrl: 'c', publicKey: 'd' })).toEqual({
      apiKey: '[masqué]',
      privateKey: '[masqué]',
      databaseUrl: '[masqué]',
      publicKey: 'd',
    });
  });

  it('laisse intact un message sans secret', () => {
    expect(redact('3 demande(s) en retard')).toBe('3 demande(s) en retard');
    expect(redact("Can't reach database server at http://db:5432/app")).toBe("Can't reach database server at http://db:5432/app");
    expect(redact('https://ecole.fr:8443/profil contact@ecole.fr')).toBe('https://ecole.fr:8443/profil contact@ecole.fr');
  });
});

describe('AppLogger', () => {
  let written: string[];
  let stdout: jest.SpyInstance;
  let stderr: jest.SpyInstance;

  beforeEach(() => {
    written = [];
    const capture = (chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    };
    stdout = jest.spyOn(process.stdout, 'write').mockImplementation(capture);
    stderr = jest.spyOn(process.stderr, 'write').mockImplementation(capture);
  });

  afterEach(() => {
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it('écrit une ligne JSON par entrée, secrets masqués', () => {
    const logger = new AppLogger('Test');
    logger.log('Connexion password=Secret-123');
    logger.error('Échec : Cookie: sid=abcdef', 'Error: stack sid=abcdef');

    expect(written).toHaveLength(2);
    const entries = written.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(entries[0]).toMatchObject({ level: 'log', context: 'Test', message: 'Connexion password=[masqué]' });
    expect(entries[1]).toMatchObject({ level: 'error', message: 'Échec : Cookie: [masqué]' });
    expect(written.join('')).not.toMatch(/Secret-123|abcdef/);
  });
});
