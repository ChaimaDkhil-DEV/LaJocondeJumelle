import type { RequestStatus } from '@prisma/client';

/**
 * Statut principal et sous-état d'une affectation (R1, FR-008, FR-008c) : calculés à partir de
 * `Request.status`, seule source de vérité. Filtres, statistiques et alertes se fondent sur le
 * statut principal ; le sous-état n'est qu'un badge.
 */

export const MAIN_STATUSES = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'UNFILLED'] as const;
export type MainStatus = (typeof MAIN_STATUSES)[number];

export type SubState = 'EN_ROUTE' | 'LATE' | 'RELIEF_PENDING' | 'CLOSED';

export interface DerivedStatus {
  mainStatus: MainStatus;
  subState: SubState | null;
}

const MAPPING: Partial<Record<RequestStatus, DerivedStatus>> = {
  PENDING: { mainStatus: 'PENDING', subState: null },
  ACCEPTED: { mainStatus: 'ASSIGNED', subState: null },
  EN_ROUTE: { mainStatus: 'ASSIGNED', subState: 'EN_ROUTE' },
  LATE: { mainStatus: 'ASSIGNED', subState: 'LATE' },
  ON_DUTY: { mainStatus: 'IN_PROGRESS', subState: null },
  RELIEF_PENDING: { mainStatus: 'IN_PROGRESS', subState: 'RELIEF_PENDING' },
  DONE: { mainStatus: 'DONE', subState: null },
  CLOSED: { mainStatus: 'DONE', subState: 'CLOSED' },
  CANCELLED: { mainStatus: 'CANCELLED', subState: null },
  UNFILLED: { mainStatus: 'UNFILLED', subState: null },
};

/** Lève une erreur pour `BROADCAST` (obsolète, migré) et les statuts de demande de travail. */
export function coverageMainStatus(status: RequestStatus): DerivedStatus {
  const derived = MAPPING[status];
  if (!derived) throw new Error(`Statut d'affectation sans équivalent : ${status}`);
  return { ...derived };
}

/** Statuts techniques de chaque statut principal (filtres `mainStatus`). */
export const MAIN_STATUS_VALUES: Readonly<Record<MainStatus, readonly RequestStatus[]>> = Object.fromEntries(
  MAIN_STATUSES.map((main) => [
    main,
    (Object.keys(MAPPING) as RequestStatus[]).filter((status) => MAPPING[status]!.mainStatus === main),
  ]),
) as Record<MainStatus, readonly RequestStatus[]>;

/** Affectations non finales, « en attente » comprise (listes). */
export const ACTIVE_STATUSES: readonly RequestStatus[] = [
  ...MAIN_STATUS_VALUES.PENDING,
  ...MAIN_STATUS_VALUES.ASSIGNED,
  ...MAIN_STATUS_VALUES.IN_PROGRESS,
];

/** Statuts finaux : terminée, annulée, non pourvue (FR-008a). */
export const FINAL_STATUSES: readonly RequestStatus[] = [
  ...MAIN_STATUS_VALUES.DONE,
  ...MAIN_STATUS_VALUES.CANCELLED,
  ...MAIN_STATUS_VALUES.UNFILLED,
];
