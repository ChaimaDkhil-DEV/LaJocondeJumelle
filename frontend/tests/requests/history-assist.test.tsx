import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeEvent, HistoryTimeline, type HistoryEvent } from '../../src/features/requests/HistoryTimeline';

/** T023 (spec 009) — entrée « Propositions automatiques » de l'historique. */

const SOURCES = [
  { id: 'g1', title: 'Pannes de reprographie' },
  { id: 'g2', title: 'Accueil' },
];

function assisted(fromValue: Record<string, unknown>, toValue: Record<string, unknown>): HistoryEvent {
  return {
    id: 'e1',
    type: 'ASSIST_SUGGESTED',
    actor: { id: 'u1', displayName: 'Enseignante' },
    fromValue,
    toValue,
    comment: null,
    createdAt: '2026-10-20T08:00:00.000Z',
  };
}

const RETAINED = { title: 'Photocopieuse en panne', categoryId: 'c1', categoryName: 'Photocopies', priority: 'HIGH' };

describe('Historique : propositions automatiques', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('indique, pour chaque valeur proposée, si elle a été retenue', () => {
    expect(describeEvent(assisted({ ...RETAINED, sources: SOURCES }, RETAINED))).toBe(
      'Propositions automatiques : catégorie « Photocopies » (retenue), priorité Haute (retenue), titre proposé (retenu)',
    );
    expect(
      describeEvent(
        assisted(
          { title: 'Autre titre', categoryId: 'c2', categoryName: 'Petits travaux', priority: 'URGENT', sources: [] },
          RETAINED,
        ),
      ),
    ).toBe('Propositions automatiques : catégorie « Petits travaux » (retenue : « Photocopies »), priorité Urgente (retenue : Haute), titre proposé (modifié)');
  });

  it('ne mentionne que les valeurs proposées', () => {
    expect(describeEvent(assisted({ priority: 'HIGH', sources: [] }, RETAINED))).toBe('Propositions automatiques : priorité Haute (retenue)');
  });

  it('affiche l’entrée avec les consignes utilisées', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([assisted({ ...RETAINED, sources: SOURCES }, RETAINED)]), { headers: { 'Content-Type': 'application/json' } })),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HistoryTimeline requestId="r1" />
      </QueryClientProvider>,
    );
    const list = await screen.findByRole('list', { name: 'Historique' });
    const item = within(list).getByRole('listitem');
    expect(item).toHaveTextContent('Propositions automatiques : catégorie « Photocopies » (retenue)');
    expect(item).toHaveTextContent('Consignes : Pannes de reprographie, Accueil');
    expect(item).toHaveTextContent('par Enseignante');
  });
});
