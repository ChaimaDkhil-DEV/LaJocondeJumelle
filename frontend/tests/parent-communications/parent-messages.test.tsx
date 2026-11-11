import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParentMessagesPage } from '../../src/features/parent-communications/ParentMessagesPage';
import { json, mockApi, renderRoutes, route, student, type Call } from './helpers';

/** 017 — « Messages de l'école » : conversations avec l'école, nouvelle conversation au sujet d'un enfant. */

vi.mock('../../src/features/voice/VoiceRecorder', () => ({
  VoiceRecorder: () => <span>Enregistreur</span>,
}));

afterEach(() => vi.unstubAllGlobals());

const routes = [
  route('/messages-ecole', <ParentMessagesPage />),
  route('/messages-ecole/nouvelle', <ParentMessagesPage mode="new" />),
  route('/messages-ecole/conversations/:id', <ParentMessagesPage />),
];

const parentMe = {
  id: 'p1',
  username: 'parent',
  displayName: 'Sonia',
  jobTitle: null,
  role: 'PARENT',
  permissions: [],
  mustChangePassword: false,
};
const adam = {
  id: 's2',
  firstName: 'Adam',
  lastName: 'Ben Salah',
  class: { id: 'c2', name: '2e année Bleu' },
};

const conversation = (overrides: Record<string, unknown> = {}) => ({
  id: 'k1',
  type: 'PARENT',
  status: 'OPEN',
  student,
  lastMessage: {
    at: '2026-11-11T08:00:00.000Z',
    authorKind: 'ADMIN',
    authorLabel: 'L’école',
    hasVoice: false,
    excerpt: 'Réunion jeudi ?',
  },
  unread: 1,
  createdAt: '2026-11-11T08:00:00.000Z',
  lastMessageAt: '2026-11-11T08:00:00.000Z',
  messages: [
    {
      id: 'm1',
      authorKind: 'ADMIN',
      authorLabel: 'L’école',
      mine: false,
      status: 'SENT',
      text: 'Réunion jeudi ?',
      voice: null,
      createdAt: '2026-11-11T08:00:00.000Z',
      readAt: '2026-11-11T08:05:00.000Z',
    },
  ],
  canPost: true,
  ...overrides,
});

function api(extra: (call: Call) => Response | undefined = () => undefined) {
  return mockApi((call) => {
    const custom = extra(call);
    if (custom) return custom;
    if (call.url === '/api/auth/me') return json(200, parentMe);
    if (call.url === '/api/settings/client') return json(200, { voiceMaxSeconds: 120 });
    if (call.url === '/api/parent/messages/children') return json(200, [student, adam]);
    if (call.url === '/api/parent/messages/conversations' && call.method === 'GET')
      return json(200, [conversation()]);
    if (call.url === '/api/parent/messages/conversations/k1') return json(200, conversation());
    return undefined;
  });
}

describe('Messages de l’école', () => {
  it('liste des conversations avec l’école et bouton « Nouvelle conversation »', async () => {
    api();
    renderRoutes(routes, '/messages-ecole');
    const line = await screen.findByRole('link', { name: /Lina Ben Salah/ });
    expect(line).toHaveTextContent('L’école');
    expect(screen.getByRole('link', { name: /Nouvelle conversation/ })).toHaveAttribute(
      'href',
      '/messages-ecole/nouvelle',
    );
  });

  it('conversation : messages signés « L’école », réponse possible', async () => {
    api();
    renderRoutes(routes, '/messages-ecole/conversations/k1');
    expect(await screen.findByText('Réunion jeudi ?')).toBeInTheDocument();
    expect(screen.getAllByText(/L’école/).length).toBeGreaterThan(0);
    expect(screen.getByRole('form', { name: /Envoyer/ })).toBeInTheDocument();
  });

  it('nouvelle conversation : choisir l’enfant d’abord, puis écrire et envoyer', async () => {
    const calls = api((call) => {
      if (call.url === '/api/parent/messages/conversations' && call.method === 'POST')
        return json(201, conversation({ id: 'k2' }));
      if (call.url === '/api/parent/messages/conversations/k2')
        return json(200, conversation({ id: 'k2' }));
      return undefined;
    });
    const router = renderRoutes(routes, '/messages-ecole/nouvelle');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Votre message'), 'Adam sera absent demain.');
    await user.click(screen.getByRole('button', { name: /Envoyer/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choisissez l’enfant concerné.');
    await user.click(screen.getByRole('radio', { name: /Adam Ben Salah/ }));
    await user.click(screen.getByRole('button', { name: /Envoyer/ }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/messages-ecole/conversations/k2'),
    );
    expect(
      calls.find((c) => c.method === 'POST' && c.url === '/api/parent/messages/conversations')
        ?.body,
    ).toEqual({
      studentId: 's2',
      text: 'Adam sera absent demain.',
      voiceFileId: null,
    });
  });
});
