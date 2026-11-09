import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationsSection } from '../../src/features/push/NotificationsSection';
import { installBrowser, resetBrowser, SERVER_KEY, type BrowserOptions } from './push-env';

/**
 * 014, T047 (US3, FR-009, SC-004, contracts/ui.md) : quatre interrupteurs de catégories, enregistrés sur
 * le compte dès le changement ; visibles quel que soit l'état du push sur l'appareil.
 */

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const PREFERENCES = {
  categories: { urgent: true, coverage: true, unfilled: true, attendance: true },
  urgentSound: true,
  urgentSoundSet: false,
};

function setup({ browser = {}, enabled = true, patchFails = false }: { browser?: BrowserOptions; enabled?: boolean; patchFails?: boolean } = {}) {
  installBrowser(browser);
  const patches: unknown[] = [];
  let stored = structuredClone(PREFERENCES);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (url === '/api/push/config') return json(200, { enabled, publicKey: enabled ? SERVER_KEY : null });
      if (url === '/api/notifications/preferences' && method === 'GET') return json(200, stored);
      if (url === '/api/notifications/preferences' && method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as { categories?: Record<string, boolean>; urgentSound?: boolean };
        patches.push(body);
        if (patchFails) return json(503, { error: { code: 'INTERNAL_ERROR', message: 'Une erreur inattendue est survenue. Réessayez plus tard.' } });
        stored = { ...stored, categories: { ...stored.categories, ...body.categories } };
        return json(200, stored);
      }
      return json(200, []);
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NotificationsSection />
    </QueryClientProvider>,
  );
  return { patches };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetBrowser();
});

const CATEGORIES: Array<[string, string]> = [
  ['Urgent', 'Demandes de travail urgentes.'],
  ['Couverture', 'Affectations, classes vides, retards et absences signalés, relèves.'],
  ['Garde non pourvue', 'Gardes restées sans surveillant et alertes non traitées.'],
  ['Pointage', 'Arrivée de l’enseignant sur votre garde et anomalies de pointage.'],
];

describe('Section « Notifications » — catégories (US3)', () => {
  it('quatre interrupteurs libellés, avec leur description, tous actifs par défaut', async () => {
    setup();
    for (const [label, description] of CATEGORIES) {
      const toggle = await screen.findByLabelText(label);
      expect(toggle).toBeChecked();
      expect(toggle).toHaveAccessibleDescription(description);
    }
    expect(screen.getByText('Ces choix s’appliquent à tous vos appareils abonnés.')).toBeVisible();
  });

  it('désactiver « Couverture » : un seul geste, enregistré aussitôt sur le compte (SC-004)', async () => {
    const user = userEvent.setup();
    const { patches } = setup();
    const toggle = await screen.findByLabelText('Couverture');
    await waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    await waitFor(() => expect(patches).toEqual([{ categories: { coverage: false } }]));
    expect(await screen.findByText('Préférence enregistrée.')).toBeVisible();
  });

  it('échec de l’enregistrement : la valeur revient et un message le dit', async () => {
    const user = userEvent.setup();
    setup({ patchFails: true });
    const toggle = await screen.findByLabelText('Pointage');
    await waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);
    expect(await screen.findByText('La préférence n’a pas pu être enregistrée. Réessayez.')).toBeVisible();
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it.each([
    ['push désactivé par l’établissement', { enabled: false }],
    ['appareil non pris en charge', { browser: { supported: false } }],
  ])('%s : catégories visibles et modifiables', async (_label, options) => {
    setup(options);
    const toggle = await screen.findByLabelText('Urgent');
    await waitFor(() => expect(toggle).toBeEnabled());
  });
});
