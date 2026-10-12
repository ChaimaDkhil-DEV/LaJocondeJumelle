import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestActions } from '../../src/features/requests/RequestActions';
import type { RequestDetail } from '../../src/features/requests/types';

/** T050 — boutons d'action : uniquement allowedActions, motifs obligatoires, photo de preuve, conflit. */

function detail(overrides: Partial<RequestDetail> = {}): RequestDetail {
  return {
    id: 'r1',
    reference: 'D-2026-000001',
    title: 'Photocopies',
    category: { id: 'c1', name: 'Photocopies' },
    priority: 'NORMAL',
    status: 'SENT',
    requester: { id: 'u1', displayName: 'Enseignante' },
    assignee: { id: 'u2', displayName: 'Reprographie' },
    createdAt: '2026-10-12T10:00:00.000Z',
    currentStage: null,
    currentDueAt: null,
    warnAt: null,
    overdueStage: null,
    hasVoice: false,
    unreadCount: 0,
    description: null,
    voice: null,
    rulesSnapshot: { circuit: 'A_DIRECT', photoRequired: false, closureMode: 'REQUESTER', finalValidation: false },
    timestamps: {
      createdAt: '2026-10-12T10:00:00.000Z',
      submittedAt: null,
      approvedAt: null,
      rejectedAt: null,
      assignedAt: null,
      acceptedAt: null,
      startedAt: null,
      doneAt: null,
      finalValidatedAt: null,
      closedAt: null,
      cancelledAt: null,
    },
    proofPhotos: [],
    autoCloseAt: null,
    version: 3,
    rejectionReason: null,
    allowedActions: [],
    canWriteInThread: true,
    ...overrides,
  };
}

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Call = { url: string; method: string; body: unknown };

function setup(request: RequestDetail, handler: (call: Call) => Response | Promise<Response> = () => json(200, request)) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: Call = {
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      };
      calls.push(call);
      return handler(call);
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RequestActions request={request} />
    </QueryClientProvider>,
  );
  return calls;
}

const actionCalls = (calls: Call[]) => calls.filter((c) => c.url === '/api/requests/r1/actions');

describe('RequestActions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('n’affiche que les actions permises, avec des libellés en langage courant', () => {
    setup(detail({ allowedActions: ['ACCEPT', 'DECLINE', 'CHANGE_PRIORITY'] }));
    expect(screen.getByRole('button', { name: 'Accepter la demande' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Commencer' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('n’affiche rien quand aucune action n’est possible', () => {
    setup(detail({ allowedActions: [] }));
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('envoie l’action avec la version lue', async () => {
    const calls = setup(detail({ allowedActions: ['ACCEPT'] }), () => json(200, detail({ status: 'ACCEPTED', version: 4 })));
    await userEvent.click(screen.getByRole('button', { name: 'Accepter la demande' }));
    await waitFor(() => expect(actionCalls(calls)).toHaveLength(1));
    expect(actionCalls(calls)[0]).toMatchObject({ method: 'POST', body: { action: 'ACCEPT', version: 3 } });
    expect(await screen.findByRole('status')).toHaveTextContent('Acceptée');
  });

  it('exige un motif pour refuser', async () => {
    const calls = setup(detail({ allowedActions: ['DECLINE'] }));
    await userEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    const dialog = await screen.findByRole('dialog', { name: 'Refuser la demande' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmer le refus' }));
    expect(within(dialog).getByText('Indiquez le motif du refus.')).toBeVisible();
    expect(actionCalls(calls)).toHaveLength(0);

    await userEvent.type(within(dialog).getByLabelText('Motif du refus'), 'Pas mon service');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmer le refus' }));
    await waitFor(() =>
      expect(actionCalls(calls)[0]?.body).toEqual({ action: 'DECLINE', version: 3, reason: 'Pas mon service' }),
    );
  });

  it('exige un commentaire pour renvoyer à corriger', async () => {
    const calls = setup(detail({ status: 'DONE', allowedActions: ['CLOSE', 'REQUEST_CORRECTION'] }));
    await userEvent.click(screen.getByRole('button', { name: 'Renvoyer à corriger' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renvoyer à corriger' });
    await userEvent.type(within(dialog).getByLabelText('Ce qu’il faut corriger'), 'Il manque une page');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Renvoyer à corriger' }));
    await waitFor(() =>
      expect(actionCalls(calls)[0]?.body).toEqual({ action: 'REQUEST_CORRECTION', version: 3, reason: 'Il manque une page' }),
    );
  });

  it('demande confirmation avant d’annuler la demande', async () => {
    const calls = setup(detail({ allowedActions: ['CANCEL'] }));
    await userEvent.click(screen.getByRole('button', { name: 'Annuler la demande' }));
    const dialog = await screen.findByRole('dialog', { name: 'Annuler cette demande ?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retour' }));
    expect(actionCalls(calls)).toHaveLength(0);

    // Attendre la fin de l'animation de fermeture (la page est masquée aux aides techniques pendant ce temps).
    await userEvent.click(await screen.findByRole('button', { name: 'Annuler la demande' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Oui, annuler la demande' }));
    await waitFor(() => expect(actionCalls(calls)[0]?.body).toEqual({ action: 'CANCEL', version: 3 }));
  });

  it('impose une photo de preuve quand la catégorie l’exige', async () => {
    const request = detail({
      status: 'IN_PROGRESS',
      allowedActions: ['COMPLETE'],
      rulesSnapshot: { circuit: 'A_DIRECT', photoRequired: true, closureMode: 'REQUESTER', finalValidation: false },
    });
    const calls = setup(request, (call) =>
      call.url === '/api/files' ? json(201, { id: 'photo-1', kind: 'PHOTO', mimeType: 'image/jpeg', sizeBytes: 10 }) : json(200, request),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Marquer comme terminée' }));
    const dialog = await screen.findByRole('dialog', { name: 'Terminer la demande' });
    expect(within(dialog).getByText(/photo de preuve est obligatoire/)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Confirmer la fin' })).toBeDisabled();

    const file = new File(['image'], 'etagere.jpg', { type: 'image/jpeg' });
    await userEvent.upload(within(dialog).getByLabelText('Prendre une photo'), file);
    expect(await within(dialog).findByRole('img', { name: 'Photo de preuve 1' })).toBeVisible();
    expect(calls.find((c) => c.url === '/api/files')?.body).toBeInstanceOf(FormData);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmer la fin' }));
    await waitFor(() =>
      expect(actionCalls(calls)[0]?.body).toEqual({ action: 'COMPLETE', version: 3, proofFileIds: ['photo-1'] }),
    );
  });

  it('affiche le refus d’une photo par le serveur (format, taille)', async () => {
    const request = detail({
      status: 'IN_PROGRESS',
      allowedActions: ['COMPLETE'],
      rulesSnapshot: { circuit: 'A_DIRECT', photoRequired: true, closureMode: 'REQUESTER', finalValidation: false },
    });
    setup(request, (call) =>
      call.url === '/api/files'
        ? json(415, { error: { code: 'FILE_TYPE_NOT_ALLOWED', message: 'Le format HEIC n’est pas accepté.' } })
        : json(200, request),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Marquer comme terminée' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.upload(within(dialog).getByLabelText('Choisir dans la galerie'), new File(['x'], 'photo.heic', { type: 'image/heic' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('HEIC');
  });

  it('termine directement quand aucune photo n’est exigée', async () => {
    const calls = setup(detail({ status: 'IN_PROGRESS', allowedActions: ['COMPLETE'] }));
    await userEvent.click(screen.getByRole('button', { name: 'Marquer comme terminée' }));
    await waitFor(() => expect(actionCalls(calls)[0]?.body).toEqual({ action: 'COMPLETE', version: 3 }));
  });

  it('explique un conflit (STATE_CHANGED) et recharge la demande', async () => {
    const calls = setup(detail({ allowedActions: ['ACCEPT'] }), (call) =>
      call.method === 'POST'
        ? json(409, { error: { code: 'STATE_CHANGED', message: 'La demande a été modifiée entre-temps. Elle a été rechargée.' } })
        : json(200, detail({ status: 'ACCEPTED', version: 4 })),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Accepter la demande' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('modifiée entre-temps');
    await waitFor(() => expect(calls.some((c) => c.method === 'GET' && c.url === '/api/requests/r1')).toBe(true));
  });
});
