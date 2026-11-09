import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParentMessagePage } from '../../src/features/parent-communications/ParentMessagePage';
import { ParentMessagesPage } from '../../src/features/parent-communications/ParentMessagesPage';
import { ValidationDetailPage } from '../../src/features/parent-communications/ValidationDetailPage';
import { ValidationListPage } from '../../src/features/parent-communications/ValidationListPage';
import { detail, json, mockApi, renderRoutes, route, teacher } from './helpers';

/**
 * 015 (US2, US3) — « Communications à valider » : filtres, examen de la version soumise, décisions
 * confirmées sur cette version, motif obligatoire ; « Messages de l'école » : messages approuvés, lecture.
 */

afterEach(() => vi.unstubAllGlobals());

const PENDING = detail({
  status: 'PENDING_ADMIN_VALIDATION',
  version: 4,
  currentRevision: 2,
  draft: null,
  submittedAt: '2026-11-09T09:05:00.000Z',
  revisions: [
    {
      number: 1,
      text: 'Première version',
      voiceFileId: 'v1',
      durationSeconds: 4,
      createdAt: '2026-11-09T09:05:00.000Z',
    },
    {
      number: 2,
      text: 'Version à examiner',
      voiceFileId: 'v2',
      durationSeconds: 5,
      createdAt: '2026-11-09T10:05:00.000Z',
    },
  ],
  events: [
    {
      type: 'CREATED',
      actor: teacher,
      revision: null,
      reason: null,
      createdAt: '2026-11-09T09:00:00.000Z',
    },
    {
      type: 'SUBMITTED',
      actor: teacher,
      revision: 1,
      reason: null,
      createdAt: '2026-11-09T09:05:00.000Z',
    },
    {
      type: 'RETURNED',
      actor: { id: 'sa', displayName: 'Direction' },
      revision: 1,
      reason: 'Précisez la matière.',
      createdAt: '2026-11-09T09:30:00.000Z',
    },
    {
      type: 'SUBMITTED',
      actor: teacher,
      revision: 2,
      reason: null,
      createdAt: '2026-11-09T10:05:00.000Z',
    },
  ],
});

describe('Communications à valider', () => {
  const routes = [
    route('/communications-a-valider', <ValidationListPage />),
    route('/communications-a-valider/:id', <ValidationDetailPage />),
  ];

  it('liste les communications en attente et filtre par classe', async () => {
    const user = userEvent.setup();
    const calls = mockApi((call) =>
      call.url.startsWith('/api/admin/parent-communications') ? json(200, [PENDING]) : undefined,
    );
    renderRoutes(routes, '/communications-a-valider');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Communications à valider' }),
    ).toBeVisible();
    expect(await screen.findByRole('link', { name: /Lina Ben Salah/ })).toHaveAttribute(
      'href',
      '/communications-a-valider/pc1',
    );
    expect(new URLSearchParams(calls[0]!.url.split('?')[1]).get('status')).toBe(
      'PENDING_ADMIN_VALIDATION',
    );

    await user.click(screen.getByRole('combobox', { name: 'Classe' }));
    await user.click(screen.getByRole('option', { name: '1ère année Violet' }));
    await waitFor(() =>
      expect(new URLSearchParams(calls.at(-1)!.url.split('?')[1]).get('classId')).toBe('c1'),
    );
  });

  it('examine la version soumise (remarque, vocal, destinataire, historique) puis l’approuve après confirmation', async () => {
    const user = userEvent.setup();
    const calls = mockApi((call) => {
      if (call.url === '/api/admin/parent-communications/pc1') return json(200, PENDING);
      if (call.url === '/api/admin/parent-communications/pc1/decision')
        return json(200, { ...PENDING, status: 'APPROVED', approvedRevision: 2 });
      return undefined;
    });
    renderRoutes(routes, '/communications-a-valider/pc1');
    expect(await screen.findByText('Version à examiner')).toBeVisible();
    expect(screen.queryByText('Première version')).toBeNull();
    expect(screen.getByText(/Sonia Ben Salah/)).toBeVisible();
    expect(document.querySelector('audio')).toHaveAttribute('src', '/api/files/v2');
    expect(screen.getByText('Précisez la matière.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Approuver et publier' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Approuver et publier cette communication ?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Approuver et publier' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/decision'))).toBe(true));
    expect(calls.find((c) => c.url.endsWith('/decision'))!.body).toEqual({
      action: 'APPROVE',
      revision: 2,
      version: 4,
    });
  });

  it('retour pour correction et rejet : motif obligatoire', async () => {
    const user = userEvent.setup();
    const calls = mockApi((call) => {
      if (call.url === '/api/admin/parent-communications/pc1') return json(200, PENDING);
      if (call.url.endsWith('/decision'))
        return json(200, { ...PENDING, status: 'RETURNED_FOR_CORRECTION' });
      return undefined;
    });
    renderRoutes(routes, '/communications-a-valider/pc1');
    // Rejet sans motif : refusé, aucun appel.
    await user.click(await screen.findByRole('button', { name: 'Rejeter' }));
    const reject = await screen.findByRole('dialog', { name: 'Rejeter la communication' });
    await user.click(within(reject).getByRole('button', { name: 'Rejeter' }));
    expect(calls.some((c) => c.url.endsWith('/decision'))).toBe(false);
    await user.click(within(reject).getByRole('button', { name: 'Retour' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Retourner pour correction' }));
    const dialog = await screen.findByRole('dialog', { name: 'Retourner pour correction' });
    await user.click(within(dialog).getByRole('button', { name: 'Retourner' }));
    expect(calls.some((c) => c.url.endsWith('/decision'))).toBe(false);
    await user.type(within(dialog).getByRole('textbox'), 'Merci de reformuler.');
    await user.click(within(dialog).getByRole('button', { name: 'Retourner' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/decision'))).toBe(true));
    expect(calls.find((c) => c.url.endsWith('/decision'))!.body).toEqual({
      action: 'RETURN',
      revision: 2,
      version: 4,
      reason: 'Merci de reformuler.',
    });
    // Décision prise : plus d'action possible sur cette version.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Rejeter' })).toBeNull());
  });
});

describe('Messages de l’école (parent)', () => {
  const routes = [
    route('/messages-ecole', <ParentMessagesPage />),
    route('/messages-ecole/:id', <ParentMessagePage />),
  ];
  const MESSAGES = [
    {
      id: 'pc1',
      teacher: { displayName: 'Mme Enseignante' },
      student: { firstName: 'Lina', lastName: 'Ben Salah' },
      approvedAt: '2026-11-09T11:00:00.000Z',
      read: false,
    },
    {
      id: 'pc2',
      teacher: { displayName: 'M. Professeur' },
      student: { firstName: 'Lina', lastName: 'Ben Salah' },
      approvedAt: '2026-11-08T11:00:00.000Z',
      read: true,
    },
  ];

  it('liste les messages approuvés : enseignant, élève, date et état de lecture', async () => {
    mockApi((call) => (call.url === '/api/parent/messages' ? json(200, MESSAGES) : undefined));
    renderRoutes(routes, '/messages-ecole');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Messages de l’école' }),
    ).toBeVisible();
    const first = await screen.findByRole('link', { name: /Mme Enseignante/ });
    expect(first).toHaveAttribute('href', '/messages-ecole/pc1');
    expect(first).toHaveTextContent('Non lu');
    expect(screen.getByRole('link', { name: /M. Professeur/ })).toHaveTextContent('Lu');
  });

  it('aucun message : état vide explicite', async () => {
    mockApi((call) => (call.url === '/api/parent/messages' ? json(200, []) : undefined));
    renderRoutes(routes, '/messages-ecole');
    expect(await screen.findByText('Aucun message de l’école pour le moment.')).toBeVisible();
  });

  it('ouvre un message : remarque, vocal, enseignant et date', async () => {
    mockApi((call) =>
      call.url === '/api/parent/messages/pc1'
        ? json(200, {
            id: 'pc1',
            teacher: { displayName: 'Mme Enseignante' },
            student: { firstName: 'Lina', lastName: 'Ben Salah' },
            text: 'Lina progresse en lecture.',
            voiceFileId: 'v2',
            durationSeconds: 5,
            approvedAt: '2026-11-09T11:00:00.000Z',
            readAt: '2026-11-09T12:00:00.000Z',
          })
        : undefined,
    );
    renderRoutes(routes, '/messages-ecole/pc1');
    expect(await screen.findByText('Lina progresse en lecture.')).toBeVisible();
    expect(screen.getByText(/Mme Enseignante/)).toBeVisible();
    expect(document.querySelector('audio')).toHaveAttribute('src', '/api/files/v2');
  });
});
