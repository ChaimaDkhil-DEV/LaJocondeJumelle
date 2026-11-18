import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from '../../src/features/admin/adminRoutes';

/**
 * T046 — 020, FR-018 : seuil de retard et délai de tolérance des séances, sur la page « Réglages » du super
 * administrateur. Envoyés quand ils changent ; le refus du serveur (seuil au-delà de la tolérance) s'affiche
 * sous le champ.
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

const THRESHOLD = 'Emplois du temps : arrivée à l’heure jusqu’à (minutes après le début)';
const TOLERANCE = 'Emplois du temps : « non arrivé » après (minutes, délai de tolérance)';

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

describe('Réglages — seuil de retard et délai de tolérance (020)', () => {
  const WITH = { ...SETTINGS, attendanceLateThresholdMinutes: 5, attendanceToleranceMinutes: 10 };

  it('affiche les valeurs du serveur et n’envoie que ce qui change', async () => {
    const user = userEvent.setup();
    const { puts } = setup(WITH);
    expect(await screen.findByLabelText(THRESHOLD)).toHaveValue('5');
    const tolerance = screen.getByLabelText(TOLERANCE);
    expect(tolerance).toHaveValue('10');
    await user.clear(tolerance);
    await user.type(tolerance, '15');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));
    await waitFor(() => expect(puts).toEqual([{ attendanceToleranceMinutes: 15 }]));
  });

  it('seuil au-delà de la tolérance : le refus du serveur s’affiche sous le champ', async () => {
    const user = userEvent.setup();
    setup(
      WITH,
      json(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Certaines informations sont manquantes ou invalides.',
          details: { fields: [{ field: 'attendanceLateThresholdMinutes', messages: ['Le seuil de retard ne peut pas dépasser le délai de tolérance.'] }] },
        },
      }),
    );
    const field = await screen.findByLabelText(THRESHOLD);
    await user.clear(field);
    await user.type(field, '20');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));
    expect(await screen.findByText('Le seuil de retard ne peut pas dépasser le délai de tolérance.')).toBeVisible();
  });
});
