/**
 * Audit des dépendances (CI, étape « Audit des dépendances ») : comme `npm audit --audit-level=high`, échoue sur
 * toute faille haute ou critique, SAUF une alerte inscrite dans `audit-exceptions.json` à la racine. Une exception
 * n'est admise que pour une alerte sans version corrigée, qui n'atteint pas la production : elle nomme le paquet,
 * donne un motif et une date de revue proche (90 jours au plus). Une exception échue, mal formée, posée sur un autre
 * paquet ou devenue inutile fait échouer, pour être revue ou retirée.
 *
 * Fonctions sans effet de bord, testées par audit-check.test.mjs ; le lancement est dans run-audit-check.mjs.
 */

const BLOCKING = new Set(['high', 'critical']);
const GHSA = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Une exception se revoit au moins tous les trois mois : elle ne devient jamais permanente. */
export const MAX_REVIEW_DAYS = 90;

/** Identifiant normalisé d'une alerte : le GHSA de son adresse en majuscules, à défaut le numéro npm. */
function advisoryId(via) {
  return (
    (typeof via.url === 'string' && via.url.match(GHSA)?.[0]) ||
    String(via.source)
  ).toUpperCase();
}

/** Vraie date du calendrier (AAAA-MM-JJ) ; null sinon (ex. 2026-99-99). */
function calendarDay(value) {
  const m = DATE.exec(typeof value === 'string' ? value : '');
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value ? d : null;
}

function addDays(day, days) {
  const d = calendarDay(day);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Date du jour (AAAA-MM-JJ) dans le fuseau indiqué, et non en UTC. */
export function localDate(now, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Contenu de audit-exceptions.json : une liste d'objets, sinon une erreur qui dit quoi corriger. */
export function parseExceptions(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`audit-exceptions.json n'est pas un JSON valide : ${error.message}`);
  }
  if (!Array.isArray(data))
    throw new Error('audit-exceptions.json doit contenir une liste d’exceptions : [ { … } ].');
  data.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(
        `audit-exceptions.json, entrée ${i + 1} : un objet { id, package, reason, review } est attendu.`,
      );
    }
  });
  return data;
}

/** Rapport de `npm audit --json` ; une erreur claire (code, sortie d'erreur) si npm n'a pas pu auditer. */
export function parseAuditOutput({ stdout, stderr, status }) {
  const detail = () =>
    `npm audit a échoué (code ${status ?? 'inconnu'}) sans rapport exploitable : ${(stderr ?? '').trim() || 'aucune sortie d’erreur'}`;
  if (typeof stdout !== 'string' || stdout.trim() === '') throw new Error(detail());
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    throw new Error(detail());
  }
  if (report.error)
    throw new Error(`npm audit a échoué : ${report.error.summary ?? JSON.stringify(report.error)}`);
  return report;
}

/**
 * Décision. `report` : sortie de `npm audit --json` ; `exceptions` : contenu de audit-exceptions.json ;
 * `today` : AAAA-MM-JJ (date locale de l'équipe).
 */
export function evaluate(report, exceptions, today) {
  // Toutes les alertes du rapport (objets de `via`), par identifiant puis par paquet ; un paquet qui dépend d'un
  // paquet vulnérable n'en ajoute pas.
  const all = new Map();
  for (const [pkg, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== 'object' || via === null) continue;
      const id = advisoryId(via);
      const entry = {
        id,
        package: via.name ?? pkg,
        severity: via.severity,
        title: via.title,
        url: via.url,
      };
      const list = all.get(id) ?? [];
      if (!list.some((a) => a.package === entry.package)) list.push(entry);
      all.set(id, list);
    }
  }

  const problems = [];
  const valid = new Map();
  for (const e of exceptions) {
    const label = e.id ?? '(sans identifiant)';
    if (
      (typeof e.id !== 'string' && typeof e.id !== 'number') ||
      typeof e.package !== 'string' ||
      !e.package ||
      typeof e.reason !== 'string' ||
      !e.reason.trim() ||
      e.review === undefined
    ) {
      problems.push(
        `Exception ${label} incomplète : identifiant, paquet, motif et date de revue (AAAA-MM-JJ) sont obligatoires.`,
      );
      continue;
    }
    if (!calendarDay(e.review)) {
      problems.push(
        `Exception ${label} : date de revue « ${e.review} » invalide (date réelle AAAA-MM-JJ attendue).`,
      );
      continue;
    }
    if (e.review < today) {
      problems.push(
        `Exception ${label} échue depuis le ${e.review} : vérifiez si une version corrigée existe, puis mettez à jour la dépendance ou repoussez la date de revue.`,
      );
      continue;
    }
    if (e.review > addDays(today, MAX_REVIEW_DAYS)) {
      problems.push(
        `Exception ${label} : date de revue ${e.review} au-delà de ${MAX_REVIEW_DAYS} jours ; une exception se revoit au moins tous les trois mois.`,
      );
      continue;
    }
    const id = String(e.id).toUpperCase();
    const seen = all.get(id);
    if (!seen) {
      problems.push(
        `Exception ${label} inutile : l’alerte n’apparaît plus dans l’audit, retirez-la de audit-exceptions.json.`,
      );
    } else if (!seen.some((a) => BLOCKING.has(a.severity))) {
      problems.push(
        `Exception ${label} inutile : l’alerte n’est plus haute ni critique, retirez-la de audit-exceptions.json.`,
      );
    }
    valid.set(id, e);
  }

  const blocking = [];
  const excepted = [];
  for (const list of all.values()) {
    for (const a of list) {
      if (!BLOCKING.has(a.severity)) continue;
      const exception = valid.get(a.id);
      if (exception && exception.package === a.package) {
        excepted.push(a);
      } else {
        if (exception)
          problems.push(
            `L’alerte ${a.id} touche le paquet ${a.package} ; l’exception ne couvre que ${exception.package}.`,
          );
        blocking.push(a);
      }
    }
  }
  return { ok: blocking.length === 0 && problems.length === 0, blocking, excepted, problems };
}
