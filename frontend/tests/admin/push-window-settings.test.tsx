import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from '../../src/features/admin/adminRoutes';

/**
 * 014, T057 (US4, FR-010, NC-10, contracts/ui.md) : groupe « Plage d’envoi des notifications push » de la
 * page « Réglages » du super administrateur : jours (cases), heures de début et de fin, aide, état du push ;
 * envoyé avec le bouton existant ; erreur du serveur affichée sous « Heure de fin ».
 */

type Handler = (url: string, method: string) => Response | undefined;

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

function setup(handler: Handler = () => undefined, pushEnabled = true) {
  const puts: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (url === '/api/admin/settings' && method === 'PUT') puts.push(JSON.parse(String(init.body)));
      const custom = handler(url, method);
      if (custom) return custom;
      if (url === '/api/auth/me') return json(200, SUPER_ADMIN);
      if (url === '/api/admin/settings' && method === 'GET') return json(200, SETTINGS);
      if (url === '/api/admin/settings' && method === 'PUT') return json(200, { ...SETTINGS, ...(puts.at(-1) as object) });
      if (url === '/api/admin/role-permissions') return json(200, { EMPLOYEE: [], ADMIN: [] });
      if (url === '/api/push/config') return json(200, { enabled: pushEnabled, publicKey: pushEnabled ? 'BKey' : null });
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

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

afterEach(() => vi.unstubAllGlobals());

describe('Réglages — plage d’envoi des notifications push (US4)', () => {
  it('groupe avec légende, sept jours, heures de début et de fin, aide et état du push', async () => {
    setup();
    const days = await screen.findByRole('group', { name: 'Jours d’envoi des notifications push' });
    const boxes = within(days).getAllByRole('checkbox');
    expect(boxes.map((b) => b.closest('label')?.textContent)).toEqual(DAYS);
    expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([true, true, true, true, true, false, false]);
    expect(screen.getByLabelText('Heure de début (HH:MM)')).toHaveValue('07:30');
    expect(screen.getByLabelText('Heure de fin (HH:MM)')).toHaveValue('18:30');
    expect(
      screen.getByText(
        'Heure de l’école. En dehors de cette plage, aucune notification push n’est envoyée ni différée ; les notifications restent dans l’application. Les signalements de retard arrivent souvent avant 07:30.',
      ),
    ).toBeVisible();
    expect(await screen.findByText('Notifications push : activées')).toBeVisible();
  });

  it('push désactivé : l’état le dit', async () => {
    setup(undefined, false);
    expect(await screen.findByText('Notifications push : désactivées (clés non configurées)')).toBeVisible();
  });

  it('n’envoie que la plage modifiée, avec le bouton existant', async () => {
    const user = userEvent.setup();
    const { puts } = setup();
    await user.click(await screen.findByRole('checkbox', { name: 'Samedi' }));
    const start = screen.getByLabelText('Heure de début (HH:MM)');
    await user.clear(start);
    await user.type(start, '06:45');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));
    await waitFor(() =>
      expect(puts).toEqual([{ pushWindowDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], pushWindowStart: '06:45' }]),
    );
    expect(await screen.findByText('Réglages enregistrés.')).toBeVisible();
  });

  it('contrôle avant envoi : fin avant le début, aucun jour', async () => {
    const user = userEvent.setup();
    const { puts } = setup();
    const end = await screen.findByLabelText('Heure de fin (HH:MM)');
    await user.clear(end);
    await user.type(end, '07:00');
    for (const day of ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']) await user.click(screen.getByRole('checkbox', { name: day }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));
    expect(await screen.findByText('L’heure de fin doit être après l’heure de début.')).toBeVisible();
    expect(screen.getByText('Choisissez au moins un jour.')).toBeVisible();
    expect(puts).toEqual([]);
  });

  it('erreur du serveur affichée sous « Heure de fin »', async () => {
    const user = userEvent.setup();
    setup((url, method) =>
      url === '/api/admin/settings' && method === 'PUT'
        ? json(400, {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Certaines informations sont manquantes ou invalides.',
              details: { fields: [{ field: 'pushWindowEnd', messages: ['L’heure de fin doit être après l’heure de début.'] }] },
            },
          })
        : undefined,
    );
    const end = await screen.findByLabelText('Heure de fin (HH:MM)');
    await user.clear(end);
    await user.type(end, '19:00');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));
    expect(await screen.findByText('L’heure de fin doit être après l’heure de début.')).toBeVisible();
    expect(end).toHaveAttribute('aria-invalid', 'true');
  });
});
