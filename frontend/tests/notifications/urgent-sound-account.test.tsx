import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUrgentSound } from '../../src/features/notifications/useUrgentSound';
import { NotificationsSection } from '../../src/features/push/NotificationsSection';
import { installBrowser, resetBrowser } from '../push/push-env';

/**
 * 014, T049 (FR-009, NC-6) : le signal sonore des urgences est une préférence du compte, identique sur
 * tous les appareils. Une valeur « désactivé » restée dans le navigateur est reprise une fois si le compte
 * n'a jamais été réglé ; la clé locale est ensuite supprimée dans tous les cas.
 */

const LOCAL_KEY = 'lajoconde.signalSonoreUrgences';

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function serve(initial: { urgentSound: boolean; urgentSoundSet: boolean }) {
  const patches: unknown[] = [];
  let stored = { categories: { urgent: true, coverage: true, unfilled: true, attendance: true }, ...initial };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (url === '/api/push/config') return json(200, { enabled: false, publicKey: null });
      if (url === '/api/notifications/preferences' && method === 'GET') return json(200, stored);
      if (url === '/api/notifications/preferences' && method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as { urgentSound?: boolean };
        patches.push(body);
        if (body.urgentSound !== undefined) stored = { ...stored, urgentSound: body.urgentSound, urgentSoundSet: true };
        return json(200, stored);
      }
      return json(200, []);
    }),
  );
  return { patches };
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  resetBrowser();
  localStorage.clear();
});

describe('useUrgentSound — préférence du compte (NC-6)', () => {
  it('lit la valeur du compte', async () => {
    serve({ urgentSound: false, urgentSoundSet: true });
    const { result } = renderHook(() => useUrgentSound(), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(result.current.enabled).toBe(false));
  });

  it('changer le son l’enregistre sur le compte', async () => {
    const { patches } = serve({ urgentSound: true, urgentSoundSet: false });
    const { result } = renderHook(() => useUrgentSound(), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(result.current.enabled).toBe(true));
    act(() => result.current.setEnabled(false));
    await waitFor(() => expect(patches).toEqual([{ urgentSound: false }]));
    expect(result.current.enabled).toBe(false);
  });

  it('valeur locale « off » et compte jamais réglé : reprise une seule fois, clé locale supprimée', async () => {
    localStorage.setItem(LOCAL_KEY, 'off');
    const { patches } = serve({ urgentSound: true, urgentSoundSet: false });
    const client = newClient();
    const { result, rerender } = renderHook(() => useUrgentSound(), { wrapper: wrapper(client) });
    await waitFor(() => expect(patches).toEqual([{ urgentSound: false }]));
    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
    rerender();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(patches).toHaveLength(1);
  });

  it('valeur locale « off » mais compte déjà réglé : rien n’est repris, clé locale supprimée', async () => {
    localStorage.setItem(LOCAL_KEY, 'off');
    const { patches } = serve({ urgentSound: true, urgentSoundSet: true });
    const { result } = renderHook(() => useUrgentSound(), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(localStorage.getItem(LOCAL_KEY)).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(patches).toEqual([]);
    expect(result.current.enabled).toBe(true);
  });

  it('l’interrupteur de « Mon profil » partage la même valeur', async () => {
    const user = userEvent.setup();
    installBrowser({ supported: false });
    const { patches } = serve({ urgentSound: true, urgentSoundSet: false });
    const client = newClient();
    function Bell() {
      const sound = useUrgentSound();
      return <p>{sound.enabled ? 'son actif' : 'son coupé'}</p>;
    }
    render(
      <QueryClientProvider client={client}>
        <Bell />
        <NotificationsSection />
      </QueryClientProvider>,
    );
    const toggle = await screen.findByLabelText('Signal sonore pour les urgences');
    await waitFor(() => expect(toggle).toBeChecked());
    expect(screen.getByText('son actif')).toBeVisible();
    await user.click(toggle);
    await waitFor(() => expect(patches).toEqual([{ urgentSound: false }]));
    expect(await screen.findByText('son coupé')).toBeVisible();
    expect(toggle).not.toBeChecked();
  });
});
