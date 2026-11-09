import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDateTime } from '../../src/components/format';
import { NotificationsSection } from '../../src/features/push/NotificationsSection';
import { installBrowser, resetBrowser } from './push-env';

/**
 * 014, T065 (US5, FR-003, contracts/ui.md) : bloc « Mes appareils » — appareils abonnés du compte, appareil
 * courant signalé, retrait avec confirmation, état vide.
 */

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const DEVICES = [
  { id: 'd1', deviceLabel: 'iPhone · Safari', createdAt: '2026-11-02T07:41:00.000Z', lastUsedAt: '2026-11-08T07:35:00.000Z', current: false },
  { id: 'd2', deviceLabel: 'Windows · Edge', createdAt: '2026-10-20T12:00:00.000Z', lastUsedAt: '2026-11-09T08:00:00.000Z', current: true },
];

function setup(initial = DEVICES) {
  installBrowser({ supported: false });
  let devices = [...initial];
  const deletes: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (url === '/api/push/subscriptions' && method === 'GET') return json(200, devices);
      if (url.startsWith('/api/push/subscriptions/') && method === 'DELETE') {
        const id = url.split('/').at(-1)!;
        deletes.push(id);
        devices = devices.filter((d) => d.id !== id);
        return json(204);
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
  return { deletes };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetBrowser();
});

describe('Section « Notifications » — mes appareils (US5)', () => {
  it('liste les appareils abonnés, l’appareil courant signalé, avec leurs dates', async () => {
    setup();
    const list = await screen.findByRole('list', { name: 'Mes appareils' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('iPhone · Safari');
    expect(items[0]).toHaveTextContent(`Activé le ${formatDateTime(DEVICES[0].createdAt)}`);
    expect(items[0]).toHaveTextContent(`Dernière utilisation le ${formatDateTime(DEVICES[0].lastUsedAt)}`);
    expect(within(items[0]).queryByText('Cet appareil')).toBeNull();
    expect(within(items[1]).getByText('Cet appareil')).toBeVisible();
  });

  it('retire un appareil après confirmation, puis met la liste à jour', async () => {
    const user = userEvent.setup();
    const { deletes } = setup();
    await user.click(await screen.findByRole('button', { name: 'Retirer iPhone · Safari' }));
    const dialog = await screen.findByRole('dialog', { name: 'Retirer cet appareil ?' });
    expect(deletes).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Retirer' }));
    await waitFor(() => expect(deletes).toEqual(['d1']));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Mes appareils' })).getAllByRole('listitem')).toHaveLength(1));
    expect(screen.queryByText('iPhone · Safari')).toBeNull();
  });

  it('annuler la confirmation ne retire rien', async () => {
    const user = userEvent.setup();
    const { deletes } = setup();
    await user.click(await screen.findByRole('button', { name: 'Retirer Windows · Edge' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Annuler' }));
    expect(deletes).toEqual([]);
  });

  it('aucun appareil : message d’état vide', async () => {
    setup([]);
    expect(await screen.findByText('Aucun appareil abonné.')).toBeVisible();
  });
});
