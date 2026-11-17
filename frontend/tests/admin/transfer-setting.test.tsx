import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from '../../src/features/admin/adminRoutes';

/**
 * T053 — 018, FR-018 : réglage « Délai de réponse aux transferts entre administrateurs » de la page
 * « Réglages » du super administrateur. Affiché quand le serveur le renvoie, envoyé seul quand il change.
 */

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const SUPER_ADMIN = { id: 's1', displayName: 'Direction', role: 'SUPER_ADMIN', permissions: [], mustChangePassword: false };

const SETTINGS = {
  voiceMaxSeconds: 180,
  voiceMaxBytes: 5 * 1024 * 1024,
  attachmentMaxBytes: 10 * 1024 * 1024,
  attachmentMaxPerMessage: 5,
  allowedPhotoTypes: ['image/jpeg', 'image/png', 'image/webp'],
  allowedDocumentTypes: ['application/pdf'],
  draftsEnabled: true,
  deadlineWarnPercent: 20,
  sessionIdleMinutes: 60,
  sessionMaxHours: 12,
  coverageUrgencyThresholdMinutes: 60,
  coverageEscalationMinutes: 5,
  coverageMorningReminderTime: '07:00',
  coverageCloseReminderMinutes: 10,
  coverageCloseEscalationMinutes: 10,
  coverageSupportReminderMinutes: 10,
  coverageSupportReminderMax: 3,
  coverageRetentionMonths: 12,
  pushWindowDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  pushWindowStart: '07:30',
  pushWindowEnd: '18:30',
};

const LABEL = 'Délai de réponse aux transferts entre administrateurs (minutes)';

function setup(settings: Record<string, unknown>, putResponse?: Response) {
  const puts: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (url === '/api/auth/me') return json(200, SUPER_ADMIN);
      if (url === '/api/admin/settings' && method === 'GET') return json(200, settings);
      if (url === '/api/admin/settings' && method === 'PUT') {
        puts.push(JSON.parse(String(init.body)));
        return putResponse ?? json(200, { ...settings, ...(puts.at(-1) as object) });
      }
      if (url === '/api/admin/role-permissions') return json(200, { EMPLOYEE: [], ADMIN: [] });
      if (url === '/api/push/config') return json(200, { enabled: false, publicKey: null });
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  const router = createMemoryRouter(adminRoutes, { initialEntries: ['/admin/reglages'] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { puts };
}

afterEach(() => vi.unstubAllGlobals());

describe('Réglages — délai de réponse aux transferts (018)', () => {
  it('affiche la valeur du serveur et n’envoie que ce réglage quand il change', async () => {
    const user = userEvent.setup();
    const { puts } = setup({ ...SETTINGS, transferResponseMinutes: 120 });
    const field = await screen.findByLabelText(LABEL);
    expect(field).toHaveValue('120');
    await user.clear(field);
    await user.type(field, '45');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));
    await waitFor(() => expect(puts).toEqual([{ transferResponseMinutes: 45 }]));
    expect(await screen.findByText('Réglages enregistrés.')).toBeVisible();
  });

  it('refuse une saisie qui n’est pas un nombre entier, sans rien envoyer', async () => {
    const user = userEvent.setup();
    const { puts } = setup({ ...SETTINGS, transferResponseMinutes: 120 });
    const field = await screen.findByLabelText(LABEL);
    await user.clear(field);
    await user.type(field, 'deux heures');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));
    expect(await screen.findByText('Nombre entier attendu.')).toBeVisible();
    expect(puts).toEqual([]);
  });

  it('affiche le refus du serveur (valeur hors bornes) sous le champ', async () => {
    const user = userEvent.setup();
    setup(
      { ...SETTINGS, transferResponseMinutes: 120 },
      json(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Certaines informations sont manquantes ou invalides.',
          details: { fields: [{ field: 'transferResponseMinutes', messages: ['Nombre entier entre 5 et 2880 minutes attendu.'] }] },
        },
      }),
    );
    const field = await screen.findByLabelText(LABEL);
    await user.clear(field);
    await user.type(field, '2');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));
    expect(await screen.findByText('Nombre entier entre 5 et 2880 minutes attendu.')).toBeVisible();
  });

  it('serveur qui ne renvoie pas ce réglage : le champ est absent et n’est jamais envoyé', async () => {
    const user = userEvent.setup();
    const { puts } = setup(SETTINGS);
    const other = await screen.findByLabelText('Déconnexion après inactivité (minutes)');
    expect(screen.queryByLabelText(LABEL)).toBeNull();
    await user.clear(other);
    await user.type(other, '30');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));
    await waitFor(() => expect(puts).toEqual([{ sessionIdleMinutes: 30 }]));
  });
});
