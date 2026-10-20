import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { CoverageStatusBadge, MAIN_STATUS_LABELS, SUB_STATE_LABELS, derivedStatus } from '../../src/features/coverage/labels';
import { CoverageRow } from '../../src/features/coverage/ManagerViews';
import type { CoverageStatus, CoverageSummary, MainStatus, SubState } from '../../src/features/coverage/types';

/** T041 — Statut principal et sous-état (R1, FR-008, FR-008c) : badge principal, badge de sous-état. */

describe('Badges de statut des affectations', () => {
  it('six statuts principaux, libellés de la spécification', () => {
    expect(MAIN_STATUS_LABELS).toEqual({
      PENDING: 'En attente',
      ASSIGNED: 'Assignée',
      IN_PROGRESS: 'En cours',
      DONE: 'Terminée',
      CANCELLED: 'Annulée',
      UNFILLED: 'Non pourvue',
    });
    expect(SUB_STATE_LABELS).toEqual({
      EN_ROUTE: 'En route',
      LATE: 'En retard',
      RELIEF_PENDING: 'Relève demandée',
      CLOSED: 'Clôturée après validation',
    });
  });

  it.each<[MainStatus, SubState | null, string[]]>([
    ['PENDING', null, ['En attente']],
    ['ASSIGNED', 'LATE', ['Assignée', 'En retard']],
    ['IN_PROGRESS', 'RELIEF_PENDING', ['En cours', 'Relève demandée']],
    ['DONE', 'CLOSED', ['Terminée', 'Clôturée après validation']],
  ])('%s / %s : statut principal puis sous-état en badge', (mainStatus, subState, texts) => {
    render(<CoverageStatusBadge mainStatus={mainStatus} subState={subState} />);
    for (const text of texts) expect(screen.getByText(text)).toBeInTheDocument();
    // Le sous-état n'est jamais seul : le statut principal est toujours affiché.
    expect(screen.getByText(MAIN_STATUS_LABELS[mainStatus])).toBeInTheDocument();
  });

  it.each<[CoverageStatus, MainStatus, SubState | null]>([
    ['PENDING', 'PENDING', null],
    ['BROADCAST', 'PENDING', null],
    ['ACCEPTED', 'ASSIGNED', null],
    ['EN_ROUTE', 'ASSIGNED', 'EN_ROUTE'],
    ['LATE', 'ASSIGNED', 'LATE'],
    ['ON_DUTY', 'IN_PROGRESS', null],
    ['RELIEF_PENDING', 'IN_PROGRESS', 'RELIEF_PENDING'],
    ['DONE', 'DONE', null],
    ['CLOSED', 'DONE', 'CLOSED'],
    ['CANCELLED', 'CANCELLED', null],
    ['UNFILLED', 'UNFILLED', null],
  ])('statut technique %s → %s / %s (même table que le serveur)', (status, mainStatus, subState) => {
    expect(derivedStatus(status)).toEqual({ mainStatus, subState });
  });

  it('ligne de la file de l’admin : statut principal, sous-état, étage, enseignant, alerte de délai', () => {
    const now = new Date().toISOString();
    const item: CoverageSummary = {
      id: 'g1',
      reference: 'G-2026-000001',
      status: 'LATE',
      mainStatus: 'ASSIGNED',
      subState: 'LATE',
      source: 'TEACHER_REQUEST',
      type: 'LATENESS',
      priority: 'URGENT',
      version: 2,
      category: { id: 'c1', name: 'Garde de classe' },
      class: { id: 'k1', name: '1ère année Violet', room: 'Salle 12' },
      floor: { id: 'f1', name: '1er étage' },
      teacher: { id: 't1', displayName: 'Mme Martin' },
      absentTeacher: null,
      startAt: now,
      estimatedMinutes: 60,
      plannedEndAt: now,
      requester: { id: 't1', displayName: 'Mme Martin' },
      assignee: { id: 's1', displayName: 'Surveillant' },
      supports: [],
      alerts: [],
      reliefForId: null,
      mergedIntoId: null,
      hasVoice: false,
      hasNote: false,
      currentStage: 'ARRIVAL',
      currentDueAt: now,
      overdueStage: 'ARRIVAL',
      extensionCount: 0,
      durationMinutes: null,
      timestamps: {
        createdAt: now,
        acceptedAt: now,
        departedAt: null,
        presenceAt: null,
        relievedAt: null,
        closedAt: null,
        cancelledAt: null,
      },
    };
    render(
      <MemoryRouter>
        <CoverageRow item={item} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Assignée')).toBeInTheDocument();
    expect(screen.getByText('En retard')).toBeInTheDocument();
    expect(screen.getByText(/1er étage/)).toBeInTheDocument();
    expect(screen.getByText(/Mme Martin/)).toBeInTheDocument();
    expect(screen.getByText('Retard')).toBeInTheDocument();
  });

  it('demande en attente dont le délai de prise en charge a expiré : mise en évidence', () => {
    const now = new Date().toISOString();
    render(
      <MemoryRouter>
        <CoverageRow
          item={{
            id: 'g2',
            reference: 'G-2026-000002',
            status: 'PENDING',
            mainStatus: 'PENDING',
            subState: null,
            source: 'TEACHER_REQUEST',
            type: 'ABSENCE',
            priority: 'URGENT',
            version: 0,
            category: { id: 'c1', name: 'Garde de classe' },
            class: { id: 'k2', name: '2e année Bleu', room: null },
            floor: null,
            teacher: null,
            absentTeacher: null,
            startAt: now,
            estimatedMinutes: 60,
            plannedEndAt: now,
            requester: { id: 't1', displayName: 'Mme Martin' },
            assignee: null,
            supports: [],
            alerts: ['TAKEOVER_EXPIRED'],
            reliefForId: null,
            mergedIntoId: null,
            hasVoice: false,
            hasNote: false,
            currentStage: null,
            currentDueAt: null,
            overdueStage: null,
            extensionCount: 0,
            durationMinutes: null,
            timestamps: {
              createdAt: now,
              acceptedAt: null,
              departedAt: null,
              presenceAt: null,
              relievedAt: null,
              closedAt: null,
              cancelledAt: null,
            },
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('En attente')).toBeInTheDocument();
    expect(screen.getByText('Délai d’assignation dépassé')).toBeInTheDocument();
    expect(screen.getByText('Sans surveillant')).toBeInTheDocument();
    expect(screen.getByText('Absence')).toBeInTheDocument();
  });
});
