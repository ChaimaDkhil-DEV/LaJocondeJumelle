import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateRequestPage } from '../../src/features/requests/CreateRequestPage';
import { installFakeMedia } from '../mocks/media-recorder';

/** T022 (spec 009, US1) — panneau « Propositions automatiques » du formulaire « Nouvelle demande ». */

vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  values: async () => [],
}));

const CATEGORIES = [
  { id: 'cat-a', name: 'Photocopies', circuit: 'A_DIRECT', photoRequired: false },
  { id: 'cat-b', name: 'Intervention technique', circuit: 'B_ADMIN_VALIDATION', photoRequired: false },
];
const RECIPIENTS = [{ id: 'repro', displayName: 'Reprographie', jobTitle: 'Reprographie' }];
const SETTINGS = { voiceMaxSeconds: 180, attachmentMaxBytes: 1, attachmentMaxPerMessage: 5, draftsEnabled: true, assistSuggestions: true, assistTranscription: false };

const RESULT = {
  suggestion: {
    title: 'Photocopieuse du 1er en panne',
    categoryId: 'cat-b',
    priority: 'HIGH',
    reason: 'D’après la consigne « Pannes de reprographie ».',
    missing: ['Numéro de la salle'],
  },
  sources: [{ id: 'g1', title: 'Pannes de reprographie', excerpt: 'Une photocopieuse en panne bloque les cours.' }],
  noGuideline: false,
  token: 'jeton-1',
};

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Calls = Array<{ url: string; method: string; body: unknown }>;
type Suggest = (body: { text: string }) => Response | Promise<Response>;
interface Options {
  settings?: Partial<typeof SETTINGS>;
  onTranscribe?: () => Response | Promise<Response>;
}

function setup(onSuggest: Suggest = () => json(200, RESULT), options: Options = {}): Calls {
  const calls: Calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      calls.push({ url, method, body });
      if (url === '/api/settings/client') return json(200, { ...SETTINGS, ...options.settings });
      if (url === '/api/assist/transcriptions' && method === 'POST')
        return options.onTranscribe ? options.onTranscribe() : json(200, { text: 'Transcription du vocal.' });
      if (url === '/api/categories') return json(200, CATEGORIES);
      if (url === '/api/categories/cat-a/recipients') return json(200, RECIPIENTS);
      if (url === '/api/categories/cat-b/recipients') return json(200, []);
      if (url === '/api/assist/suggestions' && method === 'POST') return onSuggest(body as { text: string });
      if (url === '/api/requests' && method === 'POST') return json(201, { id: 'r1' });
      return json(404, { error: { code: 'NOT_FOUND', message: 'Introuvable' } });
    }),
  );
  const router = createMemoryRouter(
    [
      { path: '/demandes/nouvelle', element: <CreateRequestPage /> },
      { path: '/demandes/:id', element: <p>Détail de la demande</p> },
    ],
    { initialEntries: ['/demandes/nouvelle'] },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return calls;
}

const proposeButton = () => screen.getByRole('button', { name: 'Proposer une catégorie et une priorité' });

async function describeNeed(text = 'La photocopieuse du premier étage est en panne.'): Promise<void> {
  await screen.findByRole('heading', { name: 'Nouvelle demande' });
  await userEvent.type(screen.getByLabelText('Description (facultative)'), text);
}

describe('Propositions automatiques', () => {
  beforeEach(() => installFakeMedia());
  afterEach(() => vi.unstubAllGlobals());

  it('désactive le bouton tant qu’il n’y a ni description ni vocal', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    expect(await screen.findByRole('button', { name: 'Proposer une catégorie et une priorité' })).toBeDisabled();
    expect(screen.getByText('Écrivez une description ou enregistrez un vocal.')).toBeVisible();
  });

  it('annonce le chargement puis affiche les propositions sans modifier le formulaire', async () => {
    let resolve!: (r: Response) => void;
    const calls = setup(() => new Promise<Response>((r) => (resolve = r)));
    await describeNeed();
    await userEvent.click(proposeButton());
    expect(await screen.findByText('Recherche de propositions…')).toBeInTheDocument();
    expect(calls.find((c) => c.url === '/api/assist/suggestions')?.body).toEqual({ text: 'La photocopieuse du premier étage est en panne.' });
    resolve(json(200, RESULT));

    const panel = await screen.findByRole('region', { name: 'Propositions automatiques' });
    expect(await within(panel).findByText('Photocopieuse du 1er en panne')).toBeVisible();
    expect(within(panel).getByText('Intervention technique')).toBeVisible();
    expect(within(panel).getByText('Haute')).toBeVisible();
    expect(within(panel).getByText('D’après la consigne « Pannes de reprographie ».')).toBeVisible();
    expect(within(panel).getByText('Numéro de la salle')).toBeVisible();
    expect(within(panel).getByText('Pannes de reprographie')).toBeVisible();
    expect(within(panel).getByText('Une photocopieuse en panne bloque les cours.')).toBeVisible();

    // Aucun champ n'est rempli sans clic.
    expect(screen.getByLabelText('Titre')).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'Haute' })).not.toBeChecked();
  });

  it('« Appliquer » ne remplit que le champ visé ; « Tout appliquer » remplit les trois', async () => {
    setup();
    await describeNeed();
    await userEvent.click(proposeButton());
    await userEvent.click(await screen.findByRole('button', { name: 'Appliquer le titre proposé' }));
    expect(screen.getByLabelText('Titre')).toHaveValue('Photocopieuse du 1er en panne');
    expect(screen.getByRole('combobox', { name: 'Catégorie' })).not.toHaveTextContent('Intervention technique');
    expect(screen.getByRole('radio', { name: 'Haute' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Appliquer la priorité proposée' }));
    expect(screen.getByRole('radio', { name: 'Haute' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Catégorie' })).not.toHaveTextContent('Intervention technique');

    await userEvent.clear(screen.getByLabelText('Titre'));
    await userEvent.click(screen.getByRole('button', { name: 'Tout appliquer' }));
    expect(screen.getByLabelText('Titre')).toHaveValue('Photocopieuse du 1er en panne');
    expect(screen.getByRole('combobox', { name: 'Catégorie' })).toHaveTextContent('Intervention technique');
    expect(screen.getByRole('radio', { name: 'Haute' })).toBeChecked();
  });

  it('liste les demandes similaires, ouvertes dans un nouvel onglet, sans toucher au formulaire (010, T007)', async () => {
    setup(() =>
      json(200, {
        ...RESULT,
        similar: [
          { id: 'r42', reference: 'D-2026-000042', title: 'Photocopieuse du 1er en panne', categoryName: 'Photocopies', priority: 'HIGH', status: 'IN_PROGRESS' },
        ],
      }),
    );
    await describeNeed();
    await userEvent.click(proposeButton());
    const list = await screen.findByRole('list', { name: 'Demandes similaires' });
    const link = within(list).getByRole('link', { name: /D-2026-000042 · Photocopieuse du 1er en panne/ });
    expect(link).toHaveAttribute('href', '/demandes/r42');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAccessibleName(/nouvel onglet/);
    expect(within(list).getByText(/Photocopies · Haute · En cours/)).toBeVisible();
    expect(screen.getByText('Vérifiez qu’il ne s’agit pas d’un doublon.')).toBeVisible();
    expect(screen.getByLabelText('Titre')).toHaveValue('');
  });

  it('sans demande similaire, la section n’apparaît pas', async () => {
    setup(() => json(200, { ...RESULT, similar: [] }));
    await describeNeed();
    await userEvent.click(proposeButton());
    await screen.findByRole('button', { name: 'Tout appliquer' });
    expect(screen.queryByRole('list', { name: 'Demandes similaires' })).not.toBeInTheDocument();
  });

  it('signale l’absence de consigne correspondante', async () => {
    setup(() => json(200, { ...RESULT, sources: [], noGuideline: true }));
    await describeNeed();
    await userEvent.click(proposeButton());
    expect(await screen.findByText('Aucune consigne ne correspond à cette demande.')).toBeVisible();
  });

  it('signale l’absence de proposition fiable', async () => {
    setup(() => json(200, { suggestion: null, sources: [], noGuideline: true, token: null }));
    await describeNeed();
    await userEvent.click(proposeButton());
    expect(
      await screen.findByText('Aucune proposition fiable n’a pu être faite. Vous pouvez remplir la demande vous-même.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Tout appliquer' })).not.toBeInTheDocument();
  });

  it('ignore la réponse tardive d’une demande de propositions remplacée', async () => {
    const pending: Array<(r: Response) => void> = [];
    setup(() => new Promise<Response>((r) => pending.push(r)));
    await describeNeed();
    await userEvent.click(proposeButton());
    await userEvent.type(screen.getByLabelText('Description (facultative)'), ' Urgent.');
    await userEvent.click(proposeButton());
    await waitFor(() => expect(pending).toHaveLength(2));

    pending[1]!(json(200, { ...RESULT, suggestion: { ...RESULT.suggestion, title: 'Deuxième proposition' }, token: 'jeton-2' }));
    expect(await screen.findByText('Deuxième proposition')).toBeVisible();
    pending[0]!(json(200, RESULT));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Photocopieuse du 1er en panne')).not.toBeInTheDocument();
    expect(screen.getByText('Deuxième proposition')).toBeVisible();
  });

  it('transmet le jeton du dernier résultat à l’envoi de la demande', async () => {
    const calls = setup();
    await describeNeed();
    await userEvent.click(proposeButton());
    await userEvent.click(await screen.findByRole('button', { name: 'Tout appliquer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect(await screen.findByText('Détail de la demande')).toBeVisible();
    expect(calls.find((c) => c.url === '/api/requests' && c.method === 'POST')?.body).toMatchObject({
      title: 'Photocopieuse du 1er en panne',
      categoryId: 'cat-b',
      priority: 'HIGH',
      assistToken: 'jeton-1',
    });
  });
});

describe('Propositions automatiques : disponibilité, erreurs et transcription (T035)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    installFakeMedia();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function recordVoice(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole('button', { name: 'Enregistrer un message vocal' }));
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await user.click(await screen.findByRole('button', { name: 'Arrêter l’enregistrement' }));
    expect(await screen.findByRole('button', { name: 'Supprimer le message vocal' })).toBeVisible();
  }

  it('assistance désactivée : une mention, aucun bouton', async () => {
    setup(undefined, { settings: { assistSuggestions: false } });
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    expect(await screen.findByText('Les propositions automatiques ne sont pas disponibles.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Proposer une catégorie et une priorité' })).not.toBeInTheDocument();
  });

  it('hors ligne : une mention, aucun bouton', async () => {
    vi.stubGlobal('navigator', Object.create(navigator, { onLine: { value: false, configurable: true } }));
    setup();
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    expect(await screen.findByText('Les propositions automatiques demandent une connexion.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Proposer une catégorie et une priorité' })).not.toBeInTheDocument();
  });

  it.each([
    ['ASSIST_UNAVAILABLE', 503, 'Les propositions ne sont pas disponibles pour le moment. Vous pouvez remplir la demande vous-même.'],
    ['ASSIST_RATE_LIMITED', 429, 'Vous avez demandé beaucoup de propositions. Patientez quelques minutes avant de réessayer.'],
  ])('erreur %s : message du serveur, formulaire intact', async (code, status, message) => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup(() => json(status, { error: { code, message } }));
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await user.type(screen.getByLabelText('Titre'), 'Mon titre');
    await user.type(screen.getByLabelText('Description (facultative)'), 'La photocopieuse est en panne.');
    await user.click(screen.getByRole('button', { name: 'Proposer une catégorie et une priorité' }));
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.getByLabelText('Titre')).toHaveValue('Mon titre');
    expect(screen.getByLabelText('Description (facultative)')).toHaveValue('La photocopieuse est en panne.');
  });

  it('vocal : affiche la transcription à vérifier, modifiable, et redemande avec le texte corrigé', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = setup(undefined, { settings: { assistTranscription: true } });
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    expect(await screen.findByRole('button', { name: 'Proposer une catégorie et une priorité' })).toBeDisabled();
    await recordVoice(user);

    await user.click(screen.getByRole('button', { name: 'Proposer une catégorie et une priorité' }));
    const transcript = await screen.findByLabelText('Transcription (à vérifier)');
    expect(transcript).toHaveValue('Transcription du vocal.');
    await waitFor(() =>
      expect(calls.filter((c) => c.url === '/api/assist/suggestions').map((c) => c.body)).toEqual([{ text: 'Transcription du vocal.' }]),
    );
    expect(calls.find((c) => c.url === '/api/assist/transcriptions')?.body).toBeInstanceOf(FormData);

    await user.clear(transcript);
    await user.type(transcript, 'Texte corrigé.');
    await user.click(screen.getByRole('button', { name: 'Proposer une catégorie et une priorité' }));
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/assist/suggestions')).toHaveLength(2));
    expect(calls.filter((c) => c.url === '/api/assist/suggestions')[1]!.body).toEqual({ text: 'Texte corrigé.' });
    // Une seule transcription : la version corrigée est réutilisée.
    expect(calls.filter((c) => c.url === '/api/assist/transcriptions')).toHaveLength(1);
  });

  it('un nouvel enregistrement remplace la transcription précédente (010, T016)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let n = 0;
    const calls = setup(undefined, {
      settings: { assistTranscription: true },
      onTranscribe: () => json(200, { text: `Transcription ${++n}.` }),
    });
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await recordVoice(user);
    await user.click(screen.getByRole('button', { name: 'Proposer une catégorie et une priorité' }));
    expect(await screen.findByLabelText('Transcription (à vérifier)')).toHaveValue('Transcription 1.');

    // Refaire le vocal : l'ancienne transcription n'est plus affichée ni utilisée.
    await user.click(screen.getByRole('button', { name: 'Refaire l’enregistrement' }));
    expect(screen.queryByLabelText('Transcription (à vérifier)')).not.toBeInTheDocument();
    await recordVoice(user);
    expect(screen.queryByLabelText('Transcription (à vérifier)')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Proposer une catégorie et une priorité' }));
    expect(await screen.findByLabelText('Transcription (à vérifier)')).toHaveValue('Transcription 2.');
    expect(calls.filter((c) => c.url === '/api/assist/transcriptions')).toHaveLength(2);
    expect(calls.filter((c) => c.url === '/api/assist/suggestions').at(-1)!.body).toEqual({ text: 'Transcription 2.' });
  });

  it('« Utiliser comme description » : direct si vide, sinon après confirmation', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup(undefined, { settings: { assistTranscription: true } });
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await recordVoice(user);
    await user.click(screen.getByRole('button', { name: 'Proposer une catégorie et une priorité' }));
    await screen.findByLabelText('Transcription (à vérifier)');

    await user.click(screen.getByRole('button', { name: 'Utiliser comme description' }));
    expect(screen.getByLabelText('Description (facultative)')).toHaveValue('Transcription du vocal.');

    await user.clear(screen.getByLabelText('Description (facultative)'));
    await user.type(screen.getByLabelText('Description (facultative)'), 'Mon texte');
    await user.click(screen.getByRole('button', { name: 'Utiliser comme description' }));
    let dialog = await screen.findByRole('dialog', { name: 'Remplacer la description actuelle ?' });
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Description (facultative)')).toHaveValue('Mon texte');

    await user.click(screen.getByRole('button', { name: 'Utiliser comme description' }));
    dialog = await screen.findByRole('dialog', { name: 'Remplacer la description actuelle ?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remplacer' }));
    await waitFor(() => expect(screen.getByLabelText('Description (facultative)')).toHaveValue('Transcription du vocal.'));
  });

  it('TRANSCRIPTION_EMPTY : message, vocal conservé, aucune proposition demandée', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = setup(undefined, {
      settings: { assistTranscription: true },
      onTranscribe: () => json(422, { error: { code: 'TRANSCRIPTION_EMPTY', message: 'Aucune parole n’a été reconnue dans le message vocal.' } }),
    });
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await recordVoice(user);
    await user.click(screen.getByRole('button', { name: 'Proposer une catégorie et une priorité' }));
    expect(await screen.findByText('Aucune parole n’a été reconnue dans le message vocal.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Supprimer le message vocal' })).toBeVisible();
    expect(calls.some((c) => c.url === '/api/assist/suggestions')).toBe(false);
  });
});
