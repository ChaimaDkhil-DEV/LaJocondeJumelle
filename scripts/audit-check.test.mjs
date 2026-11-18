import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluate } from './audit-check.mjs';

/**
 * Audit des dépendances de la CI : `npm audit` échoue sur toute faille haute ou critique, sauf une alerte inscrite
 * dans `audit-exceptions.json` (motif et date de revue obligatoires). Une exception échue ou devenue inutile fait
 * aussi échouer : elle doit être revue ou retirée.
 */

const advisory = (source, severity, url = `https://github.com/advisories/${source}`) => ({
  source,
  name: 'x',
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
      ['GHSA-aaaa-bbbb-cccc'],
    );
  });

  it('une faille critique non listée : échec', () => {
    assert.equal(evaluate(report(advisory(2, 'critical')), [], TODAY).ok, false);
  });

  it('une faille modérée ou faible : jamais bloquante', () => {
    assert.equal(evaluate(report(advisory(3, 'moderate'), advisory(4, 'low')), [], TODAY).ok, true);
  });

  it('l’alerte picomatch listée : succès, et elle est rappelée comme exception', () => {
    const result = evaluate(report(advisory(5, 'high', PICO)), [EXCEPTION], TODAY);
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.excepted.map((e) => e.id),
      ['GHSA-fc5q-39xc-vjpf'],
    );
  });

  it('l’exception ne couvre que son alerte : une autre faille haute fait toujours échouer', () => {
    const result = evaluate(
      report(
        advisory(5, 'high', PICO),
        advisory(6, 'high', 'https://github.com/advisories/GHSA-zzzz-yyyy-xxxx'),
      ),
      [EXCEPTION],
      TODAY,
    );
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.blocking.map((b) => b.id),
      ['GHSA-zzzz-yyyy-xxxx'],
    );
  });

  it('exception échue (date de revue passée) : échec, à revoir', () => {
    const result = evaluate(report(advisory(5, 'high', PICO)), [EXCEPTION], '2026-12-19');
    assert.equal(result.ok, false);
    assert.match(result.problems.join('\n'), /GHSA-fc5q-39xc-vjpf.*2026-12-18/);
  });

  it('exception devenue inutile (alerte corrigée) : échec, à retirer', () => {
    const result = evaluate({ vulnerabilities: {} }, [EXCEPTION], TODAY);
    assert.equal(result.ok, false);
    assert.match(result.problems.join('\n'), /GHSA-fc5q-39xc-vjpf.*retir/);
  });

  it('exception incomplète (sans motif ou sans date de revue) : échec', () => {
    const result = evaluate(
      report(advisory(5, 'high', PICO)),
      [{ id: 'GHSA-fc5q-39xc-vjpf', review: '2026-12-18' }],
      TODAY,
    );
    assert.equal(result.ok, false);
    assert.match(result.problems.join('\n'), /motif/);
  });

  it('une même alerte vue par plusieurs paquets n’est comptée qu’une fois', () => {
    const a = advisory(7, 'high', 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc');
    const r = {
      vulnerabilities: {
        one: { severity: 'high', via: [a] },
        two: { severity: 'high', via: [{ ...a, name: 'y' }] },
      },
    };
    assert.equal(evaluate(r, [], TODAY).blocking.length, 1);
  });
});
