import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeEvent, HistoryTimeline, type HistoryEvent } from '../../src/features/requests/HistoryTimeline';

/** T092 — historique lisible : action en français, auteur (ou système), date et heure, avant → après. */

const EVENTS = [
  { id: '1', type: 'CREATED', actor: { id: 'u1', displayName: 'Enseignante' }, fromValue: null, toValue: { priority: 'NORMAL' }, comment: null, createdAt: '2026-10-12T08:00:00.000Z' },
  { id: '2', type: 'STATUS_CHANGED', actor: { id: 'u1', displayName: 'Enseignante' }, fromValue: { status: 'DRAFT' }, toValue: { status: 'SENT' }, comment: null, createdAt: '2026-10-12T08:00:01.000Z' },
  { id: '3', type: 'ASSIGNED', actor: { id: 'u1', displayName: 'Enseignante' }, fromValue: null, toValue: { assigneeId: 'u2', assigneeName: 'Reprographie' }, comment: null, createdAt: '2026-10-12T08:00:02.000Z' },
  { id: '4', type: 'PRIORITY_CHANGED', actor: { id: 'u3', displayName: 'Responsable' }, fromValue: { priority: 'NORMAL' }, toValue: { priority: 'URGENT' }, comment: null, createdAt: '2026-10-12T08:10:00.000Z' },
  { id: '5', type: 'OVERDUE', actor: null, fromValue: null, toValue: { stage: 'TAKEOVER' }, comment: null, createdAt: '2026-10-12T08:20:00.000Z' },
  { id: '6', type: 'REASSIGNED', actor: { id: 'u3', displayName: 'Responsable' }, fromValue: { assigneeId: 'u2', assigneeName: 'Reprographie' }, toValue: { assigneeId: 'u4', assigneeName: 'Renfort' }, comment: null, createdAt: '2026-10-12T08:25:00.000Z' },
  { id: '7', type: 'STATUS_CHANGED', actor: { id: 'u4', displayName: 'Renfort' }, fromValue: { status: 'SENT' }, toValue: { status: 'REJECTED' }, comment: 'Pas de papier A3', createdAt: '2026-10-12T08:30:00.000Z' },
  { id: '8', type: 'MESSAGE_ADDED', actor: { id: 'u1', displayName: 'Enseignante' }, fromValue: null, toValue: { messageId: 'm1', kind: 'VOICE' }, comment: null, createdAt: '2026-10-12T08:31:00.000Z' },
  { id: '9', type: 'FILE_ADDED', actor: { id: 'u1', displayName: 'Enseignante' }, fromValue: null, toValue: { fileId: 'f1', kind: 'DOCUMENT' }, comment: null, createdAt: '2026-10-12T08:32:00.000Z' },
];

describe('HistoryTimeline', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('présente chaque action en langage courant, avec auteur et date', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(EVENTS), { headers: { 'Content-Type': 'application/json' } })));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HistoryTimeline requestId="r1" />
      </QueryClientProvider>,
    );
    const list = await screen.findByRole('list', { name: 'Historique' });
    const items = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toContain('Demande créée');
    expect(items[0]).toContain('par Enseignante');
    expect(items[1]).toContain('Statut : Brouillon → Envoyée');
    expect(items[2]).toContain('Affectée à Reprographie');
    expect(items[3]).toContain('Priorité : Normale → Urgente');
    expect(items[3]).toContain('par Responsable');
    expect(items[4]).toContain('En retard (prise en charge)');
    expect(items[4]).toContain('par le système');
    expect(items[5]).toContain('Réaffectée à Renfort (auparavant Reprographie)');
    expect(items[6]).toContain('Statut : Envoyée → Refusée');
    expect(items[6]).toContain('Pas de papier A3');
    expect(items[7]).toContain('Message vocal ajouté');
    expect(items[8]).toContain('Document joint');
    expect(within(list).getAllByRole('listitem')[0].querySelector('time')).toHaveAttribute('datetime', '2026-10-12T08:00:00.000Z');
  });

  it('indique la source de l’affectation décidée à l’approbation', () => {
    const assigned = (assigneeSource?: string): HistoryEvent => ({
      id: 'a',
      type: 'ASSIGNED',
      actor: { id: 'u3', displayName: 'Responsable' },
      fromValue: null,
      toValue: { assigneeId: 'u2', assigneeName: 'Reprographie', ...(assigneeSource ? { assigneeSource } : {}) },
      comment: null,
      createdAt: '2026-10-12T08:00:00.000Z',
    });
    expect(describeEvent(assigned('SNAPSHOT'))).toBe('Affectée à Reprographie (personne prévue à la soumission)');
    expect(describeEvent(assigned('CATEGORY_CURRENT'))).toBe('Affectée à Reprographie (selon la catégorie actuelle, demande antérieure)');
    expect(describeEvent(assigned('MANAGER_CHOICE'))).toBe('Affectée à Reprographie (choix du responsable)');
    expect(describeEvent(assigned())).toBe('Affectée à Reprographie');
  });
});
