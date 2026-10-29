import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateRequestPage } from '../../src/features/requests/CreateRequestPage';
import { SUGGESTED_HINT } from '../../src/features/requests/RequestForm';
import { installFakeMedia } from '../mocks/media-recorder';

/**
 * T022 (spec 009, US1) — propositions automatiques du formulaire « Nouvelle demande ».
 * Création vocale assistée : analyse dès la fin de l'enregistrement, champs vides ou déjà proposés
 * préremplis (badge « Suggéré »), une seule phrase sous le vocal, choix de l'utilisateur conservés,
 * seul le destinataire « À confirmer » mis en évidence, vocal jamais perdu.
 */

vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  values: async () => [],
}));

const CATEGORIES = [
  { id: 'cat-a', name: 'Photocopies', circuit: 'A_DIRECT', routingMode: 'DIRECT', photoRequired: false },
  { id: 'cat-b', name: 'Intervention technique', circuit: 'B_ADMIN_VALIDATION', routingMode: 'VIA_ADMIN', photoRequired: false },
  { id: 'cat-p', name: 'Entre collègues', circuit: 'A_DIRECT', routingMode: 'PEER', photoRequired: false },
];
const RECIPIENTS = [{ id: 'repro', displayName: 'Reprographie', jobTitle: 'Reprographie', availability: 'AVAILABLE' }];
const PEERS = [
  { id: 'martin', displayName: 'Paul Martin', jobTitle: null, availability: 'AVAILABLE' },
  { id: 'durand', displayName: 'Léa Durand', jobTitle: null, availability: 'AVAILABLE' },
];
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
const PEER_RESULT = {
  suggestion: {
    title: 'Copies du contrôle pour Paul Martin',
    categoryId: 'cat-p',
    priority: 'MEDIUM',
    recipientId: 'martin',
    recipientName: 'Paul Martin',
    recipientReason: '« Paul Martin » est cité et fait partie des destinataires autorisés.',
    missing: [],
  },
  sources: [],
  noGuideline: true,
  token: 'jeton-p',
};

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Calls = Array<{ url: string; method: string; body: unknown }>;
type SuggestBody = { text: string; categoryId?: string };
type Suggest = (body: SuggestBody) => Response | Promise<Response>;
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
      if (url === '/api/categories/cat-p/recipients') return json(200, PEERS);
      if (url === '/api/assist/suggestions' && method === 'POST') return onSuggest(body as SuggestBody);
      if (url === '/api/files' && method === 'POST') return json(201, { id: 'f-voice', kind: 'VOICE', mimeType: 'audio/mp4', sizeBytes: 10 });
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
/** Analyse terminée : le bouton de relance remplace celui de la première analyse. */
const analysisDone = () => screen.findByRole('button', { name: 'Relancer l’analyse' });
/** Texte affiché d'une liste déroulante MUI (vide : espace sans chasse). */
const shown = (element: HTMLElement) => (element.textContent ?? '').replace(/\u200b/g, '').trim();
const suggestionCalls = (calls: Calls) => calls.filter((c) => c.url === '/api/assist/suggestions');
/** Destinataire à confirmer : texte court dans le champ lui-même. */
const RECIPIENT_TO_CONFIRM = 'À confirmer';

/** Description repliée par défaut : « + Ajouter une description (facultatif) » la déplie. */
async function openDescription(user: { click: (element: Element) => Promise<void> } = userEvent): Promise<HTMLElement> {
  const toggle = await screen.findByRole('button', { name: 'Ajouter une description (facultatif)' });
  if (toggle.getAttribute('aria-expanded') !== 'true') await user.click(toggle);
  return screen.getByLabelText('Description (facultative)');
}

async function describeNeed(text = 'La photocopieuse du premier étage est en panne.'): Promise<void> {
  await screen.findByRole('heading', { name: 'Nouvelle demande' });
  await userEvent.type(await openDescription(), text);
}

async function chooseCategory(name: string, user: { click: (element: Element) => Promise<void> } = userEvent): Promise<void> {
  await user.click(screen.getByRole('combobox', { name: 'Catégorie' }));
  await user.click(await screen.findByRole('option', { name }));
}

describe('Propositions automatiques', () => {
  beforeEach(() => installFakeMedia());
  afterEach(() => vi.unstubAllGlobals());

  it('aucune analyse proposée tant qu’il n’y a ni description ni vocal', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    expect(screen.queryByRole('button', { name: 'Proposer une catégorie et une priorité' })).not.toBeInTheDocument();
    await describeNeed();
    expect(proposeButton()).toBeEnabled();
  });

  it('annonce le chargement, puis préremplit les champs vides, badge « Suggéré » et une seule phrase', async () => {
    let resolve!: (r: Response) => void;
    const calls = setup(() => new Promise<Response>((r) => (resolve = r)));
    await describeNeed();
    await userEvent.click(proposeButton());
    expect(await screen.findByText('Recherche de propositions…')).toBeInTheDocument();
    expect(suggestionCalls(calls)[0]?.body).toEqual({ text: 'La photocopieuse du premier étage est en panne.' });
    resolve(json(200, RESULT));

    await analysisDone();
    expect(screen.getByLabelText('Titre')).toHaveValue('Photocopieuse du 1er en panne');
    expect(screen.getByRole('combobox', { name: 'Catégorie' })).toHaveTextContent('Intervention technique');
    expect(screen.getByRole('radio', { name: 'Haute' })).toBeChecked();
    expect(screen.getAllByText('Suggéré')).toHaveLength(3);
    expect(screen.getAllByText(SUGGESTED_HINT)).toHaveLength(1);
    // Aucun texte explicatif affiché : la justification reste repliée derrière « Voir pourquoi ».
    expect(screen.getByText('D’après la consigne « Pannes de reprographie ».')).not.toBeVisible();
    expect(screen.queryByText(/Aucune consigne ne correspond/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voir pourquoi' }));
    expect(screen.getByRole('button', { name: 'Voir pourquoi' })).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(screen.getByText('D’après la consigne « Pannes de reprographie ».')).toBeVisible());
    expect(screen.queryByRole('region', { name: 'Propositions automatiques' })).not.toBeInTheDocument();
    // Circuit B : la personne est choisie par l'administration, rien à confirmer.
    expect(screen.getByText(/d’abord validée par un admin/)).toBeVisible();
    expect(screen.queryByText(RECIPIENT_TO_CONFIRM)).not.toBeInTheDocument();
  });

  it('conserve les choix de l’utilisateur : seuls les champs vides sont préremplis', async () => {
    setup();
    await describeNeed();
    await userEvent.type(screen.getByLabelText('Titre'), 'Mon titre');
    await userEvent.click(screen.getByRole('radio', { name: 'Normale' }));
    await userEvent.click(proposeButton());
    await analysisDone();

    expect(screen.getByLabelText('Titre')).toHaveValue('Mon titre');
    expect(screen.getByRole('radio', { name: 'Normale' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Catégorie' })).toHaveTextContent('Intervention technique');
    // Badge seulement sur la catégorie, remplie par la proposition.
    expect(screen.getAllByText('Suggéré')).toHaveLength(1);
  });

  it('une nouvelle analyse ne remplace jamais une valeur modifiée à la main ; le badge disparaît du champ modifié', async () => {
    const calls = setup();
    await describeNeed();
    await userEvent.click(proposeButton());
    await analysisDone();
    await userEvent.clear(screen.getByLabelText('Titre'));
    await userEvent.type(screen.getByLabelText('Titre'), 'Titre corrigé');
    await userEvent.click(screen.getByRole('radio', { name: 'Urgente' }));
    expect(screen.getAllByText('Suggéré')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Relancer l’analyse' }));
    await waitFor(() => expect(suggestionCalls(calls)).toHaveLength(2));
    await analysisDone();
    expect(screen.getByLabelText('Titre')).toHaveValue('Titre corrigé');
    expect(screen.getByRole('radio', { name: 'Urgente' })).toBeChecked();
    expect(screen.getAllByText('Suggéré')).toHaveLength(1);
  });

  it('propose un destinataire autorisé, modifiable, et l’envoie avec la demande', async () => {
    const calls = setup(() => json(200, PEER_RESULT));
    await describeNeed('Copies du contrôle pour Paul Martin, merci.');
    await userEvent.click(proposeButton());
    await analysisDone();
    expect(screen.getByRole('combobox', { name: 'Catégorie' })).toHaveTextContent('Entre collègues');
    expect(await screen.findByRole('combobox', { name: 'Enseignant destinataire' })).toHaveTextContent('Paul Martin');
    expect(screen.getAllByText('Suggéré')).toHaveLength(4);
    expect(screen.queryByText(RECIPIENT_TO_CONFIRM)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Enseignant destinataire' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Léa Durand' }));
    expect(screen.getByRole('combobox', { name: 'Enseignant destinataire' })).toHaveTextContent('Léa Durand');

    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect(await screen.findByText('Détail de la demande')).toBeVisible();
    expect(calls.find((c) => c.url === '/api/requests' && c.method === 'POST')?.body).toMatchObject({
      categoryId: 'cat-p',
      recipientId: 'durand',
      priority: 'MEDIUM',
      assistToken: 'jeton-p',
    });
  });

  it('un destinataire hors de la liste autorisée n’est ni affiché ni envoyé : « À confirmer » mis en évidence', async () => {
    const calls = setup(() => json(200, { ...PEER_RESULT, suggestion: { ...PEER_RESULT.suggestion, recipientId: 'intrus', recipientName: 'Intrus' } }));
    await describeNeed('Copies du contrôle pour Intrus, merci.');
    await userEvent.click(proposeButton());
    await analysisDone();
    const recipient = await screen.findByRole('combobox', { name: 'Enseignant destinataire' });
    await waitFor(() => expect(shown(recipient)).toBe(RECIPIENT_TO_CONFIRM));

    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect(await screen.findByText('Choisissez un destinataire.')).toBeVisible();
    expect(calls.some((c) => c.url === '/api/requests')).toBe(false);

    // Une fois choisi, plus rien à confirmer.
    await userEvent.click(recipient);
    await userEvent.click(await screen.findByRole('option', { name: 'Paul Martin' }));
    expect(shown(recipient)).toBe('Paul Martin');
  });

  it('catégorie changée à la main : nouvelle analyse pour cette catégorie, sans toucher au titre modifié', async () => {
    const calls = setup((body) => json(200, body.categoryId === 'cat-p' ? PEER_RESULT : RESULT));
    await describeNeed('Copies du contrôle pour Paul Martin, merci.');
    await userEvent.click(proposeButton());
    await analysisDone();
    await userEvent.clear(screen.getByLabelText('Titre'));
    await userEvent.type(screen.getByLabelText('Titre'), 'Mes copies');

    await chooseCategory('Entre collègues');
    await waitFor(() => expect(suggestionCalls(calls)).toHaveLength(2));
    expect(suggestionCalls(calls)[1]!.body).toEqual({ text: 'Copies du contrôle pour Paul Martin, merci.', categoryId: 'cat-p' });
    expect(await screen.findByRole('combobox', { name: 'Enseignant destinataire' })).toHaveTextContent('Paul Martin');
    expect(screen.getByRole('combobox', { name: 'Catégorie' })).toHaveTextContent('Entre collègues');
    expect(screen.getByLabelText('Titre')).toHaveValue('Mes copies');
  });

  it('demandes similaires repliées derrière une pastille, ouvertes dans un nouvel onglet (010, T007)', async () => {
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
    const toggle = await screen.findByRole('button', { name: '1 demande similaire' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('list', { name: 'Demandes similaires' });
    const link = screen.getByRole('link', { name: /D-2026-000042 · Photocopieuse du 1er en panne/ });
    expect(list).toContainElement(link);
    expect(link).toHaveAttribute('href', '/demandes/r42');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAccessibleName(/nouvel onglet/);
    expect(list).toHaveTextContent('En cours');
    expect(screen.getByLabelText('Description (facultative)')).toHaveValue('La photocopieuse du premier étage est en panne.');
  });

  it('sans demande similaire, aucune pastille', async () => {
    setup(() => json(200, { ...RESULT, similar: [] }));
    await describeNeed();
    await userEvent.click(proposeButton());
    await analysisDone();
    expect(screen.queryByRole('button', { name: /similaire/ })).not.toBeInTheDocument();
  });

  it('aucune proposition fiable : une phrase, aucun champ prérempli', async () => {
    setup(() => json(200, { suggestion: null, sources: [], noGuideline: true, token: null }));
    await describeNeed();
    await userEvent.click(proposeButton());
    expect(await screen.findByText('Aucune suggestion fiable : remplissez les champs vous-même.')).toBeVisible();
    expect(screen.queryByText('Suggéré')).not.toBeInTheDocument();
  });

  it('catégorie ou priorité non proposées : champs laissés vides, sans mise en évidence', async () => {
    setup(() => json(200, { ...RESULT, suggestion: { title: 'Besoin flou', missing: ['Plusieurs catégories sont possibles : choisissez-la.'] } }));
    await describeNeed('Il faudrait voir ça.');
    await userEvent.click(proposeButton());
    await analysisDone();
    expect(shown(screen.getByRole('combobox', { name: 'Catégorie' }))).toBe('');
    expect(screen.getByRole('radio', { name: 'Normale' })).not.toBeChecked();
    expect(screen.getByLabelText('Titre')).toHaveValue('Besoin flou');
    expect(screen.queryByText(/À confirmer/)).not.toBeInTheDocument();
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
    await waitFor(() => expect(screen.getByLabelText('Titre')).toHaveValue('Deuxième proposition'));
    pending[0]!(json(200, RESULT));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByLabelText('Titre')).toHaveValue('Deuxième proposition');
  });

  it('transmet le jeton du dernier résultat à l’envoi de la demande', async () => {
    const calls = setup();
    await describeNeed();
    await userEvent.click(proposeButton());
    await analysisDone();
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

describe('Propositions automatiques : vocal, disponibilité et erreurs (T035)', () => {
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

  const voiceKept = /Votre message vocal est conservé/;

  it('assistance désactivée : aucun texte, aucun bouton', async () => {
    setup(undefined, { settings: { assistSuggestions: false } });
    await describeNeed();
    expect(screen.queryByRole('button', { name: 'Proposer une catégorie et une priorité' })).not.toBeInTheDocument();
    expect(screen.queryByText(/propositions/i)).not.toBeInTheDocument();
  });

  it('hors ligne : aucun texte, aucun bouton', async () => {
    vi.stubGlobal('navigator', Object.create(navigator, { onLine: { value: false, configurable: true } }));
    setup();
    await describeNeed();
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
    await user.type(await openDescription(user), 'La photocopieuse est en panne.');
    await user.click(screen.getByRole('button', { name: 'Proposer une catégorie et une priorité' }));
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.getByLabelText('Titre')).toHaveValue('Mon titre');
    expect(screen.getByLabelText('Description (facultative)')).toHaveValue('La photocopieuse est en panne.');
  });

  it('la fin de l’enregistrement lance la transcription puis l’analyse, sans clic', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let transcribed!: (r: Response) => void;
    const calls = setup(undefined, {
      settings: { assistTranscription: true },
      onTranscribe: () => new Promise<Response>((r) => (transcribed = r)),
    });
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await recordVoice(user);

    expect(await screen.findByText('Transcription du message vocal…')).toBeInTheDocument();
    expect(calls.find((c) => c.url === '/api/assist/transcriptions')?.body).toBeInstanceOf(FormData);
    transcribed(json(200, { text: 'La photocopieuse du premier étage est en panne.' }));

    expect(await screen.findByText(SUGGESTED_HINT)).toBeVisible();
    expect(suggestionCalls(calls).map((c) => c.body)).toEqual([{ text: 'La photocopieuse du premier étage est en panne.' }]);
    expect(screen.getByLabelText('Titre')).toHaveValue('Photocopieuse du 1er en panne');
    expect(screen.getByRole('radio', { name: 'Haute' })).toBeChecked();
    // La transcription n'est pas affichée ; le vocal reste dans le formulaire, avec son lecteur.
    expect(screen.queryByLabelText('Transcription (à vérifier)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lire le message vocal' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Supprimer le message vocal' })).toBeVisible();
  });

  it('« Relancer l’analyse » réutilise la transcription du vocal, sans nouvelle transcription', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = setup(undefined, { settings: { assistTranscription: true } });
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    expect(screen.queryByRole('button', { name: 'Proposer une catégorie et une priorité' })).not.toBeInTheDocument();
    await recordVoice(user);
    await waitFor(() => expect(suggestionCalls(calls).map((c) => c.body)).toEqual([{ text: 'Transcription du vocal.' }]));

    await user.click(await analysisDone());
    await waitFor(() => expect(suggestionCalls(calls)).toHaveLength(2));
    expect(suggestionCalls(calls)[1]!.body).toEqual({ text: 'Transcription du vocal.' });
    expect(calls.filter((c) => c.url === '/api/assist/transcriptions')).toHaveLength(1);
  });

  it('un nouvel enregistrement efface les propositions de l’ancien vocal, garde les choix manuels et relance l’analyse (010, T016)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let n = 0;
    const calls = setup((body) => json(200, { ...RESULT, suggestion: { ...RESULT.suggestion, title: body.text }, token: `jeton-${n}` }), {
      settings: { assistTranscription: true },
      onTranscribe: () => json(200, { text: `Transcription ${++n}.` }),
    });
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await recordVoice(user);
    await waitFor(() => expect(screen.getByLabelText('Titre')).toHaveValue('Transcription 1.'));
    await user.click(screen.getByRole('radio', { name: 'Normale' }));

    // Refaire le vocal : les propositions de l'ancien sont retirées, le choix manuel reste.
    await user.click(screen.getByRole('button', { name: 'Refaire l’enregistrement' }));
    expect(screen.queryByText(SUGGESTED_HINT)).not.toBeInTheDocument();
    expect(screen.queryByText('Suggéré')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Titre')).toHaveValue('');
    expect(shown(screen.getByRole('combobox', { name: 'Catégorie' }))).toBe('');
    expect(screen.getByRole('radio', { name: 'Normale' })).toBeChecked();

    await recordVoice(user);
    await waitFor(() => expect(screen.getByLabelText('Titre')).toHaveValue('Transcription 2.'));
    expect(screen.getByRole('radio', { name: 'Normale' })).toBeChecked();
    expect(calls.filter((c) => c.url === '/api/assist/transcriptions')).toHaveLength(2);
    expect(suggestionCalls(calls).at(-1)!.body).toEqual({ text: 'Transcription 2.' });

    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect(await screen.findByText('Détail de la demande')).toBeVisible();
    expect(calls.find((c) => c.url === '/api/requests')?.body).toMatchObject({ assistToken: 'jeton-2', priority: 'NORMAL' });
  });

  it('la réponse tardive de l’ancien vocal est ignorée', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const pending: Array<(r: Response) => void> = [];
    setup((body) => json(200, { ...RESULT, suggestion: { ...RESULT.suggestion, title: body.text } }), {
      settings: { assistTranscription: true },
      onTranscribe: () => new Promise<Response>((r) => pending.push(r)),
    });
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await recordVoice(user);
    await waitFor(() => expect(pending).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Refaire l’enregistrement' }));
    await recordVoice(user);
    await waitFor(() => expect(pending).toHaveLength(2));

    pending[0]!(json(200, { text: 'Ancien vocal.' }));
    pending[1]!(json(200, { text: 'Nouveau vocal.' }));
    await waitFor(() => expect(screen.getByLabelText('Titre')).toHaveValue('Nouveau vocal.'));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByLabelText('Titre')).toHaveValue('Nouveau vocal.');
  });

  it('TRANSCRIPTION_EMPTY : message, vocal conservé, aucune proposition demandée', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = setup(undefined, {
      settings: { assistTranscription: true },
      onTranscribe: () => json(422, { error: { code: 'TRANSCRIPTION_EMPTY', message: 'Aucune parole n’a été reconnue dans le message vocal.' } }),
    });
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await recordVoice(user);
    expect(await screen.findByText(/^Aucune parole n’a été reconnue dans le message vocal\./)).toHaveTextContent(voiceKept);
    expect(screen.getByRole('button', { name: 'Supprimer le message vocal' })).toBeVisible();
    expect(suggestionCalls(calls)).toHaveLength(0);
  });

  it('transcription indisponible : vocal conservé, champs saisis à la main, envoi avec le vocal ; relance sans réenregistrer', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let attempts = 0;
    // Catégorie imposée : le serveur la reprend telle quelle.
    const calls = setup((body) => json(200, { ...RESULT, suggestion: { ...RESULT.suggestion, categoryId: body.categoryId ?? 'cat-b' } }), {
      settings: { assistTranscription: true },
      onTranscribe: () =>
        ++attempts === 1
          ? json(503, { error: { code: 'ASSIST_UNAVAILABLE', message: 'Les propositions ne sont pas disponibles pour le moment.' } })
          : json(200, { text: 'Transcription du vocal.' }),
    });
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await recordVoice(user);
    expect(await screen.findByText(/^Les propositions ne sont pas disponibles pour le moment\./)).toHaveTextContent(voiceKept);
    expect(screen.getByRole('button', { name: 'Lire le message vocal' })).toBeVisible();

    // Relance : même vocal, aucun nouvel enregistrement.
    await user.click(screen.getByRole('button', { name: 'Relancer l’analyse' }));
    expect(await screen.findByText(SUGGESTED_HINT)).toBeVisible();
    expect(attempts).toBe(2);
    expect(screen.queryByRole('button', { name: 'Enregistrer un message vocal' })).not.toBeInTheDocument();

    // Saisie manuelle par-dessus les propositions, puis envoi : le vocal part d'abord.
    await chooseCategory('Photocopies', user);
    await user.clear(screen.getByLabelText('Titre'));
    await user.type(screen.getByLabelText('Titre'), 'Photocopieuse en panne');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect(await screen.findByText('Détail de la demande')).toBeVisible();
    const upload = calls.find((c) => c.url === '/api/files' && c.method === 'POST');
    expect(upload?.body).toBeInstanceOf(FormData);
    expect((upload!.body as FormData).get('kind')).toBe('VOICE');
    expect(calls.find((c) => c.url === '/api/requests')?.body).toMatchObject({
      title: 'Photocopieuse en panne',
      categoryId: 'cat-a',
      recipientId: 'repro',
      priority: 'HIGH',
      voiceFileId: 'f-voice',
    });
  });
});
