import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CommunicationEditorPage } from '../../src/features/parent-communications/CommunicationEditorPage';
import { TeacherCommunicationsPage } from '../../src/features/parent-communications/TeacherCommunicationsPage';
import {
  detail,
  guardian,
  json,
  mockApi,
  renderRoutes,
  route,
  student,
  type Call,
} from './helpers';

/**
 * 015 (US1, US4) — « Communication avec les parents » : élève de ses classes et représentant lié,
 * remarque et vocal obligatoires pour soumettre, confirmation, lecture seule en attente, motif de retour.
 */

// Le micro n'existe pas dans jsdom : un enregistrement simulé remplace l'enregistreur.
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

const routes = [
  route('/communications-parents', <TeacherCommunicationsPage />),
  route('/communications-parents/nouvelle', <CommunicationEditorPage />),
  route('/communications-parents/:id', <CommunicationEditorPage />),
];

const STUDENTS = [
  { ...student, guardians: [guardian] },
  {
    id: 's2',
    firstName: 'Adam',
    lastName: 'Kefi',
    class: { id: 'c1', name: '1ère année Violet' },
    guardians: [{ id: 'g2', firstName: 'Karim', lastName: 'Kefi', relationship: 'Père' }],
  },
];

function api(extra: (call: Call) => Response | undefined = () => undefined) {
  return mockApi((call) => {
    const custom = extra(call);
    if (custom) return custom;
    if (call.url === '/api/settings/client')
      return json(200, { voiceMaxSeconds: 120, draftsEnabled: true });
    if (call.url === '/api/parent-communications/students') return json(200, STUDENTS);
    return undefined;
  });
}

beforeAll(() => {
  URL.createObjectURL ??= vi.fn(() => 'blob:x');
});
afterEach(() => vi.unstubAllGlobals());

describe('Communication avec les parents — enseignant', () => {
  it('liste ses communications avec leur statut et propose d’en créer une', async () => {
    api((call) =>
      call.url === '/api/parent-communications'
        ? json(200, [
            detail({ status: 'RETURNED_FOR_CORRECTION', decisionReason: 'Précisez la matière.' }),
            detail({ id: 'pc2', status: 'APPROVED' }),
          ])
        : undefined,
    );
    renderRoutes(routes, '/communications-parents');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Communication avec les parents' }),
    ).toBeVisible();
    expect(await screen.findByText('Retournée pour correction')).toBeVisible();
    expect(screen.getByText('Approuvée et publiée')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Nouvelle communication' })).toHaveAttribute(
      'href',
      '/communications-parents/nouvelle',
    );
  });

  it('nouvelle communication : représentants de l’élève choisi, brouillon puis soumission confirmée', async () => {
    const user = userEvent.setup();
    const calls = api((call) => {
      if (call.url === '/api/files' && call.method === 'POST')
        return json(201, { id: 'v9', kind: 'VOICE', mimeType: 'audio/mp4', sizeBytes: 10 });
      if (call.url === '/api/parent-communications' && call.method === 'POST')
        return json(
          201,
          detail({
            id: 'pc9',
            draft: { text: 'Bravo pour ce trimestre.', voice: { id: 'v9', durationSeconds: 3 } },
          }),
        );
      if (call.url === '/api/parent-communications/pc9/submit')
        return json(
          200,
          detail({ id: 'pc9', status: 'PENDING_ADMIN_VALIDATION', version: 2, currentRevision: 1 }),
        );
      if (call.url === '/api/parent-communications/pc9')
        return json(
          200,
          detail({
            id: 'pc9',
            draft: { text: 'Bravo pour ce trimestre.', voice: { id: 'v9', durationSeconds: 3 } },
          }),
        );
      return undefined;
    });
    renderRoutes(routes, '/communications-parents/nouvelle');

    await user.click(await screen.findByRole('combobox', { name: 'Élève' }));
    await user.click(screen.getByRole('option', { name: /Adam Kefi/ }));
    await user.click(screen.getByRole('combobox', { name: 'Représentant destinataire' }));
    expect(screen.getByRole('option', { name: /Karim Kefi/ })).toBeVisible();
    expect(screen.queryByRole('option', { name: /Sonia/ })).toBeNull();
    await user.click(screen.getByRole('option', { name: /Karim Kefi/ }));
    await user.type(
      screen.getByRole('textbox', { name: 'Remarque écrite' }),
      'Bravo pour ce trimestre.',
    );
    await user.click(screen.getByRole('button', { name: 'Enregistrer le vocal (simulé)' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));

    await waitFor(() =>
      expect(calls.some((c) => c.url === '/api/parent-communications' && c.method === 'POST')).toBe(
        true,
      ),
    );
    const created = calls.find(
      (c) => c.url === '/api/parent-communications' && c.method === 'POST',
    )!;
    expect(created.body).toEqual({
      studentId: 's2',
      guardianId: 'g2',
      text: 'Bravo pour ce trimestre.',
      voiceFileId: 'v9',
    });
    // Brouillon enregistré : la page suit désormais la communication créée.
    expect(await screen.findByText('Brouillon enregistré.')).toBeVisible();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Communication pour Lina Ben Salah' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Soumettre à l’administration' }));
    const dialog = await screen.findByRole('dialog', { name: 'Soumettre à l’administration ?' });
    await user.click(within(dialog).getByRole('button', { name: 'Soumettre' }));
    await waitFor(() =>
      expect(calls.some((c) => c.url === '/api/parent-communications/pc9/submit')).toBe(true),
    );
    expect(calls.find((c) => c.url === '/api/parent-communications/pc9/submit')!.body).toEqual({
      version: 1,
    });
  });

  it('sans remarque ni vocal : la soumission est refusée avec un message clair, sans appel', async () => {
    const user = userEvent.setup();
    const calls = api((call) =>
      call.url === '/api/parent-communications/pc1'
        ? json(200, detail({ draft: { text: '', voice: null } }))
        : undefined,
    );
    renderRoutes(routes, '/communications-parents/pc1');
    await user.click(await screen.findByRole('button', { name: 'Soumettre à l’administration' }));
    expect(
      await screen.findByText('Ajoutez la remarque écrite et le message vocal avant de soumettre.'),
    ).toBeVisible();
    expect(calls.some((c) => c.url.endsWith('/submit'))).toBe(false);
  });

  it('en attente de validation : lecture seule, version soumise affichée', async () => {
    api((call) =>
      call.url === '/api/parent-communications/pc1'
        ? json(
            200,
            detail({
              status: 'PENDING_ADMIN_VALIDATION',
              currentRevision: 1,
              revisions: [
                {
                  number: 1,
                  text: 'Texte soumis',
                  voiceFileId: 'v1',
                  durationSeconds: 4,
                  createdAt: '2026-11-09T09:05:00.000Z',
                },
              ],
            }),
          )
        : undefined,
    );
    renderRoutes(routes, '/communications-parents/pc1');
    expect(await screen.findByText('En attente de validation')).toBeVisible();
    expect(screen.getByText('Texte soumis')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Remarque écrite' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Soumettre à l’administration' })).toBeNull();
  });

  it('retournée : le motif est visible et une nouvelle version peut être soumise', async () => {
    const user = userEvent.setup();
    const calls = api((call) => {
      if (call.url === '/api/parent-communications/pc1' && call.method === 'GET') {
        return json(
          200,
          detail({
            status: 'RETURNED_FOR_CORRECTION',
            version: 3,
            currentRevision: 1,
            decisionReason: 'Précisez la matière concernée.',
          }),
        );
      }
      if (call.url === '/api/parent-communications/pc1' && call.method === 'PATCH')
        return json(
          200,
          detail({ status: 'RETURNED_FOR_CORRECTION', version: 4, currentRevision: 1 }),
        );
      if (call.url === '/api/parent-communications/pc1/submit')
        return json(
          200,
          detail({ status: 'PENDING_ADMIN_VALIDATION', version: 5, currentRevision: 2 }),
        );
      return undefined;
    });
    renderRoutes(routes, '/communications-parents/pc1');
    expect(await screen.findByText('Précisez la matière concernée.')).toBeVisible();
    const remark = screen.getByRole('textbox', { name: 'Remarque écrite' });
    await user.clear(remark);
    await user.type(remark, 'Progrès en mathématiques.');
    await user.click(screen.getByRole('button', { name: 'Soumettre à l’administration' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Soumettre' }),
    );
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/submit'))).toBe(true));
    // Le texte modifié est enregistré avant la soumission, sur la version lue.
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      version: 3,
      text: 'Progrès en mathématiques.',
    });
    expect(calls.find((c) => c.url.endsWith('/submit'))!.body).toEqual({ version: 4 });
  });
});
