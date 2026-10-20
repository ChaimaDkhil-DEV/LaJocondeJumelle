import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { EmptyClassPage } from '../../src/features/coverage/EmptyClassPage';

/**
 * T062 — Déclaration d'une classe vide (US2, FR-015, FR-015a) : en deux gestes (la classe, puis
 * « Déclarer »), enseignant facultatif choisi dans le groupe Enseignants, message selon l'issue,
 * QR de la classe repris, libellés accessibles.
 */

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const CLASSES = [
  { id: 'k1', name: '1ère année Violet', room: 'Salle 12', floor: { id: 'f1', name: '1er étage' } },
  { id: 'k2', name: '2e année Bleu', room: null, floor: { id: 'f2', name: '2e étage' } },
];

function result(outcome: string, extra: Record<string, unknown> = {}) {
  return {
    outcome,
    coverage: outcome === 'ALREADY_ASSIGNED' ? null : { id: 'g1', class: { id: 'k1', name: '1ère année Violet' } },
    assignedTo: { id: 's1', displayName: 'Surveillant' },
    doubleAssignment: false,
    ...extra,
  };
}

function setup(path: string, declaration: Response | (() => Response) = json(201, result('CREATED'))): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call = { url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined };
      calls.push(call);
      if (url === '/api/coverage/classes') return json(200, CLASSES);
      if (url === '/api/coverage/teachers') return json(200, [{ id: 't1', displayName: 'Enseignante' }]);
      if (url === '/api/coverage/empty-class') return typeof declaration === 'function' ? declaration() : declaration.clone();
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/gardes/classe-vide" element={<EmptyClassPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return calls;
}

const declarations = (calls: Call[]) => calls.filter((c) => c.method === 'POST');

afterEach(() => vi.unstubAllGlobals());

describe('Déclarer une classe vide', () => {
  it('en deux gestes : la classe, puis « Déclarer » ; enseignant non précisé par défaut', async () => {
    const user = userEvent.setup();
    const calls = setup('/gardes/classe-vide');
    expect(await screen.findByRole('heading', { name: 'Déclarer une classe vide' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Enseignant \(facultatif\)/ })).toHaveTextContent('Non précisé');
    await user.click(await screen.findByRole('radio', { name: /1ère année Violet/ }));
    await user.click(screen.getByRole('button', { name: 'Déclarer la classe vide' }));
    await waitFor(() => expect(declarations(calls)).toHaveLength(1));
    expect(declarations(calls)[0].body).toMatchObject({ classId: 'k1', teacherId: null });
    expect(declarations(calls)[0].body).toHaveProperty('clientId');
    expect(declarations(calls)[0].body).not.toHaveProperty('qrToken');
    expect(await screen.findByRole('status')).toHaveTextContent('L’affectation est à votre nom, en cours');
    expect(screen.getByRole('link', { name: 'Voir l’affectation' })).toHaveAttribute('href', '/gardes/g1');
  });

  it('sans classe choisie : erreur, aucun envoi', async () => {
    const user = userEvent.setup();
    const calls = setup('/gardes/classe-vide');
    await user.click(await screen.findByRole('button', { name: 'Déclarer la classe vide' }));
    expect(await screen.findByText('Choisissez la classe.')).toBeInTheDocument();
    expect(declarations(calls)).toHaveLength(0);
  });

  it('enseignant facultatif choisi dans le groupe Enseignants', async () => {
    const user = userEvent.setup();
    const calls = setup('/gardes/classe-vide');
    await user.click(await screen.findByRole('radio', { name: /2e année Bleu/ }));
    await user.click(screen.getByRole('combobox', { name: /Enseignant \(facultatif\)/ }));
    await user.click(await screen.findByRole('option', { name: 'Enseignante' }));
    await user.click(screen.getByRole('button', { name: 'Déclarer la classe vide' }));
    await waitFor(() => expect(declarations(calls)).toHaveLength(1));
    expect(declarations(calls)[0].body).toMatchObject({ classId: 'k2', teacherId: 't1' });
  });

  it('depuis le QR de la classe : classe présélectionnée, QR transmis', async () => {
    const user = userEvent.setup();
    const calls = setup('/gardes/classe-vide?classe=k2&c=JETON');
    expect(await screen.findByRole('radio', { name: /2e année Bleu/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Déclarer la classe vide' }));
    await waitFor(() => expect(declarations(calls)).toHaveLength(1));
    expect(declarations(calls)[0].body).toMatchObject({ classId: 'k2', qrToken: 'JETON' });
  });

  it.each([
    ['ATTACHED', {}, 'La demande de l’enseignant pour cette classe vous est affectée'],
    ['SUPPORT', { assignedTo: { id: 's2', displayName: 'Remplaçante' } }, 'déjà prise en charge par Remplaçante'],
    ['ALREADY_ASSIGNED', { assignedTo: { id: 's2', displayName: 'Remplaçante' } }, 'Remplaçante est déjà assigné(e) à cette classe'],
    ['MERGE_PROPOSED', {}, 'l’admin vérifiera s’il s’agit du même cas'],
  ])('issue %s : message clair', async (outcome, extra, text) => {
    const user = userEvent.setup();
    setup('/gardes/classe-vide', json(201, result(outcome, extra)));
    await user.click(await screen.findByRole('radio', { name: /1ère année Violet/ }));
    await user.click(screen.getByRole('button', { name: 'Déclarer la classe vide' }));
    expect(await screen.findByRole('status')).toHaveTextContent(text);
  });

  it('surveillant déjà occupé : affectation créée, avertissement visible', async () => {
    const user = userEvent.setup();
    setup('/gardes/classe-vide', json(201, result('CREATED', { doubleAssignment: true })));
    await user.click(await screen.findByRole('radio', { name: /1ère année Violet/ }));
    await user.click(screen.getByRole('button', { name: 'Déclarer la classe vide' }));
    expect(await screen.findByText(/Vous aviez déjà une affectation en cours/)).toBeInTheDocument();
  });

  it('refus du serveur affiché', async () => {
    const user = userEvent.setup();
    setup('/gardes/classe-vide', json(400, { error: { code: 'CLASS_INACTIVE', message: 'Cette classe est désactivée.' } }));
    await user.click(await screen.findByRole('radio', { name: /1ère année Violet/ }));
    await user.click(screen.getByRole('button', { name: 'Déclarer la classe vide' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cette classe est désactivée.');
  });
});
