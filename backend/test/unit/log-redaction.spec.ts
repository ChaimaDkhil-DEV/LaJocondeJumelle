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
  ])('masque les secrets dans « %s »', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it('retire les clés sensibles et le contenu des messages dans les objets', () => {
    expect(
      redact({ username: 'enseignante', password: 'x', currentPassword: 'y', token: 't', text: 'Bonjour', nested: { cookie: 'sid=1', id: 3 } }),
    ).toEqual({ username: 'enseignante', password: '[masqué]', currentPassword: '[masqué]', token: '[masqué]', text: '[masqué]', nested: { cookie: '[masqué]', id: 3 } });
  });

  it('laisse intact un message sans secret', () => {
    expect(redact('3 demande(s) en retard')).toBe('3 demande(s) en retard');
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
