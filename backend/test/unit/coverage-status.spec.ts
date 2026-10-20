import type { RequestStatus } from '@prisma/client';
import {
  ACTIVE_STATUSES,
  coverageMainStatus,
  FINAL_STATUSES,
  MAIN_STATUS_VALUES,
  MAIN_STATUSES,
  type MainStatus,
} from '../../src/coverage/domain/coverage-status';

describe('Statut principal et sous-état des affectations (R1, FR-008, FR-008c)', () => {
  it.each<[RequestStatus, MainStatus, string | null]>([
    ['PENDING', 'PENDING', null],
    ['ACCEPTED', 'ASSIGNED', null],
    ['EN_ROUTE', 'ASSIGNED', 'EN_ROUTE'],
    ['LATE', 'ASSIGNED', 'LATE'],
    ['ON_DUTY', 'IN_PROGRESS', null],
    ['RELIEF_PENDING', 'IN_PROGRESS', 'RELIEF_PENDING'],
    ['DONE', 'DONE', null],
    ['CLOSED', 'DONE', 'CLOSED'],
    ['CANCELLED', 'CANCELLED', null],
    ['UNFILLED', 'UNFILLED', null],
  ])('%s → %s (sous-état %s)', (status, mainStatus, subState) => {
    expect(coverageMainStatus(status)).toEqual({ mainStatus, subState });
  });

  it.each<RequestStatus>([
    'BROADCAST',
    'DRAFT',
    'PENDING_ADMIN_VALIDATION',
    'SENT',
    'IN_PROGRESS',
    'TO_CORRECT',
    'REJECTED',
  ])('%s (obsolète ou statut de demande de travail) lève une erreur', (status) => {
    expect(() => coverageMainStatus(status)).toThrow(/sans équivalent/);
  });

  it('les six statuts principaux, dans l’ordre d’affichage', () => {
    expect(MAIN_STATUSES).toEqual([
      'PENDING',
      'ASSIGNED',
      'IN_PROGRESS',
      'DONE',
      'CANCELLED',
      'UNFILLED',
    ]);
  });

  it('MAIN_STATUS_VALUES : les statuts techniques de chaque filtre, sans recouvrement ni oubli', () => {
    expect(MAIN_STATUS_VALUES).toEqual({
      PENDING: ['PENDING'],
      ASSIGNED: ['ACCEPTED', 'EN_ROUTE', 'LATE'],
      IN_PROGRESS: ['ON_DUTY', 'RELIEF_PENDING'],
      DONE: ['DONE', 'CLOSED'],
      CANCELLED: ['CANCELLED'],
      UNFILLED: ['UNFILLED'],
    });
    for (const [main, statuses] of Object.entries(MAIN_STATUS_VALUES)) {
      for (const status of statuses) expect(coverageMainStatus(status).mainStatus).toBe(main);
    }
  });

  it('statuts actifs (listes) avec « en attente » ; statuts finaux (FR-008a)', () => {
    expect([...ACTIVE_STATUSES].sort()).toEqual([
      'ACCEPTED',
      'EN_ROUTE',
      'LATE',
      'ON_DUTY',
      'PENDING',
      'RELIEF_PENDING',
    ]);
    expect([...FINAL_STATUSES].sort()).toEqual(['CANCELLED', 'CLOSED', 'DONE', 'UNFILLED']);
  });
});
