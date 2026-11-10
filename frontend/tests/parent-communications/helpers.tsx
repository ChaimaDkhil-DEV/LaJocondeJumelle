import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';

/** Communication enseignant / parents (015) : outils communs des tests de l'interface. */

export type Call = { url: string; method: string; body: unknown };
export type Handler = (call: Call) => Response | undefined;

export function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const teacher = { id: 't1', displayName: 'Mme Enseignante' };
export const student = {
  id: 's1',
  firstName: 'Lina',
  lastName: 'Ben Salah',
  class: { id: 'c1', name: '1ère année Violet' },
};
export const guardian = {
  id: 'g1',
  firstName: 'Sonia',
  lastName: 'Ben Salah',
  relationship: 'Mère',
};

export function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pc1',
    author: 'TEACHER',
    status: 'DRAFT',
    version: 1,
    currentRevision: 0,
    approvedRevision: null,
    decisionReason: null,
    submittedAt: null,
    decidedAt: null,
    updatedAt: '2026-11-09T09:00:00.000Z',
    readAt: null,
    createdAt: '2026-11-09T09:00:00.000Z',
    decidedBy: null,
    teacher,
    student,
    guardian,
    draft: { text: 'Lina progresse en lecture.', voice: { id: 'v1', durationSeconds: 4 } },
    revisions: [],
    events: [
      {
        type: 'CREATED',
        actor: teacher,
        revision: null,
        reason: null,
        createdAt: '2026-11-09T09:00:00.000Z',
      },
    ],
    deliveries: [],
    ...overrides,
  };
}

/** Réponse JSON par défaut ; `handler` répond en premier. Les appels sont enregistrés. */
export function mockApi(handler: Handler): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: Call = {
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      };
      calls.push(call);
      return (
        handler(call) ??
        json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } })
      );
    }),
  );
  return calls;
}

export function renderRoutes(routes: RouteObject[], path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return router;
}

export const route = (path: string, element: ReactElement): RouteObject => ({ path, element });
