import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConversationSummary } from '../../src/features/parent-communications/api';
import { CommunicationsPage } from '../../src/features/parent-communications/CommunicationsPage';
import { CommunicationsLegacyRedirect } from '../../src/features/parent-communications/LegacyRedirects';
import { json, mockApi, renderRoutes, route, student, type Call } from './helpers';

/**
 * 017 — « Communications » de l'enseignant et de l'administration : écrans à boutons, nouveau message
 * (vocal ou texte), conversation en bulles, « Contacter le parent », clôture, « À valider ».
 */

vi.mock('../../src/features/voice/VoiceRecorder', () => ({
  VoiceRecorder: ({ onChange }: { onChange: (r: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          blob: new Blob(['audio']),
          url: 'blob:vocal',
          mimeType: 'audio/webm',
          durationSeconds: 3,
        })
      }
    >
      Enregistrer le vocal (simulé)
    </button>
  ),
}));

afterEach(() => vi.unstubAllGlobals());

const routes = [
  route('/communications', <CommunicationsPage />),
  route('/communications/nouveau', <CommunicationsLegacyRedirect to="nouveau" />),
  route('/communications/conversations/:id?', <CommunicationsLegacyRedirect to="conversations" />),
  route('/communications/boite/:id?', <CommunicationsLegacyRedirect to="boite" />),
  route('/communications/a-valider/:id?', <CommunicationsLegacyRedirect to="valider" />),
];

const teacherMe = {
  id: 't1',
  username: 'ens',
  displayName: 'Mme Enseignante',
  jobTitle: null,
  role: 'EMPLOYEE',
  permissions: [],
  mustChangePassword: false,
  isTeacher: true,
};
const adminMe = {
  id: 'a1',
  username: 'admin',
  displayName: 'Mme Martin',
  jobTitle: null,
  role: 'ADMIN',
  permissions: ['PARENT_COMMUNICATION_VALIDATE', 'PARENT_COMM_SUBMIT_FOR_APPROVAL'],
  mustChangePassword: false,
};

const message = (overrides: Record<string, unknown> = {}) => ({
  id: 'm1',
  authorKind: 'TEACHER',
  authorLabel: 'Mme Enseignante',
  mine: true,
  status: 'SENT',
  text: 'Lina pleure en classe.',
  voice: null,
  createdAt: '2026-11-11T08:00:00.000Z',
  readAt: null,
  ...overrides,
});

const conversation = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  type: 'INTERNAL',
  status: 'OPEN',
  student,
  lastMessage: {
    at: '2026-11-11T08:00:00.000Z',
    authorKind: 'TEACHER',
    authorLabel: 'Mme Enseignante',
    hasVoice: false,
    excerpt: 'Lina pleure en classe.',
  },
  unread: 0,
  createdAt: '2026-11-11T08:00:00.000Z',
  lastMessageAt: '2026-11-11T08:00:00.000Z',
  messages: [message()],
  canPost: true,
  ...overrides,
});

function api(me: object, extra: (call: Call) => Response | undefined = () => undefined) {
  return mockApi((call) => {
    const custom = extra(call);
    if (custom) return custom;
    if (call.url === '/api/auth/me') return json(200, me);
    if (call.url === '/api/settings/client') return json(200, { voiceMaxSeconds: 120 });
    if (call.url === '/api/communications/teacher/students')
      return json(200, [
        student,
        { id: 's2', firstName: 'Adam', lastName: 'Kefi', class: student.class },
      ]);
    if (call.url === '/api/communications/teacher/conversations')
      return json(200, [conversation()]);
    if (call.url === '/api/admin/communications/send-mode')
      return json(200, { toParents: 'SUBMIT', canValidate: true });
    return undefined;
  });
}

describe('Enseignant', () => {
  const postConversation = (call: Call) =>
    call.url === '/api/communications/teacher/conversations' && call.method === 'POST';

  it('une seule page : liste, « Nouveau message » ouvert d’emblée, focus sur l’élève, rien de l’administration', async () => {
    // Écran large : le formulaire est affiché à côté de la liste et reçoit le focus.
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('min-width'),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      })),
    );
    api(teacherMe);
    renderRoutes(routes, '/communications');
    expect(await screen.findByRole('heading', { name: 'Communications', level: 1 })).toBeVisible();
    expect(screen.getByRole('button', { name: /Nouveau message/ })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Lina Ben Salah/ })).toHaveAttribute(
      'href',
      '/communications?conversation=c1',
    );
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Élève' })).toHaveFocus());
    expect(screen.queryByRole('link', { name: /Boîte de réception/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /À valider/ })).toBeNull();
  });

  it('recherche : filtre la liste par nom d’élève', async () => {
    api(teacherMe);
    renderRoutes(routes, '/communications');
    await screen.findByRole('link', { name: /Lina Ben Salah/ });
    await userEvent
      .setup()
      .type(screen.getByRole('searchbox', { name: /Rechercher un élève/ }), 'zz');
    expect(screen.queryByRole('link', { name: /Lina Ben Salah/ })).toBeNull();
  });

  it('nouveau message : élève récent, vocal seul, Ctrl+Entrée, puis la conversation s’ouvre sur la même page', async () => {
    const calls = api(teacherMe, (call) => {
      if (call.url === '/api/files' && call.method === 'POST')
        return json(201, { id: 'v9', kind: 'VOICE' });
      if (postConversation(call)) return json(201, conversation({ id: 'c9' }));
      if (call.url === '/api/communications/teacher/conversations/c9')
        return json(200, conversation({ id: 'c9' }));
      return undefined;
    });
    const router = renderRoutes(routes, '/communications');
    const user = userEvent.setup();
    const send = await screen.findByRole('button', { name: /^Envoyer/ });
    expect(send).toBeDisabled();
    await user.click(await screen.findByRole('button', { name: 'Lina Ben Salah' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /Votre message/ })).toHaveFocus(),
    );
    expect(send).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Enregistrer le vocal (simulé)' }));
    expect(send).toBeEnabled();
    await user.click(screen.getByRole('textbox', { name: /Votre message/ }));
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(router.state.location.search).toBe('?conversation=c9'));
    expect(router.state.location.pathname).toBe('/communications');
    expect(calls.find(postConversation)?.body).toEqual({
      studentId: 's1',
      text: null,
      voiceFileId: 'v9',
    });
  });

  it('nouveau message : élève cherché à la frappe, texte seul', async () => {
    const calls = api(teacherMe, (call) =>
      postConversation(call) ? json(201, conversation({ id: 'c9' })) : undefined,
    );
    renderRoutes(routes, '/communications');
    const user = userEvent.setup();
    await user.type(await screen.findByRole('combobox', { name: 'Élève' }), 'Ada');
    await user.click(await screen.findByRole('option', { name: /Adam Kefi/ }));
    await user.type(screen.getByRole('textbox', { name: /Votre message/ }), 'Absent ce matin.');
    await user.click(screen.getByRole('button', { name: /^Envoyer/ }));
    await waitFor(() =>
      expect(calls.find(postConversation)?.body).toEqual({
        studentId: 's2',
        text: 'Absent ce matin.',
        voiceFileId: null,
      }),
    );
  });

  it('envoi en échec : le texte est conservé et l’erreur affichée', async () => {
    api(teacherMe, (call) => (postConversation(call) ? json(500, {}) : undefined));
    renderRoutes(routes, '/communications');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Lina Ben Salah' }));
    const field = screen.getByRole('textbox', { name: /Votre message/ });
    await user.type(field, 'Bonjour');
    await user.click(screen.getByRole('button', { name: /^Envoyer/ }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(field).toHaveValue('Bonjour');
  });

  it('anciennes adresses : « nouveau » et « conversations/:id » ramènent à la page unique', async () => {
    api(teacherMe);
    const router = renderRoutes(routes, '/communications/conversations/c1');
    await waitFor(() =>
      expect(router.state.location.search).toBe('?vue=conversations&conversation=c1'),
    );
    expect(router.state.location.pathname).toBe('/communications');
    await router.navigate('/communications/nouveau');
    await waitFor(() => expect(router.state.location.search).toBe('?nouveau'));
    expect(router.state.location.pathname).toBe('/communications');
  });

  it('conversation : réponse de l’administration signée, saisie disponible', async () => {
    api(teacherMe, (call) =>
      call.url === '/api/communications/teacher/conversations/c1'
        ? json(
            200,
            conversation({
              messages: [
                message(),
                message({
                  id: 'm2',
                  authorKind: 'ADMIN',
                  authorLabel: 'Administration (Mme Martin)',
                  mine: false,
                  text: 'Je m’en occupe.',
                }),
              ],
            }),
          )
        : undefined,
    );
    renderRoutes(routes, '/communications?conversation=c1');
    expect(await screen.findByText('Je m’en occupe.')).toBeInTheDocument();
    expect(screen.getAllByText(/Administration \(Mme Martin\)/).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText('Répondre à l’administration…')).toBeInTheDocument();
  });

  it('conversation clôturée : message expliquant la clôture, pas de saisie', async () => {
    api(teacherMe, (call) =>
      call.url === '/api/communications/teacher/conversations/c1'
        ? json(200, conversation({ status: 'CLOSED', canPost: false }))
        : undefined,
    );
    renderRoutes(routes, '/communications?conversation=c1');
    expect(await screen.findByText(/Conversation clôturée/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Répondre à l’administration…')).toBeNull();
  });
});

const pendingItem = (id: string, mine: boolean) => ({
  id,
  status: 'PENDING_ADMIN_VALIDATION',
  author: { id: mine ? 'a1' : 'a2', displayName: mine ? 'Mme Martin' : 'Mme Deux' },
  mine,
  decidable: !mine,
  conversation: {
    id: 'c7',
    type: 'PARENT',
    status: 'OPEN',
    student,
    guardian: { id: 'g1', firstName: 'Sonia', lastName: 'Ben Salah', relationship: 'Mère' },
    teacher: null,
  },
  submittedAt: '2026-11-11T09:00:00.000Z',
  validation: { revision: 2, version: 5, decisionReason: null, decidedAt: null },
  hasVoice: false,
  excerpt: `Message ${id}`,
});
const pendingDetail = (id: string, mine: boolean) => ({
  ...pendingItem(id, mine),
  authorKind: 'ADMIN',
  text: `Message ${id}`,
  voice: null,
  revisions: [],
  events: [],
  deliveries: [],
});

/** Administration : l'API de l'espace (boîte, liste, validation) en plus des réponses communes. */
function adminApi(
  me: object,
  inbox: unknown[],
  extra: (call: Call) => Response | undefined = () => undefined,
) {
  return api(me, (call) => {
    const custom = extra(call);
    if (custom) return custom;
    if (call.url === '/api/admin/communications/inbox') return json(200, inbox);
    if (call.url.startsWith('/api/admin/communications/conversations') && call.method === 'GET') {
      if (/conversations\/[^/?]+$/.test(call.url)) return undefined;
      // Recherche faite par le serveur (paramètre q) sur la vue « Conversations ».
      const q = new URL(call.url, 'http://test').searchParams.get('q')?.toLowerCase();
      const items = q
        ? inbox.filter((c) => JSON.stringify((c as ConversationSummary).student).toLowerCase().includes(q))
        : inbox;
      return json(200, { items, nextCursor: null });
    }
    if (call.url === '/api/admin/communications/to-validate') return json(200, []);
    return undefined;
  });
}

const parentConversation = (overrides: Record<string, unknown> = {}) =>
  conversation({
    id: 'c2',
    type: 'PARENT',
    student: { ...student, id: 's2', firstName: 'Adam', lastName: 'Kefi' },
    guardian: { id: 'g1', firstName: 'Sonia', lastName: 'Kefi', relationship: 'Mère' },
    ...overrides,
  });

describe('Administration — page unique', () => {
  const internal = () =>
    conversation({ unread: 2, teacher: { id: 't1', displayName: 'Mme Enseignante' } });

  it('une seule page : titre, bouton « Nouveau message », onglets avec compteurs réels, sans fil d’Ariane ni carte', async () => {
    adminApi(adminMe, [internal()], (call) =>
      call.url === '/api/admin/communications/to-validate'
        ? json(200, [pendingItem('m5', false), pendingItem('m6', true)])
        : undefined,
    );
    renderRoutes(routes, '/communications');
    expect(await screen.findByRole('heading', { name: 'Communications', level: 1 })).toBeVisible();
    expect(screen.getByRole('button', { name: /Nouveau message/ })).toBeVisible();
    const tabs = within(await screen.findByRole('tablist', { name: 'Vues des communications' }));
    expect(tabs.getByRole('tab', { name: /Boîte de réception/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(tabs.getByRole('tab', { name: /Conversations/ })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    // Compteurs : messages non lus de la boîte ; messages que l'on peut décider dans « À valider ».
    await waitFor(() =>
      expect(tabs.getByRole('tab', { name: /Boîte de réception/ })).toHaveTextContent('2'),
    );
    await waitFor(() =>
      expect(tabs.getByRole('tab', { name: /À valider/ })).toHaveTextContent('1'),
    );
    expect(screen.queryByRole('navigation', { name: 'Fil d’Ariane' })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Retour/ })).toBeNull();
    expect(screen.getByText('Choisissez une conversation')).toBeInTheDocument();
  });

  it('« À valider » masqué sans la permission ; ?vue=valider retombe sur la boîte de réception', async () => {
    adminApi({ ...adminMe, permissions: [] }, [internal()], (call) =>
      call.url === '/api/admin/communications/send-mode'
        ? json(200, { toParents: 'FORBIDDEN', canValidate: false })
        : undefined,
    );
    renderRoutes(routes, '/communications?vue=valider');
    const tabs = within(await screen.findByRole('tablist', { name: 'Vues des communications' }));
    await waitFor(() => expect(tabs.queryByRole('tab', { name: /À valider/ })).toBeNull());
    expect(tabs.getByRole('tab', { name: /Boîte de réception/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('changer d’onglet change ?vue= sans changer de page', async () => {
    adminApi(adminMe, [internal()]);
    const router = renderRoutes(routes, '/communications');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: /Conversations/ }));
    expect(router.state.location.pathname).toBe('/communications');
    expect(router.state.location.search).toBe('?vue=conversations');
    expect(screen.getByRole('tab', { name: /Conversations/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(await screen.findByRole('tab', { name: /À valider/ }));
    expect(router.state.location.search).toBe('?vue=valider');
  });

  it('liste : élève, type · interlocuteur · classe ; le lien ouvre la conversation sur la même page', async () => {
    adminApi(adminMe, [internal()]);
    renderRoutes(routes, '/communications');
    const line = await screen.findByRole('link', { name: /Lina Ben Salah/ });
    expect(line).toHaveTextContent('Interne');
    expect(line).toHaveTextContent('Mme Enseignante');
    expect(line).toHaveTextContent('1ère année Violet');
    expect(line).toHaveTextContent('Lina pleure en classe.');
    expect(line).toHaveAttribute('href', '/communications?vue=boite&conversation=c1');
  });

  it('boutons-filtres : Parents, Enseignants, Non lus, Archivés, Tous (un seul actif)', async () => {
    adminApi(adminMe, [
      internal(),
      parentConversation(),
      conversation({
        id: 'c3',
        type: 'LEGACY_TEACHER_PARENT',
        student: { ...student, id: 's3', firstName: 'Nour', lastName: 'Gharbi' },
      }),
    ]);
    renderRoutes(routes, '/communications?vue=conversations');
    const user = userEvent.setup();
    await screen.findByRole('link', { name: /Adam Kefi/ });
    const filters = within(screen.getByRole('group', { name: 'Filtrer les conversations' }));
    for (const name of ['Tous', 'Non lus', 'Enseignants', 'Parents', 'Archivés'])
      expect(filters.getByRole('button', { name })).toBeVisible();
    expect(filters.getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(filters.getByRole('button', { name: 'Parents' }));
    expect(filters.getByRole('button', { name: 'Parents' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(filters.getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('link', { name: /Adam Kefi/ })).toBeVisible();
    expect(screen.queryByRole('link', { name: /Lina Ben Salah/ })).toBeNull();

    await user.click(filters.getByRole('button', { name: 'Enseignants' }));
    expect(screen.getByRole('link', { name: /Lina Ben Salah/ })).toHaveTextContent('Interne');
    expect(screen.queryByRole('link', { name: /Adam Kefi/ })).toBeNull();

    await user.click(filters.getByRole('button', { name: 'Non lus' }));
    expect(screen.getAllByRole('link', { name: /Lina Ben Salah/ })).toHaveLength(1);
    expect(screen.queryByRole('link', { name: /Nour Gharbi/ })).toBeNull();

    await user.click(filters.getByRole('button', { name: 'Archivés' }));
    expect(screen.getByRole('link', { name: /Nour Gharbi/ })).toBeVisible();
    expect(screen.queryByRole('link', { name: /Adam Kefi/ })).toBeNull();
  });

  it('recherche d’élève dans la liste', async () => {
    adminApi(adminMe, [internal(), parentConversation()]);
    renderRoutes(routes, '/communications?vue=conversations');
    await screen.findByRole('link', { name: /Adam Kefi/ });
    await userEvent
      .setup()
      .type(screen.getByRole('searchbox', { name: /Rechercher un élève/ }), 'Kefi');
    await waitFor(() => expect(screen.queryByRole('link', { name: /Lina Ben Salah/ })).toBeNull());
    expect(screen.getByRole('link', { name: /Adam Kefi/ })).toBeVisible();
  });

  it('conversation ouverte : bulles, actions de 44 px, rien que l’API ne permette pas ; « Clôturer » appelle l’API', async () => {
    const calls = adminApi(adminMe, [internal()], (call) => {
      if (call.url === '/api/admin/communications/conversations/c1' && call.method === 'GET')
        return json(200, conversation({ responsibleAdmin: null, linkedInternalId: null }));
      if (call.url === '/api/admin/communications/conversations/c1/close')
        return json(200, conversation({ status: 'CLOSED', canPost: false }));
      return undefined;
    });
    renderRoutes(routes, '/communications?vue=boite&conversation=c1');
    expect(await screen.findByText('Lina pleure en classe.', { selector: 'p' })).toBeVisible();
    const close = await screen.findByRole('button', { name: /Clôturer/ });
    expect(close).toHaveStyle({ minHeight: '44px' });
    expect(screen.getByRole('button', { name: /Prendre en charge/ })).toHaveStyle({
      minHeight: '44px',
    });
    expect(screen.queryByRole('button', { name: /Transférer/ })).toBeNull();
    await userEvent.setup().click(close);
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.url === '/api/admin/communications/conversations/c1/close' && c.method === 'POST',
        ),
      ).toBe(true),
    );
  });

  it('« Contacter le parent » ouvre le panneau avec l’élève et le lien préremplis, sans quitter la page', async () => {
    adminApi(adminMe, [internal()], (call) =>
      call.url === '/api/admin/communications/conversations/c1' && call.method === 'GET'
        ? json(
            200,
            conversation({
              teacher: { id: 't1', displayName: 'Mme Enseignante' },
              responsibleAdmin: null,
              linkedInternalId: null,
              messages: [message({ mine: false })],
            }),
          )
        : undefined,
    );
    const router = renderRoutes(routes, '/communications?vue=boite&conversation=c1');
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /Contacter le parent/ }));
    await waitFor(() => expect(router.state.location.search).toContain('nouveau'));
    const params = new URLSearchParams(router.state.location.search);
    expect(router.state.location.pathname).toBe('/communications');
    expect(params.get('type')).toBe('PARENT');
    expect(params.get('studentId')).toBe('s1');
    expect(params.get('linkedInternalId')).toBe('c1');
    expect(params.get('conversation')).toBe('c1');
    expect(await screen.findByRole('dialog', { name: 'Nouveau message' })).toBeVisible();
  });

  const recipients = {
    student,
    teachers: [{ id: 't1', displayName: 'Mme Enseignante' }],
    guardians: [
      {
        id: 'g1',
        firstName: 'Sonia',
        lastName: 'Ben Salah',
        relationship: 'Mère',
        hasActiveAccount: true,
      },
      {
        id: 'g2',
        firstName: 'Nora',
        lastName: 'Ben Salah',
        relationship: 'Tante',
        hasActiveAccount: false,
      },
    ],
  };
  const withStudents = (call: Call) =>
    call.url === '/api/admin/students'
      ? json(200, [{ ...student, active: true }])
      : call.url === '/api/admin/communications/recipients?studentId=s1'
        ? json(200, recipients)
        : undefined;

  it('panneau « Nouveau message » : boutons segmentés, parent sans compte indisponible, envoi pour validation, puis la conversation créée s’ouvre', async () => {
    const calls = adminApi(adminMe, [internal()], (call) => {
      const common = withStudents(call);
      if (common) return common;
      if (call.url === '/api/admin/communications/conversations' && call.method === 'POST')
        return json(201, conversation({ id: 'c7', type: 'PARENT' }));
      if (call.url === '/api/admin/communications/conversations/c7')
        return json(200, conversation({ id: 'c7', type: 'PARENT' }));
      return undefined;
    });
    const router = renderRoutes(routes, '/communications');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Nouveau message/ }));
    const drawer = within(await screen.findByRole('dialog', { name: 'Nouveau message' }));
    const toTeacher = drawer.getByRole('button', { name: 'Un enseignant' });
    const toParent = drawer.getByRole('button', { name: 'Un parent' });
    expect(toTeacher).toHaveAttribute('aria-pressed', 'true');
    expect(toTeacher).toHaveStyle({ minHeight: '48px' });
    expect(drawer.getByText('L’enseignant reçoit le message directement.')).toBeVisible();

    await user.click(toParent);
    expect(toParent).toHaveAttribute('aria-pressed', 'true');
    expect(drawer.getByText(/validé par un autre membre de l’administration/)).toBeVisible();

    // Élève : deux lettres au moins, puis suggestions.
    const search = drawer.getByRole('textbox', { name: 'Rechercher un élève' });
    await user.type(search, 'L');
    expect(screen.queryByRole('option', { name: /Lina Ben Salah/ })).toBeNull();
    await user.type(search, 'i');
    await user.click(await screen.findByRole('option', { name: /Lina Ben Salah/ }));

    expect(await drawer.findByRole('radio', { name: /Nora Ben Salah/ })).toBeDisabled();
    await user.click(drawer.getByRole('radio', { name: /Sonia Ben Salah/ }));
    await user.type(drawer.getByLabelText('Votre message'), 'Pouvons-nous parler de Lina ?');
    await user.click(drawer.getByRole('button', { name: 'Envoyer pour validation' }));

    await waitFor(() =>
      expect(router.state.location.search).toBe('?vue=conversations&conversation=c7'),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      calls.find((c) => c.url === '/api/admin/communications/conversations' && c.method === 'POST')
        ?.body,
    ).toEqual({
      type: 'PARENT',
      studentId: 's1',
      guardianId: 'g1',
      text: 'Pouvons-nous parler de Lina ?',
      voiceFileId: null,
    });
  });

  it('panneau prérempli (ancienne adresse « nouveau ») : lien interne transmis', async () => {
    const calls = adminApi(adminMe, [internal()], (call) => {
      const common = withStudents(call);
      if (common) return common;
      if (call.url === '/api/admin/communications/conversations' && call.method === 'POST')
        return json(201, conversation({ id: 'c7', type: 'PARENT' }));
      return undefined;
    });
    renderRoutes(routes, '/communications/nouveau?type=PARENT&studentId=s1&linkedInternalId=c1');
    const user = userEvent.setup();
    const drawer = within(await screen.findByRole('dialog', { name: 'Nouveau message' }));
    await user.click(await drawer.findByRole('radio', { name: /Sonia Ben Salah/ }));
    await user.type(drawer.getByLabelText('Votre message'), 'Bonjour');
    await user.click(drawer.getByRole('button', { name: 'Envoyer pour validation' }));
    await waitFor(() =>
      expect(
        calls.find(
          (c) => c.url === '/api/admin/communications/conversations' && c.method === 'POST',
        )?.body,
      ).toMatchObject({
        type: 'PARENT',
        studentId: 's1',
        guardianId: 'g1',
        linkedInternalId: 'c1',
      }),
    );
  });

  it('fermer le panneau retire ?nouveau et garde la vue', async () => {
    adminApi(adminMe, [internal()]);
    const router = renderRoutes(routes, '/communications?vue=conversations&nouveau');
    const user = userEvent.setup();
    const drawer = within(await screen.findByRole('dialog', { name: 'Nouveau message' }));
    await user.click(drawer.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.search).toBe('?vue=conversations');
  });

  it('anciennes adresses : boîte, conversations, à valider et nouveau mènent à la page unique', async () => {
    adminApi(adminMe, [internal()]);
    const router = renderRoutes(routes, '/communications/boite/c1');
    await waitFor(() => expect(router.state.location.search).toBe('?vue=boite&conversation=c1'));
    expect(router.state.location.pathname).toBe('/communications');
    await router.navigate('/communications/conversations/c1');
    await waitFor(() =>
      expect(router.state.location.search).toBe('?vue=conversations&conversation=c1'),
    );
    await router.navigate('/communications/a-valider/m5');
    await waitFor(() => expect(router.state.location.search).toBe('?vue=valider&message=m5'));
    await router.navigate('/communications/a-valider');
    await waitFor(() => expect(router.state.location.search).toBe('?vue=valider'));
    await router.navigate('/communications/nouveau');
    await waitFor(() => expect(router.state.location.search).toBe('?nouveau'));
    expect(router.state.location.pathname).toBe('/communications');
  });

  it('« À valider » : liste à gauche ; Approuver envoie la décision sur la version examinée', async () => {
    const calls = adminApi(adminMe, [], (call) => {
      if (call.url === '/api/admin/communications/to-validate')
        return json(200, [pendingItem('m5', false)]);
      if (call.url === '/api/admin/communications/messages/m5' && call.method === 'GET')
        return json(200, pendingDetail('m5', false));
      if (call.url === '/api/admin/communications/messages/m5/decision')
        return json(200, { ...pendingItem('m5', false), status: 'APPROVED' });
      return undefined;
    });
    const router = renderRoutes(routes, '/communications?vue=valider');
    const user = userEvent.setup();
    expect(await screen.findByText('Choisissez un message à examiner')).toBeVisible();
    const line = await screen.findByRole('link', { name: /Lina Ben Salah/ });
    expect(line).toHaveAttribute('href', '/communications?vue=valider&message=m5');
    await user.click(line);
    expect(router.state.location.search).toBe('?vue=valider&message=m5');
    const approve = await screen.findByRole('button', { name: 'Approuver' });
    expect(approve).toHaveStyle({ minHeight: '44px' });
    await user.click(approve);
    await waitFor(() =>
      expect(
        calls.find((c) => c.url === '/api/admin/communications/messages/m5/decision')?.body,
      ).toEqual({ action: 'APPROVE', revision: 2, version: 5 }),
    );
  });

  it('« À valider » : son propre message n’est pas décidable', async () => {
    adminApi(adminMe, [], (call) => {
      if (call.url === '/api/admin/communications/to-validate')
        return json(200, [pendingItem('m6', true)]);
      if (call.url === '/api/admin/communications/messages/m6')
        return json(200, pendingDetail('m6', true));
      return undefined;
    });
    renderRoutes(routes, '/communications?vue=valider&message=m6');
    expect(
      await screen.findByText(/Un autre validateur décide de votre message/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approuver' })).toBeNull();
  });

  it('« À valider » : Refuser exige un motif', async () => {
    const calls = adminApi(adminMe, [], (call) => {
      if (call.url === '/api/admin/communications/to-validate')
        return json(200, [pendingItem('m5', false)]);
      if (call.url === '/api/admin/communications/messages/m5' && call.method === 'GET')
        return json(200, pendingDetail('m5', false));
      if (call.url === '/api/admin/communications/messages/m5/decision')
        return json(200, { ...pendingItem('m5', false), status: 'REJECTED' });
      return undefined;
    });
    renderRoutes(routes, '/communications?vue=valider&message=m5');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Refuser' }));
    await user.click(screen.getByRole('button', { name: 'Confirmer le refus' }));
    expect(await screen.findByText('Indiquez le motif.')).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/decision'))).toBe(false);
    await user.type(screen.getByLabelText('Motif'), 'Ton inadapté.');
    await user.click(screen.getByRole('button', { name: 'Confirmer le refus' }));
    await waitFor(() =>
      expect(calls.find((c) => c.url.endsWith('/decision'))?.body).toEqual({
        action: 'REJECT',
        revision: 2,
        version: 5,
        reason: 'Ton inadapté.',
      }),
    );
  });

  it('« À valider » : renvoyer pour correction exige un motif', async () => {
    const calls = adminApi(adminMe, [], (call) => {
      if (call.url === '/api/admin/communications/to-validate')
        return json(200, [pendingItem('m5', false)]);
      if (call.url === '/api/admin/communications/messages/m5' && call.method === 'GET')
        return json(200, pendingDetail('m5', false));
      if (call.url === '/api/admin/communications/messages/m5/decision')
        return json(200, { ...pendingItem('m5', false), status: 'RETURNED_FOR_CORRECTION' });
      return undefined;
    });
    renderRoutes(routes, '/communications?vue=valider&message=m5');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Renvoyer pour correction' }));
    await user.click(screen.getByRole('button', { name: 'Confirmer le renvoi' }));
    expect(await screen.findByText('Indiquez le motif.')).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/decision'))).toBe(false);
    await user.type(screen.getByLabelText('Motif'), 'Précisez l’heure.');
    await user.click(screen.getByRole('button', { name: 'Confirmer le renvoi' }));
    await waitFor(() =>
      expect(calls.find((c) => c.url.endsWith('/decision'))?.body).toEqual({
        action: 'RETURN',
        revision: 2,
        version: 5,
        reason: 'Précisez l’heure.',
      }),
    );
  });
});
