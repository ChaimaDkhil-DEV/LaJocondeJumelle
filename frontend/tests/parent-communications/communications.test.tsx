import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommunicationsPage } from '../../src/features/parent-communications/CommunicationsPage';
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
  route('/communications/nouveau', <CommunicationsPage view="new" />),
  route('/communications/conversations', <CommunicationsPage view="conversations" />),
  route('/communications/conversations/:id', <CommunicationsPage view="conversations" />),
  route('/communications/boite', <CommunicationsPage view="inbox" />),
  route('/communications/boite/:id', <CommunicationsPage view="inbox" />),
  route('/communications/a-valider', <CommunicationsPage view="validation" />),
  route('/communications/a-valider/:id', <CommunicationsPage view="validation" />),
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
  it('accueil : deux boutons, « Nouveau message » et « Mes conversations », rien de l’administration', async () => {
    api(teacherMe);
    renderRoutes(routes, '/communications');
    expect(await screen.findByRole('link', { name: /Nouveau message/ })).toHaveAttribute(
      'href',
      '/communications/nouveau',
    );
    expect(screen.getByRole('link', { name: /Mes conversations/ })).toHaveAttribute(
      'href',
      '/communications/conversations',
    );
    expect(screen.queryByRole('link', { name: /Boîte de réception/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /À valider/ })).toBeNull();
  });

  it('nouveau message : élève, vocal seul, envoi direct à l’administration puis ouverture de la conversation', async () => {
    const calls = api(teacherMe, (call) => {
      if (call.url === '/api/files' && call.method === 'POST')
        return json(201, { id: 'v9', kind: 'VOICE' });
      if (call.url === '/api/communications/teacher/conversations' && call.method === 'POST')
        return json(201, conversation({ id: 'c9' }));
      if (call.url === '/api/communications/teacher/conversations/c9')
        return json(200, conversation({ id: 'c9' }));
      return undefined;
    });
    const router = renderRoutes(routes, '/communications/nouveau');
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Élève'), 's1');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le vocal (simulé)' }));
    await user.click(screen.getByRole('button', { name: /Envoyer/ }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/communications/conversations/c9'),
    );
    expect(
      calls.find(
        (c) => c.url === '/api/communications/teacher/conversations' && c.method === 'POST',
      )?.body,
    ).toEqual({
      studentId: 's1',
      text: null,
      voiceFileId: 'v9',
    });
  });

  it('nouveau message vide : refusé avec une consigne, sans appel', async () => {
    const calls = api(teacherMe);
    renderRoutes(routes, '/communications/nouveau');
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Élève'), 's1');
    await user.click(screen.getByRole('button', { name: /Envoyer/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Écrivez un message ou enregistrez un message vocal',
    );
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('conversation : réponse de l’administration signée, saisie disponible ; clôturée, la saisie disparaît', async () => {
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
    renderRoutes(routes, '/communications/conversations/c1');
    expect(await screen.findByText('Je m’en occupe.')).toBeInTheDocument();
    expect(screen.getAllByText(/Administration \(Mme Martin\)/).length).toBeGreaterThan(0);
    expect(screen.getByRole('form', { name: /Envoyer/ })).toBeInTheDocument();
  });

  it('conversation clôturée : message expliquant la clôture, pas de saisie', async () => {
    api(teacherMe, (call) =>
      call.url === '/api/communications/teacher/conversations/c1'
        ? json(200, conversation({ status: 'CLOSED', canPost: false }))
        : undefined,
    );
    renderRoutes(routes, '/communications/conversations/c1');
    expect(await screen.findByText(/Conversation clôturée/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: /Envoyer/ })).toBeNull();
  });
});

describe('Administration', () => {
  it('accueil : quatre boutons ; « À valider » seulement pour un validateur', async () => {
    api(adminMe);
    renderRoutes(routes, '/communications');
    for (const name of [/Boîte de réception/, /Nouveau message/, /Conversations/, /À valider/]) {
      expect(await screen.findByRole('link', { name })).toBeInTheDocument();
    }
    vi.unstubAllGlobals();
  });

  it('« À valider » masqué sans la permission de validation', async () => {
    api({ ...adminMe, permissions: [] }, (call) =>
      call.url === '/api/admin/communications/send-mode'
        ? json(200, { toParents: 'FORBIDDEN', canValidate: false })
        : undefined,
    );
    renderRoutes(routes, '/communications');
    expect(await screen.findByRole('link', { name: /Boîte de réception/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /À valider/ })).toBeNull();
  });

  it('boîte de réception : expéditeur, type, élève et classe de chaque conversation', async () => {
    api(adminMe, (call) =>
      call.url === '/api/admin/communications/inbox'
        ? json(200, [
            conversation({ unread: 1, teacher: { id: 't1', displayName: 'Mme Enseignante' } }),
          ])
        : undefined,
    );
    renderRoutes(routes, '/communications/boite');
    const line = await screen.findByRole('link', { name: /Lina Ben Salah/ });
    expect(line).toHaveTextContent('Interne');
    expect(line).toHaveTextContent('Mme Enseignante');
    expect(line).toHaveTextContent('1ère année Violet');
  });

  it('« Contacter le parent » ouvre un nouveau message parent avec l’élève et le lien préremplis', async () => {
    api(adminMe, (call) =>
      call.url === '/api/admin/communications/conversations/c1'
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
    const router = renderRoutes(routes, '/communications/conversations/c1');
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /Contacter le parent/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/communications/nouveau'));
    expect(router.state.location.search).toBe('?type=PARENT&studentId=s1&linkedInternalId=c1');
  });

  it('nouveau message au parent : représentants sans compte indisponibles, « Envoyer pour validation »', async () => {
    const calls = api(adminMe, (call) => {
      if (call.url === '/api/admin/communications/recipients?studentId=s1')
        return json(200, {
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
        });
      if (call.url === '/api/admin/communications/conversations' && call.method === 'POST')
        return json(201, conversation({ id: 'c7', type: 'PARENT' }));
      if (call.url === '/api/admin/communications/conversations/c7')
        return json(200, conversation({ id: 'c7', type: 'PARENT' }));
      return undefined;
    });
    const router = renderRoutes(
      routes,
      '/communications/nouveau?type=PARENT&studentId=s1&linkedInternalId=c1',
    );
    const user = userEvent.setup();
    const sonia = await screen.findByRole('radio', { name: /Sonia Ben Salah/ });
    expect(screen.getByRole('radio', { name: /Nora Ben Salah/ })).toBeDisabled();
    await user.click(sonia);
    await user.type(screen.getByLabelText('Votre message'), 'Pouvons-nous parler de Lina ?');
    await user.click(screen.getByRole('button', { name: 'Envoyer pour validation' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/communications/conversations/c7'),
    );
    expect(
      calls.find((c) => c.url === '/api/admin/communications/conversations' && c.method === 'POST')
        ?.body,
    ).toEqual({
      type: 'PARENT',
      studentId: 's1',
      guardianId: 'g1',
      linkedInternalId: 'c1',
      text: 'Pouvons-nous parler de Lina ?',
      voiceFileId: null,
    });
  });

  it('clôturer une conversation', async () => {
    const calls = api(adminMe, (call) => {
      if (call.url === '/api/admin/communications/conversations/c1' && call.method === 'GET')
        return json(200, conversation({ responsibleAdmin: null, linkedInternalId: null }));
      if (call.url === '/api/admin/communications/conversations/c1/close')
        return json(200, conversation({ status: 'CLOSED', canPost: false }));
      return undefined;
    });
    renderRoutes(routes, '/communications/conversations/c1');
    await userEvent.setup().click(await screen.findByRole('button', { name: /Clôturer/ }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.url === '/api/admin/communications/conversations/c1/close' && c.method === 'POST',
        ),
      ).toBe(true),
    );
  });

  it('« À valider » : un autre validateur approuve la version examinée ; son propre message n’est pas décidable', async () => {
    const pending = (id: string, mine: boolean) => ({
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
    const calls = api(adminMe, (call) => {
      if (call.url === '/api/admin/communications/to-validate')
        return json(200, [pending('m5', false), pending('m6', true)]);
      if (call.url === '/api/admin/communications/messages/m5' && call.method === 'GET')
        return json(200, {
          ...pending('m5', false),
          authorKind: 'ADMIN',
          text: 'Message m5',
          voice: null,
          revisions: [],
          events: [],
          deliveries: [],
        });
      if (call.url === '/api/admin/communications/messages/m6')
        return json(200, {
          ...pending('m6', true),
          authorKind: 'ADMIN',
          text: 'Message m6',
          voice: null,
          revisions: [],
          events: [],
          deliveries: [],
        });
      if (call.url === '/api/admin/communications/messages/m5/decision')
        return json(200, { ...pending('m5', false), status: 'APPROVED' });
      return undefined;
    });
    renderRoutes(routes, '/communications/a-valider/m6');
    expect(
      await screen.findByText(/Un autre validateur décide de votre message/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approuver' })).toBeNull();

    vi.unstubAllGlobals();
    const calls2 = api(adminMe, (call) => {
      if (call.url === '/api/admin/communications/to-validate')
        return json(200, [pending('m5', false)]);
      if (call.url === '/api/admin/communications/messages/m5' && call.method === 'GET')
        return json(200, {
          ...pending('m5', false),
          authorKind: 'ADMIN',
          text: 'Message m5',
          voice: null,
          revisions: [],
          events: [],
          deliveries: [],
        });
      if (call.url === '/api/admin/communications/messages/m5/decision')
        return json(200, { ...pending('m5', false), status: 'APPROVED' });
      return undefined;
    });
    renderRoutes(routes, '/communications/a-valider/m5');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Approuver' }));
    await waitFor(() =>
      expect(
        calls2.find((c) => c.url === '/api/admin/communications/messages/m5/decision')?.body,
      ).toEqual({ action: 'APPROVE', revision: 2, version: 5 }),
    );
    expect(calls.length).toBeGreaterThan(0);
  });

  it('« À valider » : renvoyer exige un motif', async () => {
    const item = {
      id: 'm5',
      status: 'PENDING_ADMIN_VALIDATION',
      author: { id: 'a2', displayName: 'Mme Deux' },
      mine: false,
      decidable: true,
      conversation: {
        id: 'c7',
        type: 'PARENT',
        status: 'OPEN',
        student,
        guardian: { id: 'g1', firstName: 'Sonia', lastName: 'Ben Salah', relationship: 'Mère' },
        teacher: null,
      },
      submittedAt: '2026-11-11T09:00:00.000Z',
      validation: { revision: 1, version: 2, decisionReason: null, decidedAt: null },
      hasVoice: false,
      excerpt: 'Texte',
    };
    const calls = api(adminMe, (call) => {
      if (call.url === '/api/admin/communications/to-validate') return json(200, [item]);
      if (call.url === '/api/admin/communications/messages/m5' && call.method === 'GET')
        return json(200, {
          ...item,
          authorKind: 'ADMIN',
          text: 'Texte',
          voice: null,
          revisions: [],
          events: [],
          deliveries: [],
        });
      if (call.url === '/api/admin/communications/messages/m5/decision')
        return json(200, { ...item, status: 'RETURNED_FOR_CORRECTION' });
      return undefined;
    });
    renderRoutes(routes, '/communications/a-valider/m5');
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
        revision: 1,
        version: 2,
        reason: 'Précisez l’heure.',
      }),
    );
  });
});
