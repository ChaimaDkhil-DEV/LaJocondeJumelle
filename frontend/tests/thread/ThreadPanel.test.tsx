import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadPanel } from '../../src/features/thread/ThreadPanel';
import { installFakeMedia } from '../mocks/media-recorder';

/** T060 — fil de discussion : messages, composeur texte/vocal/photo/fichier, erreurs, boîte d'envoi. */

const store = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async (key: string) => store.get(key),
  set: async (key: string, value: unknown) => void store.set(key, value),
  del: async (key: string) => void store.delete(key),
  values: async () => [...store.values()],
}));

const MESSAGES = [
  {
    id: 'm3',
    kind: 'SYSTEM',
    author: { id: 'u2', displayName: 'Reprographie' },
    text: 'À corriger : il manque une page',
    voice: null,
    attachments: [],
    createdAt: '2026-10-12T10:20:00.000Z',
  },
  {
    id: 'm2',
    kind: 'TEXT',
    author: { id: 'u1', displayName: 'Enseignante' },
    text: 'Voici le modèle',
    voice: null,
    attachments: [
      { fileId: 'f1', kind: 'PHOTO', mimeType: 'image/jpeg', originalName: 'modele.jpg', sizeBytes: 2048 },
      { fileId: 'f2', kind: 'DOCUMENT', mimeType: 'application/pdf', originalName: 'consignes.pdf', sizeBytes: 150_000 },
    ],
    createdAt: '2026-10-12T10:10:00.000Z',
  },
  {
    id: 'm1',
    kind: 'VOICE',
    author: { id: 'u2', displayName: 'Reprographie' },
    text: null,
    voice: { fileId: 'v1', durationSeconds: 4 },
    attachments: [],
    createdAt: '2026-10-12T10:00:00.000Z',
  },
];

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Call = { url: string; method: string; body: unknown };

function setup(
  { canWrite = true }: { canWrite?: boolean } = {},
  handler?: (call: Call) => Response | Promise<Response> | undefined,
): Call[] {
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
      const custom = await handler?.(call);
      if (custom) return custom;
      if (call.url.startsWith('/api/requests/r1/messages') && call.method === 'GET') {
        return json(200, { items: MESSAGES, nextCursor: null });
      }
      if (call.url === '/api/requests/r1/messages') return json(201, { ...MESSAGES[1], id: 'm4' });
      if (call.url === '/api/files') return json(201, { id: 'doc-1', kind: 'DOCUMENT', mimeType: 'application/pdf', sizeBytes: 10 });
      return json(404, { error: { code: 'NOT_FOUND', message: 'Introuvable' } });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThreadPanel requestId="r1" requestTitle="Photocopies" canWrite={canWrite} />
    </QueryClientProvider>,
  );
  return calls;
}

const posts = (calls: Call[]) => calls.filter((c) => c.method === 'POST' && c.url === '/api/requests/r1/messages');

describe('ThreadPanel', () => {
  beforeEach(() => {
    store.clear();
    installFakeMedia();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('affiche les messages du plus ancien au plus récent, avec auteur et date', async () => {
    setup();
    const list = await screen.findByRole('list', { name: 'Messages' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Reprographie');
    expect(within(items[0]).getByRole('button', { name: 'Lire le message vocal' })).toBeVisible();
    expect(items[1]).toHaveTextContent('Enseignante');
    expect(items[1]).toHaveTextContent('Voici le modèle');
    expect(items[1].querySelector('time')).toHaveAttribute('datetime', '2026-10-12T10:10:00.000Z');
  });

  it('distingue les messages système', async () => {
    setup();
    const list = await screen.findByRole('list', { name: 'Messages' });
    const system = within(list).getAllByRole('listitem')[2];
    expect(system).toHaveTextContent('Information');
    expect(system).toHaveTextContent('À corriger : il manque une page');
  });

  it('affiche les pièces jointes : image avec texte alternatif, lien de téléchargement du PDF', async () => {
    setup();
    expect(await screen.findByRole('img', { name: 'Photo jointe : modele.jpg' })).toHaveAttribute('src', '/api/files/f1');
    expect(screen.getByRole('link', { name: /Télécharger consignes\.pdf/ })).toHaveAttribute('href', '/api/files/f2');
  });

  it('masque le formulaire pour qui consulte sans participer (administration en lecture seule)', async () => {
    setup({ canWrite: false });
    await screen.findByRole('list', { name: 'Messages' });
    expect(screen.queryByLabelText('Votre message')).not.toBeInTheDocument();
    expect(screen.getByText(/Vous consultez cette demande/)).toBeVisible();
  });

  it('refuse un message vide', async () => {
    const calls = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Envoyer le message' }));
    expect(await screen.findByText('Écrivez un message, enregistrez un vocal ou joignez un fichier.')).toBeVisible();
    expect(posts(calls)).toHaveLength(0);
  });

  it('envoie un message texte avec un clientId, puis vide le formulaire et recharge le fil', async () => {
    const calls = setup();
    await userEvent.type(await screen.findByLabelText('Votre message'), 'Merci beaucoup');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0].body).toEqual({ clientId: expect.stringMatching(/^[0-9a-f-]{36}$/), text: 'Merci beaucoup' });
    await waitFor(() => expect(screen.getByLabelText('Votre message')).toHaveValue(''));
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'GET' && c.url.startsWith('/api/requests/r1/messages')).length).toBeGreaterThan(1),
    );
  });

  it('joint un PDF et l’envoie avec le message', async () => {
    const calls = setup();
    const pdf = new File(['%PDF-1.4'], 'consignes.pdf', { type: 'application/pdf' });
    await userEvent.upload(await screen.findByLabelText('Joindre un PDF'), pdf);
    expect(await screen.findByText('consignes.pdf')).toBeVisible();
    const upload = calls.find((c) => c.url === '/api/files')!;
    expect((upload.body as FormData).get('kind')).toBe('DOCUMENT');
    expect((upload.body as FormData).get('requestId')).toBe('r1');

    await userEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));
    await waitFor(() => expect(posts(calls)[0]?.body).toMatchObject({ attachmentFileIds: ['doc-1'] }));
  });

  it('affiche le refus d’un fichier par le serveur', async () => {
    setup({}, (call) =>
      call.url === '/api/files'
        ? json(413, { error: { code: 'FILE_TOO_LARGE', message: 'Le fichier est trop volumineux.' } })
        : undefined,
    );
    await userEvent.upload(
      await screen.findByLabelText('Joindre un PDF'),
      new File(['%PDF'], 'gros.pdf', { type: 'application/pdf' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('trop volumineux');
  });

  it('en cas de coupure réseau, conserve le message dans la boîte d’envoi', async () => {
    setup({}, (call) =>
      call.method === 'POST' && call.url === '/api/requests/r1/messages' ? Promise.reject(new TypeError('Failed to fetch')) : undefined,
    );
    await userEvent.type(await screen.findByLabelText('Votre message'), 'Message hors ligne');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/n’a pas pu être envoyé/);
    expect(alert).toHaveTextContent(/boîte d’envoi/);
    await waitFor(() => expect(store.size).toBe(1));
    const [entry] = [...store.values()] as Array<{ type: string; requestTitle: string; payload: { text: string; requestId: string } }>;
    expect(entry).toMatchObject({ type: 'message', requestTitle: 'Photocopies', payload: { text: 'Message hors ligne', requestId: 'r1' } });
  });
});
