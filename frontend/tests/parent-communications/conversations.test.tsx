import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ParentMessagePage } from '../../src/features/parent-communications/ParentMessagePage';
import { ParentMessagesPage } from '../../src/features/parent-communications/ParentMessagesPage';
import {
  TeacherCommunicationsPage,
  TeacherMessageRedirect,
} from '../../src/features/parent-communications/TeacherCommunicationsPage';
import {
  guardian,
  json,
  mockApi,
  renderRoutes,
  route,
  student,
  teacher,
  type Call,
} from './helpers';

/**
 * 015 — conversations parent ↔ enseignant : le parent choisit un enfant puis un enseignant de sa
 * classe, écrit (vocal facultatif) ; ses messages affichent leur état de modération ; l'enseignant
 * répond dans la conversation (remarque et vocal obligatoires).
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

beforeAll(() => {
  URL.createObjectURL ??= vi.fn(() => 'blob:x');
});
afterEach(() => vi.unstubAllGlobals());

const adam = {
  id: 's2',
  firstName: 'Adam',
  lastName: 'Ben Salah',
  class: { id: 'c2', name: '2e année Bleu' },
};
const math = { id: 't2', displayName: 'Mme Mathlouthi', jobTitle: 'Mathématiques' };
const card = { ...teacher, jobTitle: 'Français' };

function msg(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    author: 'PARENT',
    own: true,
    status: 'PENDING_ADMIN_VALIDATION',
    version: 1,
    revision: 1,
    text: `Texte ${id}`,
    voiceFileId: null,
    durationSeconds: null,
    sentAt: '2026-11-10T08:00:00.000Z',
    editedAt: null,
    decidedAt: null,
    decisionReason: null,
    readAt: null,
    ...overrides,
  };
}

describe('Messages de l’école — parent', () => {
  const routes = [
    route('/messages-ecole', <ParentMessagesPage />),
    route('/messages-ecole/nouvelle', <ParentMessagesPage mode="new" />),
    route('/messages-ecole/conversation/:teacherId/:studentId', <ParentMessagesPage />),
    route('/messages-ecole/:id', <ParentMessagePage />),
  ];
  const CHILDREN = [
    { ...student, teachers: [card, math] },
    { ...adam, teachers: [card] },
  ];

  function api(extra: (call: Call) => Response | undefined = () => undefined) {
    return mockApi((call) => {
      const custom = extra(call);
      if (custom) return custom;
      if (call.url === '/api/settings/client') return json(200, { voiceMaxSeconds: 120 });
      if (call.url === '/api/parent/messages/children') return json(200, CHILDREN);
      if (call.url === '/api/parent/messages/conversations') return json(200, []);
      return undefined;
    });
  }

  it('liste les conversations : une par enseignant et par enfant, non lus signalés', async () => {
    api((call) =>
      call.url === '/api/parent/messages/conversations'
        ? json(200, [
            {
              key: 't1.s1.g1',
              teacher: card,
              student,
              lastMessage: {
                id: 'm1',
                author: 'TEACHER',
                status: 'APPROVED',
                preview: 'Bonjour',
                sentAt: '2026-11-10T08:00:00.000Z',
              },
              unread: 2,
              pending: 0,
              returned: 0,
            },
            {
              key: 't1.s2.g1',
              teacher: card,
              student: adam,
              lastMessage: {
                id: 'm2',
                author: 'PARENT',
                status: 'PENDING_ADMIN_VALIDATION',
                preview: 'Cahier oublié',
                sentAt: '2026-11-09T08:00:00.000Z',
              },
              unread: 0,
              pending: 1,
              returned: 0,
            },
          ])
        : undefined,
    );
    renderRoutes(routes, '/messages-ecole');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Messages de l’école' }),
    ).toBeVisible();
    const list = await screen.findByRole('list', { name: 'Conversations' });
    const links = within(list).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/messages-ecole/conversation/t1/s1');
    expect(links[0]).toHaveTextContent('Lina Ben Salah');
    expect(within(links[0]!).getByLabelText('2 messages non lus')).toBeVisible();
    expect(links[1]).toHaveAttribute('href', '/messages-ecole/conversation/t1/s2');
    expect(links[1]).toHaveTextContent('Vous : Cahier oublié');
    expect(screen.getByRole('link', { name: 'Nouvelle conversation' })).toHaveAttribute(
      'href',
      '/messages-ecole/nouvelle',
    );
  });

  it('nouvelle conversation : l’enfant choisi, puis seulement les enseignants de sa classe', async () => {
    api((call) =>
      call.url === '/api/parent/messages/conversations/t1/s2'
        ? json(200, { key: 't1.s2.g1', teacher: card, student: adam, canSend: true, messages: [] })
        : undefined,
    );
    const router = renderRoutes(routes, '/messages-ecole/nouvelle');
    const children = await screen.findByRole('group', { name: 'Votre enfant' });
    expect(
      within(children).getByRole('button', { name: /Lina Ben Salah.*1ère année Violet/ }),
    ).toBeVisible();
    await userEvent.click(within(children).getByRole('button', { name: /Adam Ben Salah/ }));
    const teachers = screen.getByRole('list', { name: 'Enseignants de Adam' });
    expect(within(teachers).getAllByRole('button')).toHaveLength(1);
    expect(within(teachers).queryByText('Mme Mathlouthi')).toBeNull();
    await userEvent.click(
      within(teachers).getByRole('button', { name: /Mme Enseignante.*Français/ }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/messages-ecole/conversation/t1/s2'),
    );
    expect(
      await screen.findByText('Écrivez votre premier message à Mme Enseignante.'),
    ).toBeVisible();
  });

  it('envoie un message écrit : il part à la validation, vocal facultatif', async () => {
    let sent: Call | undefined;
    const calls = api((call) => {
      if (call.url === '/api/parent/messages/conversations/t1/s1' && call.method === 'POST') {
        sent = call;
        return json(201, msg('m9', { text: 'Lina sera absente vendredi.' }));
      }
      if (call.url === '/api/parent/messages/conversations/t1/s1')
        return json(200, {
          key: 't1.s1.g1',
          teacher: card,
          student,
          canSend: true,
          messages: sent ? [msg('m9', { text: 'Lina sera absente vendredi.' })] : [],
        });
      return undefined;
    });
    renderRoutes(routes, '/messages-ecole/conversation/t1/s1');
    const header = (
      await screen.findByRole('heading', { level: 2, name: 'Mme Enseignante' })
    ).closest('header')!;
    expect(header).toHaveTextContent('Au sujet de Lina Ben Salah · 1ère année Violet');
    // Message vide : refusé sans appel.
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Écrivez votre message');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Votre message' }),
      'Lina sera absente vendredi.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() =>
      expect(sent?.body).toEqual({ text: 'Lina sera absente vendredi.', voiceFileId: null }),
    );
    const bubble = (await screen.findByText('Lina sera absente vendredi.')).closest('article')!;
    expect(within(bubble).getByText('En attente de validation')).toBeVisible();
    expect(calls.some((c) => c.url === '/api/files')).toBe(false);
  });

  it('message retourné : motif visible, correction renvoyée avec sa version', async () => {
    let body: unknown;
    api((call) => {
      if (call.url === '/api/parent/messages/m3/resubmit') {
        body = call.body;
        return json(200, msg('m3', { revision: 2 }));
      }
      if (call.url === '/api/parent/messages/conversations/t1/s1')
        return json(200, {
          key: 't1.s1.g1',
          teacher: card,
          student,
          canSend: true,
          messages: [
            msg('m1', {
              author: 'TEACHER',
              own: false,
              status: 'APPROVED',
              version: null,
              text: 'Bonne semaine à Lina.',
              voiceFileId: 'v1',
            }),
            msg('m3', {
              status: 'RETURNED_FOR_CORRECTION',
              version: 4,
              text: 'Rappelez-moi',
              decisionReason: 'Précisez un créneau.',
            }),
          ],
        });
      return undefined;
    });
    renderRoutes(routes, '/messages-ecole/conversation/t1/s1');
    const received = (await screen.findByText('Bonne semaine à Lina.')).closest('article')!;
    expect(received.querySelector('audio')).toHaveAttribute('src', '/api/files/v1');
    // Message reçu : aucun état de modération affiché.
    expect(within(received).queryByText('Transmis')).toBeNull();
    const own = screen.getByText('Rappelez-moi').closest('article')!;
    expect(within(own).getByText('À corriger')).toBeVisible();
    expect(within(own).getByText('Précisez un créneau.')).toBeVisible();
    await userEvent.click(within(own).getByRole('button', { name: 'Corriger' }));
    const field = screen.getByRole('textbox', { name: 'Votre message' });
    expect(field).toHaveValue('Rappelez-moi');
    await userEvent.type(field, ' mardi après 16 h.');
    await userEvent.click(screen.getByRole('button', { name: 'Renvoyer pour validation' }));
    await waitFor(() =>
      expect(body).toEqual({
        version: 4,
        text: 'Rappelez-moi mardi après 16 h.',
        voiceFileId: null,
      }),
    );
  });

  it('lien d’une notification : ouvre la conversation du message', async () => {
    api((call) => {
      if (call.url === '/api/parent/messages/m1/conversation')
        return json(200, { teacherId: 't1', studentId: 's1' });
      if (call.url === '/api/parent/messages/conversations/t1/s1')
        return json(200, { key: 'k', teacher: card, student, canSend: true, messages: [] });
      return undefined;
    });
    const router = renderRoutes(routes, '/messages-ecole/m1');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/messages-ecole/conversation/t1/s1'),
    );
  });
});

describe('Communication avec les parents — conversations de l’enseignant', () => {
  const routes = [
    route('/communications-parents', <TeacherCommunicationsPage />),
    route(
      '/communications-parents/conversation/:studentId/:guardianId',
      <TeacherCommunicationsPage />,
    ),
    route('/communications-parents/message/:id', <TeacherMessageRedirect />),
  ];
  const THREAD = {
    key: 't1.s1.g1',
    student,
    guardian,
    messages: [
      msg('m1', {
        text: 'Lina sera absente vendredi.',
        status: 'APPROVED',
        own: false,
        version: null,
      }),
      msg('m2', {
        author: 'TEACHER',
        own: true,
        status: 'PENDING_ADMIN_VALIDATION',
        text: 'Merci, c’est noté.',
      }),
      msg('m3', {
        author: 'TEACHER',
        own: true,
        status: 'RETURNED_FOR_CORRECTION',
        text: 'Brouillon à revoir',
        decisionReason: 'Ton à revoir.',
      }),
    ],
  };

  function api(extra: (call: Call) => Response | undefined = () => undefined) {
    return mockApi((call) => {
      const custom = extra(call);
      if (custom) return custom;
      if (call.url === '/api/settings/client') return json(200, { voiceMaxSeconds: 120 });
      if (call.url === '/api/parent-communications/conversations')
        return json(200, [
          {
            key: 't1.s1.g1',
            student,
            guardian,
            lastMessage: {
              id: 'm1',
              author: 'PARENT',
              status: 'APPROVED',
              preview: 'Lina sera absente',
              sentAt: '2026-11-10T08:00:00.000Z',
            },
            unread: 1,
            pending: 1,
            returned: 1,
          },
        ]);
      if (call.url === '/api/parent-communications/conversations/s1/g1') return json(200, THREAD);
      return undefined;
    });
  }

  it('liste les conversations : parent, élève et classe ; propose une nouvelle communication', async () => {
    api();
    renderRoutes(routes, '/communications-parents');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Communication avec les parents' }),
    ).toBeVisible();
    const link = within(await screen.findByRole('list', { name: 'Conversations' })).getByRole(
      'link',
    );
    expect(link).toHaveAttribute('href', '/communications-parents/conversation/s1/g1');
    expect(link).toHaveTextContent('Sonia Ben Salah (Mère)');
    expect(link).toHaveTextContent('Lina Ben Salah · 1ère année Violet');
    expect(within(link).getByLabelText('1 message non lu')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Nouvelle communication' })).toHaveAttribute(
      'href',
      '/communications-parents/nouvelle',
    );
  });

  it('conversation : messages du parent reçus, états de ses propres messages, correction', async () => {
    api();
    renderRoutes(routes, '/communications-parents/conversation/s1/g1');
    const header = (
      await screen.findByRole('heading', { level: 2, name: 'Sonia Ben Salah (Mère)' })
    ).closest('header')!;
    expect(header).toHaveTextContent('Élève : Lina Ben Salah · 1ère année Violet');
    const received = screen.getByText('Lina sera absente vendredi.').closest('article')!;
    expect(within(received).queryByText(/validation|Transmis/)).toBeNull();
    expect(
      within(screen.getByText('Merci, c’est noté.').closest('article')!).getByText(
        'En attente de validation',
      ),
    ).toBeVisible();
    const returned = screen.getByText('Brouillon à revoir').closest('article')!;
    expect(within(returned).getByText('Ton à revoir.')).toBeVisible();
    expect(within(returned).getByRole('link', { name: 'Corriger' })).toHaveAttribute(
      'href',
      '/communications-parents/m3',
    );
  });

  it('premier message (conversation vide) : remarque et vocal obligatoires, puis brouillon et soumission', async () => {
    const calls = api((call) => {
      if (call.url === '/api/parent-communications/conversations/s1/g1')
        return json(200, { ...THREAD, messages: [] });
      if (call.url === '/api/files') return json(201, { id: 'v9', kind: 'VOICE' });
      if (call.url === '/api/parent-communications' && call.method === 'POST')
        return json(201, { id: 'pc9', version: 0 });
      if (call.url === '/api/parent-communications/pc9/submit')
        return json(200, { id: 'pc9', version: 1 });
      return undefined;
    });
    renderRoutes(routes, '/communications-parents/conversation/s1/g1');
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Votre message' }),
      'Bonne nouvelle.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('le message vocal');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le vocal (simulé)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() =>
      expect(calls.find((c) => c.url === '/api/parent-communications/pc9/submit')?.body).toEqual({
        version: 0,
      }),
    );
    expect(
      calls.find((c) => c.url === '/api/parent-communications' && c.method === 'POST')?.body,
    ).toEqual({
      studentId: 's1',
      guardianId: 'g1',
      text: 'Bonne nouvelle.',
      voiceFileId: 'v9',
    });
  });

  it('réponse dans une conversation commencée : le vocal est facultatif', async () => {
    const calls = api((call) => {
      if (call.url === '/api/parent-communications' && call.method === 'POST')
        return json(201, { id: 'pc9', version: 0 });
      if (call.url === '/api/parent-communications/pc9/submit')
        return json(200, { id: 'pc9', version: 1 });
      return undefined;
    });
    renderRoutes(routes, '/communications-parents/conversation/s1/g1');
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Votre message' }),
      'Merci, bonne journée.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() =>
      expect(calls.find((c) => c.url === '/api/parent-communications/pc9/submit')?.body).toEqual({
        version: 0,
      }),
    );
    expect(
      calls.find((c) => c.url === '/api/parent-communications' && c.method === 'POST')?.body,
    ).toEqual({
      studentId: 's1',
      guardianId: 'g1',
      text: 'Merci, bonne journée.',
      voiceFileId: null,
    });
    expect(calls.some((c) => c.url === '/api/files')).toBe(false);
  });

  it('lien d’une notification : ouvre la conversation du message du parent', async () => {
    api((call) =>
      call.url === '/api/parent-communications/messages/m1/conversation'
        ? json(200, { studentId: 's1', guardianId: 'g1' })
        : undefined,
    );
    const router = renderRoutes(routes, '/communications-parents/message/m1');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/communications-parents/conversation/s1/g1'),
    );
  });
});
