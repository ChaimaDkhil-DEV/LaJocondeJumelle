import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAdminUsers } from '../../src/features/admin/api';

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const user = (id: string) => ({ id, displayName: `Compte ${id}` });

afterEach(() => vi.unstubAllGlobals());

describe('useAdminUsers (liste paginée par curseur)', () => {
  it('lit toutes les pages et renvoie la liste entière, dans l’ordre', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        const params = new URL(url, 'http://localhost').searchParams;
        const cursor = params.get('cursor');
        if (!cursor) return json({ items: [user('a'), user('b')], nextCursor: 'c1' });
        if (cursor === 'c1') return json({ items: [user('c'), user('d')], nextCursor: 'c2' });
        return json({ items: [user('e')], nextCursor: null });
      }),
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useAdminUsers(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((u) => u.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(urls).toHaveLength(3);
    expect(urls.every((u) => u.startsWith('/api/admin/users?') && u.includes('limit=100'))).toBe(true);
    expect(urls[1]).toContain('cursor=c1');
    expect(urls[2]).toContain('cursor=c2');
  });
});
