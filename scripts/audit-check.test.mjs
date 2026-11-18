import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluate, localDate, parseAuditOutput, parseExceptions } from './audit-check.mjs';

/**
 * Audit des dépendances de la CI : `npm audit` échoue sur toute faille haute ou critique, sauf une alerte inscrite
 * dans `audit-exceptions.json` (paquet, motif et date de revue proche obligatoires). Une exception échue, mal
 * formée, posée sur un autre paquet ou devenue inutile fait aussi échouer : elle doit être revue ou retirée.
 */

const advisory = (
  source,
  severity,
  url = `https://github.com/advisories/${source}`,
  name = 'x',
) => ({
  source,
  name,
  severity,
  url,
  title: 't',
  range: '*',
});

/** Rapport `npm audit --json` minimal : un paquet par alerte, plus un paquet qui en dépend (sans alerte propre). */
function report(...advisories) {
  const vulnerabilities = {};
  advisories.forEach((a, i) => {
    vulnerabilities[`pkg${i}`] = { name: `pkg${i}`, severity: a.severity, via: [a] };
  });
  vulnerabilities.dependent = {
    name: 'dependent',
    severity: 'high',
    via: Object.keys(vulnerabilities),
  };
  return { vulnerabilities };
}

const PICO = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';
const pico = (severity = 'high') => advisory(1247710, severity, PICO, 'picomatch');
const EXCEPTION = {
  id: 'GHSA-fc5q-39xc-vjpf',
  package: 'picomatch',
  reason: 'Aucune version corrigée ; outils de développement seulement.',
  review: '2026-12-18',
};
const TODAY = '2026-11-18';

describe('evaluate', () => {
  it('aucune faille : succès', () => {
    assert.deepEqual(evaluate({ vulnerabilities: {} }, [], TODAY), {
      ok: true,
      blocking: [],
      excepted: [],
      problems: [],
    });
  });

  it('une faille haute non listée : échec, l’alerte est nommée', () => {
    const result = evaluate(
      report(advisory(1, 'high', 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc')),
      [],
      TODAY,
    );
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.blocking.map((b) => b.id),
      ['GHSA-AAAA-BBBB-CCCC'],
    );
  });

  it('une faille critique non listée : échec', () => {
    assert.equal(evaluate(report(advisory(2, 'critical')), [], TODAY).ok, false);
  });

  it('une faille modérée ou faible : jamais bloquante', () => {
    assert.equal(evaluate(report(advisory(3, 'moderate'), advisory(4, 'low')), [], TODAY).ok, true);
  });

  it('l’alerte picomatch listée : succès, et elle est rappelée comme exception', () => {
    const result = evaluate(report(pico()), [EXCEPTION], TODAY);
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.excepted.map((e) => e.id),
      ['GHSA-FC5Q-39XC-VJPF'],
    );
  });

  it('l’identifiant est comparé sans tenir compte de la casse', () => {
    assert.equal(
      evaluate(report(pico()), [{ ...EXCEPTION, id: 'ghsa-FC5Q-39xc-vjpf' }], TODAY).ok,
      true,
    );
  });

  it('l’exception ne couvre que son alerte : une autre faille haute fait toujours échouer', () => {
    const result = evaluate(
      report(pico(), advisory(6, 'high', 'https://github.com/advisories/GHSA-zzzz-yyyy-xxxx')),
      [EXCEPTION],
      TODAY,
    );
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.blocking.map((b) => b.id),
      ['GHSA-ZZZZ-YYYY-XXXX'],
    );
  });

  it('l’exception ne couvre que son paquet : la même alerte sur un autre paquet fait échouer', () => {
    const result = evaluate(
      report(advisory(1247710, 'high', PICO, 'other-package')),
      [EXCEPTION],
      TODAY,
    );
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.blocking.map((b) => b.package),
      ['other-package'],
    );
    assert.match(result.problems.join('\n'), /other-package.*picomatch/);
  });

  it('exception échue (date de revue passée) : échec, à revoir', () => {
    const result = evaluate(report(pico()), [EXCEPTION], '2026-12-19');
    assert.equal(result.ok, false);
    assert.match(result.problems.join('\n'), /GHSA-fc5q-39xc-vjpf.*2026-12-18/);
  });

  it('date de revue impossible : échec', () => {
    const result = evaluate(report(pico()), [{ ...EXCEPTION, review: '2026-99-99' }], TODAY);
    assert.equal(result.ok, false);
    assert.match(result.problems.join('\n'), /date de revue/);
  });

  it('date de revue au-delà de 90 jours : échec (l’exception ne devient jamais permanente)', () => {
    assert.equal(
      evaluate(report(pico()), [{ ...EXCEPTION, review: '2027-02-16' }], TODAY).ok,
      true,
    );
    const result = evaluate(report(pico()), [{ ...EXCEPTION, review: '9999-12-31' }], TODAY);
    assert.equal(result.ok, false);
    assert.match(result.problems.join('\n'), /90 jours/);
  });

  it('exception devenue inutile (alerte absente) : échec, à retirer', () => {
    const result = evaluate({ vulnerabilities: {} }, [EXCEPTION], TODAY);
    assert.equal(result.ok, false);
    assert.match(result.problems.join('\n'), /GHSA-fc5q-39xc-vjpf.*n’apparaît plus.*retir/);
  });

  it('alerte toujours présente mais devenue modérée : message exact, exception à retirer', () => {
    const result = evaluate(report(pico('moderate')), [EXCEPTION], TODAY);
    assert.equal(result.ok, false);
    assert.match(
      result.problems.join('\n'),
      /GHSA-fc5q-39xc-vjpf.*n’est plus haute ni critique.*retir/,
    );
  });

  it('exception incomplète (sans motif, sans paquet ou sans date de revue) : échec', () => {
    for (const missing of ['reason', 'package', 'review']) {
      const partial = { ...EXCEPTION };
      delete partial[missing];
      const result = evaluate(report(pico()), [partial], TODAY);
      assert.equal(result.ok, false, missing);
    }
  });

  it('identifiant d’exception numérique (alerte npm sans GHSA) : accepté, sans plantage', () => {
    const npmOnly = advisory(1096460, 'high', 'https://example.org/advisory', 'legacy');
    const exception = {
      id: 1096460,
      package: 'legacy',
      reason: 'Sans correctif.',
      review: '2026-12-01',
    };
    assert.equal(evaluate(report(npmOnly), [exception], TODAY).ok, true);
  });

  it('une même alerte vue par plusieurs paquets n’est comptée qu’une fois', () => {
    const a = advisory(7, 'high', 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc');
    const r = {
      vulnerabilities: {
        one: { severity: 'high', via: [a] },
        two: { severity: 'high', via: [{ ...a }] },
      },
    };
    assert.equal(evaluate(r, [], TODAY).blocking.length, 1);
  });
});

describe('parseExceptions', () => {
  it('lit une liste d’objets', () => {
    assert.deepEqual(parseExceptions(JSON.stringify([EXCEPTION])), [EXCEPTION]);
  });

  it('refuse un objet seul, une entrée vide ou un JSON invalide, avec un message clair', () => {
    assert.throws(() => parseExceptions(JSON.stringify(EXCEPTION)), /liste/);
    assert.throws(() => parseExceptions('[null]'), /entrée 1/);
    assert.throws(() => parseExceptions('[{'), /audit-exceptions\.json/);
  });

  it('le fichier du dépôt est valide', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    assert.ok(
      parseExceptions(readFileSync(join(root, 'audit-exceptions.json'), 'utf8')).length >= 0,
    );
  });
});

describe('parseAuditOutput', () => {
  it('lit le rapport JSON, même quand npm audit sort en erreur (failles trouvées)', () => {
    assert.deepEqual(
      parseAuditOutput({ stdout: '{"vulnerabilities":{}}', stderr: '', status: 1 }),
      { vulnerabilities: {} },
    );
  });

  it('npm a échoué sans rapport : erreur claire avec le code et la sortie d’erreur', () => {
    assert.throws(
      () => parseAuditOutput({ stdout: '', stderr: 'npm ERR! network timeout', status: 1 }),
      /npm audit.*code 1.*network timeout/s,
    );
    assert.throws(
      () => parseAuditOutput({ stdout: undefined, stderr: undefined, status: null }),
      /npm audit/,
    );
  });

  it('rapport d’erreur de npm (JSON avec « error ») : erreur claire', () => {
    assert.throws(
      () =>
        parseAuditOutput({
          stdout: '{"error":{"summary":"registry unreachable"}}',
          stderr: '',
          status: 1,
        }),
      /registry unreachable/,
    );
  });
});

describe('localDate', () => {
  it('date du jour dans le fuseau demandé, pas en UTC', () => {
    // 2026-12-18 23:30 UTC = 2026-12-19 00:30 à Paris.
    assert.equal(localDate(new Date('2026-12-18T23:30:00Z'), 'Europe/Paris'), '2026-12-19');
    assert.equal(localDate(new Date('2026-12-18T23:30:00Z'), 'UTC'), '2026-12-18');
  });
});
