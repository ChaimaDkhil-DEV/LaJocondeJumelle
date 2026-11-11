import {
  demoLocalOrigins,
  onlineDemoNotice,
  parseCloudflaredPids,
  warnIfCloudflaredRunning,
  type CloudflaredProbeDeps,
} from '../../scripts/demo-tunnel';

/**
 * Démonstration en ligne : l'API accepte l'origine du tunnel et l'interface locale
 * (http://127.0.0.1:4173). L'adresse d'un ancien tunnel resté actif fait échouer la connexion en
 * 403 : le script doit le dire.
 */

const URL = 'https://exemple-demo.trycloudflare.com';

describe('onlineDemoNotice (demo:en-ligne)', () => {
  it("indique l'adresse du tunnel et l'adresse locale, utilisable sur ce poste", () => {
    const text = onlineDemoNotice(URL, 4173).join('\n');

    expect(text).toContain(`Application en ligne : ${URL}`);
    expect(text).toContain('http://127.0.0.1:4173');
    expect(text).not.toMatch(/refusée|403/);
  });
});

describe('demoLocalOrigins', () => {
  it("autorise l'interface locale par 127.0.0.1 et localhost", () => {
    expect(demoLocalOrigins(4173)).toBe('http://127.0.0.1:4173,http://localhost:4173');
  });
});

describe('parseCloudflaredPids', () => {
  it('lit les PID de la sortie CSV de tasklist', () => {
    const output = [
      '"cloudflared.exe","16108","Services","0","19 644 Ko"',
      '"cloudflared.exe","15592","Console","1","35 100 Ko"',
    ].join('\r\n');

    expect(parseCloudflaredPids(output)).toEqual([16108, 15592]);
  });

  it("ne renvoie rien quand tasklist n'a trouvé aucun processus (message localisé)", () => {
    expect(
      parseCloudflaredPids('Information : aucune tâche en service ne correspond aux critères spécifiés.'),
    ).toEqual([]);
    expect(parseCloudflaredPids('INFO: No tasks are running which match the specified criteria.')).toEqual([]);
  });

  it('lit la sortie de pgrep (un PID par ligne)', () => {
    expect(parseCloudflaredPids('4242\n4343\n')).toEqual([4242, 4343]);
  });
});

describe('warnIfCloudflaredRunning', () => {
  function fakeDeps(stdout: string | null) {
    const warn = jest.fn<void, [string]>();
    const deps: CloudflaredProbeDeps = { listProcesses: () => stdout, warn, isWindows: true };
    return { deps, warn };
  }

  it("ne dit rien quand aucun cloudflared ne tourne", () => {
    const { deps, warn } = fakeDeps('Information : aucune tâche en service ne correspond aux critères spécifiés.');

    expect(warnIfCloudflaredRunning(deps)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('avertit sans bloquer et donne la commande pour arrêter chaque processus', () => {
    const { deps, warn } = fakeDeps('"cloudflared.exe","16108","Services","0","19 644 Ko"');

    expect(warnIfCloudflaredRunning(deps)).toEqual([16108]);
    const message = warn.mock.calls.map(([line]) => line).join('\n');
    expect(message).toContain('16108');
    expect(message).toContain('403');
    expect(message).toContain('taskkill /PID 16108 /F');
  });

  it('donne la commande kill hors Windows', () => {
    const warn = jest.fn<void, [string]>();
    warnIfCloudflaredRunning({ listProcesses: () => '4242\n', warn, isWindows: false });

    expect(warn.mock.calls.map(([line]) => line).join('\n')).toContain('kill 4242');
  });

  it("ne dit rien si la liste des processus est indisponible", () => {
    const { deps, warn } = fakeDeps(null);

    expect(warnIfCloudflaredRunning(deps)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});
