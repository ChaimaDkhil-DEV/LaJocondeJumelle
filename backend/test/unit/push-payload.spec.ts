import { NotificationType, RequestKind } from '@prisma/client';
import { pushCategoryOf } from '../../src/push/domain/push-category';
import { buildPushPayload } from '../../src/push/domain/push-payload';

/**
 * 014, T015 (D7, FR-007, SC-006, contracts/push-payload.md) : contenu minimal d'un push. Aucun texte rédigé
 * par le serveur, aucune donnée personnelle : seulement l'identifiant, le type, la classe ou la référence, le
 * chemin de la ressource.
 */

const COVERAGE_ID = '9b2e0000-0000-4000-8000-000000000001';
const WORK_ID = '9b2e0000-0000-4000-8000-000000000002';

const PUSH_TYPES = Object.values(NotificationType).filter(
  (t) => pushCategoryOf(t, RequestKind.COVERAGE) !== null || pushCategoryOf(t, RequestKind.WORK) !== null,
);

/** Sentinelles : ce qu'une demande contient et qui ne doit jamais sortir dans un push. */
const SENSITIVE = ['TITRE-SECRET', 'DESCRIPTION-SECRETE', 'MESSAGE-SECRET', 'Mme Sentinelle', 'M. Témoin', 'Élève Sentinelle'];

/** Demande « complète » telle qu'un appelant négligent pourrait la passer : seuls les champs prévus doivent servir. */
function richRequest(kind: RequestKind) {
  return {
    requestId: kind === 'COVERAGE' ? COVERAGE_ID : WORK_ID,
    kind,
    reference: 'D-2026-000123',
    className: kind === 'COVERAGE' ? 'CE1 Vert' : null,
    title: SENSITIVE[0],
    description: SENSITIVE[1],
    lastMessage: SENSITIVE[2],
    absentTeacher: SENSITIVE[3],
    requesterName: SENSITIVE[4],
    pupil: SENSITIVE[5],
    priority: 'URGENT',
    status: 'IN_PROGRESS',
  };
}

describe('buildPushPayload', () => {
  it('garde : nom de la classe et chemin de la garde', () => {
    expect(
      buildPushPayload({ notificationId: 'n1', type: 'COVERAGE_EMPTY_CLASS', ...richRequest('COVERAGE') }),
    ).toEqual({ v: 1, id: 'n1', type: 'COVERAGE_EMPTY_CLASS', place: 'CE1 Vert', url: `/gardes/${COVERAGE_ID}` });
  });

  it('demande de travail : référence et chemin de la demande', () => {
    expect(buildPushPayload({ notificationId: 'n2', type: 'URGENT', ...richRequest('WORK') })).toEqual({
      v: 1,
      id: 'n2',
      type: 'URGENT',
      place: 'D-2026-000123',
      url: `/demandes/${WORK_ID}`,
    });
  });

  it('garde sans nom de classe connu : référence', () => {
    expect(
      buildPushPayload({ notificationId: 'n3', type: 'ASSIGNED', ...richRequest('COVERAGE'), className: null }).place,
    ).toBe('D-2026-000123');
  });

  it.each(PUSH_TYPES)('SC-006 — %s : aucune donnée sensible, ni priorité, ni statut', (type) => {
    for (const kind of [RequestKind.COVERAGE, RequestKind.WORK]) {
      const json = JSON.stringify(buildPushPayload({ notificationId: 'n', type, ...richRequest(kind) }));
      expect(Object.keys(JSON.parse(json)).sort()).toEqual(['id', 'place', 'type', 'url', 'v']);
      for (const secret of SENSITIVE) expect(json).not.toContain(secret);
      expect(json).not.toMatch(/priority|status|IN_PROGRESS/i);
      expect(Buffer.byteLength(json)).toBeLessThan(1024);
    }
  });
});
