import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationsSection } from '../../src/features/push/NotificationsSection';
import { pushWindowText } from '../../src/features/push/pushWindowText';
import { installBrowser, resetBrowser } from './push-env';

/**
 * 014, T059 (US4, FR-010, contracts/ui.md) : la section « Notifications » de « Mon profil » rappelle la plage
 * d'envoi réglée par l'établissement, lue dans les réglages publics (GET /api/settings/client).
 */

const OUTSIDE = 'En dehors, les notifications restent dans l’application.';

describe('pushWindowText', () => {
  it.each([
    [['MON', 'TUE', 'WED', 'THU', 'FRI'], '07:30', '18:30', `Envoi du lundi au vendredi, de 07:30 à 18:30 (heure de l’école). ${OUTSIDE}`],
    [['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], '00:00', '23:59', `Envoi tous les jours, de 00:00 à 23:59 (heure de l’école). ${OUTSIDE}`],
    [['SAT', 'MON', 'WED'], '08:00', '12:00', `Envoi le lundi, le mercredi et le samedi, de 08:00 à 12:00 (heure de l’école). ${OUTSIDE}`],
    [['TUE'], '08:00', '12:00', `Envoi le mardi, de 08:00 à 12:00 (heure de l’école). ${OUTSIDE}`],
    [['MON', 'TUE'], '08:00', '12:00', `Envoi le lundi et le mardi, de 08:00 à 12:00 (heure de l’école). ${OUTSIDE}`],
    [['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], '07:00', '19:00', `Envoi du lundi au samedi, de 07:00 à 19:00 (heure de l’école). ${OUTSIDE}`],
  ])('%j %s–%s', (days, start, end, expected) => {
    expect(pushWindowText(days, start, end)).toBe(expected);
  });
});

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetBrowser();
});

describe('Section « Notifications » — plage d’envoi', () => {
  it('rappelle la plage réglée par l’établissement', async () => {
    installBrowser({ supported: false });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/settings/client') {
          return json(200, { pushWindowDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], pushWindowStart: '07:00', pushWindowEnd: '19:00' });
        }
        if (url === '/api/push/config') return json(200, { enabled: true, publicKey: 'BKey' });
        return json(200, []);
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <NotificationsSection />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(`Envoi du lundi au samedi, de 07:00 à 19:00 (heure de l’école). ${OUTSIDE}`)).toBeVisible();
  });
});
