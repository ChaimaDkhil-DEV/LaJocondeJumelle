import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ValidationInboxPage } from '../../src/features/parent-communications/ValidationInboxPage';
import { detail, guardian, json, mockApi, renderRoutes, route, student, teacher } from './helpers';

/**
 * 015 (US2, US3) — « Communications à valider » en messagerie : discussions (filtres, recherche),
 * bulles avec leur propre statut, décision sur un seul message (confirmation, motif obligatoire).
 * L'espace parent (« Messages de l'école ») est testé dans conversations.test.tsx.
 */

afterEach(() => vi.unstubAllGlobals());

const director = { id: 'sa', displayName: 'Direction' };

/** Message soumis (vue validation) : `id`, statut, versions. */
function message(id: string, overrides: Record<string, unknown> = {}) {
  return detail({
    id,
    status: 'PENDING_ADMIN_VALIDATION',
    version: 2,
    currentRevision: 1,
    draft: null,
    submittedAt: '2026-11-09T09:05:00.000Z',
    revisions: [
      {
        number: 1,
        text: `Remarque ${id}`,
        voiceFileId: `voice-${id}`,
        durationSeconds: 4,
        createdAt: '2026-11-09T09:05:00.000Z',
      },
    ],
    events: [
      {
        type: 'SUBMITTED',
        actor: teacher,
        revision: 1,
        reason: null,
        createdAt: '2026-11-09T09:05:00.000Z',
      },
    ],
    ...overrides,
  });
}

const APPROVED = message('pc0', {
  status: 'APPROVED',
  approvedRevision: 1,
  decidedBy: director,
  decidedAt: '2026-11-09T09:20:00.000Z',
});
/** Retourné une fois, corrigé puis soumis à nouveau : la version 2 est à examiner. */
const PENDING = message('pc1', {
  version: 4,
  currentRevision: 2,
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
      type: 'SUBMITTED',
      actor: teacher,
      revision: 1,
      reason: null,
      createdAt: '2026-11-09T09:05:00.000Z',
    },
    {
      type: 'RETURNED',
      actor: director,
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
const REJECTED = message('pc2', {
  status: 'REJECTED',
  decisionReason: 'Hors du cadre scolaire.',
  decidedBy: director,
});
const OTHER_PENDING = message('pc3');

const discussionOf = (messages: unknown[]) => ({
  key: 't1.s1.g1',
  teacher,
  student,
  guardian,
  messages,
});

const SUMMARIES = [
  {
    key: 't1.s1.g1',
    teacher,
    student,
    guardian,
    lastMessage: {
      id: 'pc3',
      status: 'PENDING_ADMIN_VALIDATION',
      preview: 'Lina a bien progressé',
      submittedAt: '2026-11-09T10:05:00.000Z',
    },
    firstPendingId: 'pc1',
    counts: {
      PENDING_ADMIN_VALIDATION: 2,
      APPROVED: 1,
      RETURNED_FOR_CORRECTION: 0,
      REJECTED: 1,
      CANCELLED: 0,
    },
    total: 4,
  },
  {
    key: 't2.s2.g2',
    teacher: { id: 't2', displayName: 'M. Professeur' },
    student: {
      id: 's2',
      firstName: 'Yassine',
      lastName: 'Trabelsi',
      class: { id: 'c2', name: '2e année Bleu' },
    },
    guardian: { id: 'g2', firstName: 'Karim', lastName: 'Trabelsi', relationship: 'Père' },
    lastMessage: {
      id: 'pc9',
      status: 'APPROVED',
      preview: 'Bravo pour le spectacle',
      submittedAt: '2026-11-08T10:05:00.000Z',
    },
    firstPendingId: null,
    counts: {
      PENDING_ADMIN_VALIDATION: 0,
      APPROVED: 1,
      RETURNED_FOR_CORRECTION: 0,
      REJECTED: 0,
      CANCELLED: 0,
    },
    total: 1,
  },
];

const LIST_URL = '/api/admin/parent-communications/discussions';
const bubble = (text: string) => screen.getByText(text).closest('article') as HTMLElement;

describe('Communications à valider (messagerie)', () => {
  const routes = [route('/communications-a-valider/:id?', <ValidationInboxPage />)];

  it('liste les discussions : enseignant, élève, aperçu et messages en attente ; filtres et recherche', async () => {
    const user = userEvent.setup();
    mockApi((call) => (call.url === LIST_URL ? json(200, SUMMARIES) : undefined));
    renderRoutes(routes, '/communications-a-valider');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Communications à valider' }),
    ).toBeVisible();

    // Par défaut : les discussions qui ont un message en attente, ouvertes sur le premier à examiner.
    const list = await screen.findByRole('list', { name: 'Discussions' });
    const rows = within(list).getAllByRole('link');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute('href', '/communications-a-valider/pc1');
    expect(rows[0]).toHaveTextContent('Mme Enseignante');
    expect(rows[0]).toHaveTextContent('Lina Ben Salah');
    expect(rows[0]).toHaveTextContent('Lina a bien progressé');
    expect(within(rows[0]!).getByLabelText('2 messages en attente')).toBeVisible();
    // Aucune conversation choisie : invitation à en sélectionner une.
    expect(screen.getByText('Sélectionnez une discussion')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Validés/ }));
    expect(screen.getByRole('button', { name: /Validés/ })).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(list)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual([
      expect.stringContaining('Mme Enseignante'),
      expect.stringContaining('M. Professeur'),
    ]);
    expect(within(list).getAllByRole('link')[1]).toHaveAttribute(
      'href',
      '/communications-a-valider/pc9',
    );

    await user.click(screen.getByRole('button', { name: /Rejetés/ }));
    expect(within(list).getAllByRole('link')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /Toutes/ }));
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher une discussion' }), 'bleu');
    expect(within(list).getAllByRole('link')).toHaveLength(1);
    expect(within(list).getByRole('link')).toHaveTextContent('Yassine Trabelsi');

    await user.clear(screen.getByRole('searchbox', { name: 'Rechercher une discussion' }));
    await user.type(
      screen.getByRole('searchbox', { name: 'Rechercher une discussion' }),
      'personne',
    );
    expect(within(list).queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText('Aucune discussion ne correspond.')).toBeVisible();
  });

  it('filtre par période de soumission : la liste est demandée au serveur pour ces dates', async () => {
    const user = userEvent.setup();
    const calls = mockApi((call) => {
      if (call.url === LIST_URL) return json(200, SUMMARIES);
      if (call.url === `${LIST_URL}?from=2026-11-01&to=2026-11-05`)
        return json(200, [SUMMARIES[0]]);
      if (call.url === `${LIST_URL}?from=2026-11-01`) return json(200, SUMMARIES);
      return undefined;
    });
    renderRoutes(routes, '/communications-a-valider');
    const list = await screen.findByRole('list', { name: 'Discussions' });
    await user.click(screen.getByRole('button', { name: /Toutes/ }));
    expect(within(list).getAllByRole('link').length).toBeGreaterThan(1);
    expect(screen.queryByRole('button', { name: 'Effacer la période' })).toBeNull();

    const period = screen.getByRole('group', { name: 'Période de soumission' });
    await user.type(within(period).getByLabelText('Du'), '2026-11-01');
    await waitFor(() => expect(calls.at(-1)!.url).toBe(`${LIST_URL}?from=2026-11-01`));
    await user.type(within(period).getByLabelText('Au'), '2026-11-05');
    await waitFor(() => expect(within(list).getAllByRole('link')).toHaveLength(1));
    expect(calls.map((c) => c.url)).toContain(`${LIST_URL}?from=2026-11-01&to=2026-11-05`);

    // Fin avant le début : message clair, aucune demande pour cette période.
    await user.clear(within(period).getByLabelText('Au'));
    await user.type(within(period).getByLabelText('Au'), '2026-10-01');
    expect(screen.getByText('La date de fin précède la date de début.')).toBeVisible();
    expect(calls.map((c) => c.url)).not.toContain(`${LIST_URL}?from=2026-11-01&to=2026-10-01`);

    await user.click(screen.getByRole('button', { name: 'Effacer la période' }));
    expect(within(period).getByLabelText('Du')).toHaveValue('');
    expect(within(period).getByLabelText('Au')).toHaveValue('');
    await waitFor(() => expect(within(list).getAllByRole('link').length).toBeGreaterThan(1));
  });

  it('ouvre la discussion : informations communes dans l’en-tête, une bulle par message avec son propre statut', async () => {
    mockApi((call) => {
      if (call.url === LIST_URL) return json(200, SUMMARIES);
      if (call.url === '/api/admin/parent-communications/pc1/discussion')
        return json(200, discussionOf([APPROVED, PENDING, REJECTED]));
      return undefined;
    });
    renderRoutes(routes, '/communications-a-valider/pc1');

    const title = await screen.findByRole('heading', { level: 2, name: 'Mme Enseignante' });
    const header = title.closest('header') as HTMLElement;
    expect(header).not.toBeNull();
    expect(header).toHaveTextContent('Lina Ben Salah');
    expect(header).toHaveTextContent('1ère année Violet');
    expect(header).toHaveTextContent('Sonia Ben Salah (Mère)');

    const messages = await screen.findByRole('list', { name: 'Messages de la discussion' });
    expect(within(messages).getAllByRole('article')).toHaveLength(3);
    expect(within(bubble('Remarque pc0')).getByText('Validé')).toBeVisible();
    expect(
      within(bubble('Version à examiner')).getByText('En attente de validation'),
    ).toBeVisible();
    expect(within(bubble('Remarque pc2')).getByText('Rejeté')).toBeVisible();
    expect(within(bubble('Remarque pc2')).getByText('Hors du cadre scolaire.')).toBeVisible();
    // Le nom de l'enseignant n'est pas répété dans les bulles.
    for (const article of within(messages).getAllByRole('article'))
      expect(article).not.toHaveTextContent('Mme Enseignante');

    // Version examinée : la dernière soumise ; la précédente reste dans l'historique du message.
    expect(within(bubble('Version à examiner')).getByText('Version 2')).toBeVisible();
    expect(screen.queryByText('Première version')).toBeNull();
    expect(bubble('Version à examiner').querySelector('audio')).toHaveAttribute(
      'src',
      '/api/files/v2',
    );

    // Actions seulement sur le message en attente.
    expect(screen.getAllByRole('button', { name: 'Valider' })).toHaveLength(1);
    expect(
      within(bubble('Version à examiner')).getByRole('button', { name: 'Valider' }),
    ).toBeVisible();
    expect(
      within(bubble('Remarque pc0')).queryByRole('button', {
        name: /Valider|Retourner|Plus d’actions/,
      }),
    ).toBeNull();
    expect(
      within(bubble('Remarque pc2')).queryByRole('button', {
        name: /Valider|Retourner|Plus d’actions/,
      }),
    ).toBeNull();

    const user = userEvent.setup();
    await user.click(
      within(bubble('Version à examiner')).getByRole('button', { name: 'Historique' }),
    );
    expect(within(bubble('Version à examiner')).getByText('Première version')).toBeVisible();
    expect(within(bubble('Version à examiner')).getByText('Précisez la matière.')).toBeVisible();
  });

  it('valide un seul message après confirmation, sans recharger ni toucher aux autres', async () => {
    const user = userEvent.setup();
    const calls = mockApi((call) => {
      if (call.url === LIST_URL) return json(200, SUMMARIES);
      if (call.url === '/api/admin/parent-communications/pc1/discussion')
        return json(200, discussionOf([APPROVED, PENDING, OTHER_PENDING]));
      if (call.url === '/api/admin/parent-communications/pc1/decision')
        return json(200, { ...PENDING, status: 'APPROVED', approvedRevision: 2, version: 5 });
      return undefined;
    });
    renderRoutes(routes, '/communications-a-valider/pc1');
    await user.click(
      within(await waitFor(() => bubble('Version à examiner'))).getByRole('button', {
        name: 'Valider',
      }),
    );
    // Confirmation dans la bulle : aucun appel avant.
    expect(calls.some((c) => c.url.endsWith('/decision'))).toBe(false);
    await user.click(
      within(bubble('Version à examiner')).getByRole('button', { name: 'Valider et publier' }),
    );
    await waitFor(() =>
      expect(within(bubble('Version à examiner')).getByText('Validé')).toBeVisible(),
    );
    expect(calls.filter((c) => c.url.endsWith('/decision')).map((c) => [c.url, c.body])).toEqual([
      [
        '/api/admin/parent-communications/pc1/decision',
        { action: 'APPROVE', revision: 2, version: 4 },
      ],
    ]);
    // Les autres messages gardent leur état ; la discussion n'est pas rechargée.
    expect(within(bubble('Remarque pc3')).getByText('En attente de validation')).toBeVisible();
    expect(within(bubble('Remarque pc3')).getByRole('button', { name: 'Valider' })).toBeVisible();
    expect(within(bubble('Remarque pc0')).getByText('Validé')).toBeVisible();
    expect(calls.filter((c) => c.url.endsWith('/discussion'))).toHaveLength(1);
  });

  it('retour pour correction et rejet : motif obligatoire, saisi dans la bulle du message', async () => {
    const user = userEvent.setup();
    const calls = mockApi((call) => {
      if (call.url === LIST_URL) return json(200, SUMMARIES);
      if (call.url === '/api/admin/parent-communications/pc1/discussion')
        return json(200, discussionOf([PENDING, OTHER_PENDING]));
      if (call.url === '/api/admin/parent-communications/pc1/decision')
        return json(200, {
          ...PENDING,
          status: 'RETURNED_FOR_CORRECTION',
          decisionReason: 'Merci de reformuler.',
          version: 5,
        });
      if (call.url === '/api/admin/parent-communications/pc3/decision')
        return json(200, {
          ...OTHER_PENDING,
          status: 'REJECTED',
          decisionReason: 'Propos inadaptés.',
          version: 3,
        });
      return undefined;
    });
    renderRoutes(routes, '/communications-a-valider/pc1');
    const first = await waitFor(() => bubble('Version à examiner'));
    await user.click(within(first).getByRole('button', { name: 'Retourner pour correction' }));
    await user.click(within(first).getByRole('button', { name: 'Retourner' }));
    expect(within(first).getByText('Indiquez ce que l’enseignant doit corriger.')).toBeVisible();
    expect(calls.some((c) => c.url.endsWith('/decision'))).toBe(false);
    await user.type(
      within(first).getByRole('textbox', { name: 'Motif du retour' }),
      'Merci de reformuler.',
    );
    await user.click(within(first).getByRole('button', { name: 'Retourner' }));
    await waitFor(() =>
      expect(within(bubble('Version à examiner')).getByText('À corriger')).toBeVisible(),
    );
    expect(calls.find((c) => c.url.endsWith('pc1/decision'))!.body).toEqual({
      action: 'RETURN',
      revision: 2,
      version: 4,
      reason: 'Merci de reformuler.',
    });
    expect(
      within(bubble('Version à examiner')).queryByRole('button', { name: 'Valider' }),
    ).toBeNull();

    // Rejet par le menu du message : motif obligatoire ; l'autre message reste retourné.
    await user.click(
      within(bubble('Remarque pc3')).getByRole('button', { name: 'Plus d’actions' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Rejeter' }));
    const other = bubble('Remarque pc3');
    expect(within(other).getByText(/Le rejet est définitif/)).toBeVisible();
    await user.click(within(other).getByRole('button', { name: 'Rejeter' }));
    expect(within(other).getByText('Indiquez le motif du rejet.')).toBeVisible();
    await user.type(
      within(other).getByRole('textbox', { name: 'Motif du rejet' }),
      'Propos inadaptés.',
    );
    await user.click(within(other).getByRole('button', { name: 'Rejeter' }));
    await waitFor(() => expect(within(bubble('Remarque pc3')).getByText('Rejeté')).toBeVisible());
    expect(calls.find((c) => c.url.endsWith('pc3/decision'))!.body).toEqual({
      action: 'REJECT',
      revision: 1,
      version: 2,
      reason: 'Propos inadaptés.',
    });
    expect(within(bubble('Version à examiner')).getByText('À corriger')).toBeVisible();
  });

  it('l’auteur d’un message ne le modère pas lui-même', async () => {
    mockApi((call) => {
      if (call.url === '/api/auth/me') return json(200, { ...teacher, permissions: [] });
      if (call.url === LIST_URL) return json(200, SUMMARIES);
      if (call.url === '/api/admin/parent-communications/pc1/discussion')
        return json(200, discussionOf([PENDING]));
      return undefined;
    });
    renderRoutes(routes, '/communications-a-valider/pc1');
    const own = await waitFor(() => bubble('Version à examiner'));
    expect(await within(own).findByText(/un autre responsable doit le valider/)).toBeVisible();
    expect(within(own).queryByRole('button', { name: 'Valider' })).toBeNull();
  });

  it('message d’un parent : bulle du parent, nom une seule fois hors des bulles, validation transmise à l’enseignant', async () => {
    const user = userEvent.setup();
    const FROM_PARENT = message('pc5', {
      author: 'PARENT',
      revisions: [
        {
          number: 1,
          text: 'Lina sera absente vendredi.',
          voiceFileId: null,
          durationSeconds: null,
          createdAt: '2026-11-09T11:05:00.000Z',
        },
      ],
    });
    const calls = mockApi((call) => {
      if (call.url === LIST_URL) return json(200, SUMMARIES);
      if (call.url === '/api/admin/parent-communications/pc5/discussion')
        return json(200, discussionOf([APPROVED, FROM_PARENT]));
      if (call.url === '/api/admin/parent-communications/pc5/decision')
        return json(200, { ...FROM_PARENT, status: 'APPROVED', approvedRevision: 1, version: 3 });
      return undefined;
    });
    renderRoutes(routes, '/communications-a-valider/pc5');
    const parentBubble = await waitFor(() => bubble('Lina sera absente vendredi.'));
    // Message écrit seulement : pas de lecteur vocal.
    expect(parentBubble.querySelector('audio')).toBeNull();
    expect(parentBubble).not.toHaveTextContent('Sonia Ben Salah');
    const messages = screen.getByRole('list', { name: 'Messages de la discussion' });
    expect(within(messages).getAllByText('Sonia Ben Salah (Mère), parent')).toHaveLength(1);
    await user.click(within(parentBubble).getByRole('button', { name: 'Valider' }));
    expect(within(parentBubble).getByText(/Transmettre ce message à l’enseignant/)).toBeVisible();
    await user.click(within(parentBubble).getByRole('button', { name: 'Valider et transmettre' }));
    await waitFor(() =>
      expect(within(bubble('Lina sera absente vendredi.')).getByText('Validé')).toBeVisible(),
    );
    expect(calls.filter((c) => c.url.endsWith('/decision')).map((c) => c.body)).toEqual([
      { action: 'APPROVE', revision: 1, version: 2 },
    ]);
  });

  it('erreur de chargement de la discussion : message et nouvel essai', async () => {
    mockApi((call) => (call.url === LIST_URL ? json(200, SUMMARIES) : undefined));
    renderRoutes(routes, '/communications-a-valider/pc1');
    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeVisible();
  });
});
