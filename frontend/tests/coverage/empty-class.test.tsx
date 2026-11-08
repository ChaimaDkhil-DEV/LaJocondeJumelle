import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  // 013 : un jeton de QR porte l'identifiant (UUID) de la classe.
  { id: '0a1b2c3d-1111-4222-8333-444455556666', name: 'CE1 Vert', room: null, floor: { id: 'f1', name: '1er étage' } },
];

const QR_CLASS_ID = '0a1b2c3d-1111-4222-8333-444455556666';
const QR_TOKEN = `c1.${QR_CLASS_ID}.1.c2ln`;
const QR_LINK = `http://localhost:5173/gardes/presence?c=${QR_TOKEN}`;

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

/** 013 : scanner le QR code de la porte (caméra dans l'application) envoie la déclaration aussitôt. */
describe('Déclarer par QR code (013)', () => {
  const scanButton = () => screen.findByRole('button', { name: 'Scanner le QR code de la classe' });
  /** jsdom n'a pas de caméra : la saisie manuelle appelle le même `onToken` qu'une lecture par la caméra. */
  async function scan(user: ReturnType<typeof userEvent.setup>, text: string) {
    await user.click(await scanButton());
    const dialog = await screen.findByRole('dialog', { name: 'Scanner le QR code de la classe' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Lien ou code du QR code' }), text);
    await user.click(within(dialog).getByRole('button', { name: 'Continuer' }));
    return dialog;
  }

  it('le scan est le premier choix, au-dessus du formulaire', async () => {
    setup('/gardes/classe-vide');
    const scanner = await scanButton();
    expect(screen.getByText('La déclaration part dès que le QR code de la porte est lu.')).toBeInTheDocument();
    const declare = screen.getByRole('button', { name: 'Déclarer la classe vide' });
    expect(scanner.compareDocumentPosition(declare) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('un QR lu envoie aussitôt la déclaration : classe du jeton, sans enseignant, QR en preuve', async () => {
    const user = userEvent.setup();
    const calls = setup('/gardes/classe-vide');
    const dialog = await scan(user, QR_LINK);
    await waitFor(() => expect(declarations(calls)).toHaveLength(1));
    expect(declarations(calls)[0].body).toMatchObject({ classId: QR_CLASS_ID, teacherId: null, qrToken: QR_TOKEN });
    expect(String(declarations(calls)[0].body?.clientId)).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  it('résultat : nom de la classe en titre, issue habituelle, « Scanner une autre classe »', async () => {
    const user = userEvent.setup();
    setup('/gardes/classe-vide');
    await scan(user, QR_LINK);
    expect(await screen.findByRole('heading', { level: 2, name: 'CE1 Vert' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Classe CE1 Vert déclarée vide');
    expect(screen.getByRole('link', { name: 'Voir l’affectation' })).toHaveAttribute('href', '/gardes/g1');
    expect(screen.getByRole('button', { name: 'Scanner une autre classe' })).toBeInTheDocument();
  });

  it('« Scanner une autre classe » rouvre le scan ; la déclaration suivante a un nouvel identifiant', async () => {
    const user = userEvent.setup();
    const calls = setup('/gardes/classe-vide');
    await scan(user, QR_LINK);
    await user.click(await screen.findByRole('button', { name: 'Scanner une autre classe' }));
    const dialog = await screen.findByRole('dialog', { name: 'Scanner le QR code de la classe' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Lien ou code du QR code' }), QR_LINK);
    await user.click(within(dialog).getByRole('button', { name: 'Continuer' }));
    await waitFor(() => expect(declarations(calls)).toHaveLength(2));
    expect(declarations(calls)[1].body?.clientId).not.toBe(declarations(calls)[0].body?.clientId);
  });

  it('pendant l’envoi : « Déclaration de la classe… »', async () => {
    const user = userEvent.setup();
    let release: (value: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const calls: Call[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
        if (url === '/api/coverage/classes') return json(200, CLASSES);
        if (url === '/api/coverage/teachers') return json(200, []);
        if (url === '/api/coverage/empty-class') return pending;
        return json(404, {});
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/gardes/classe-vide']}>
            <Routes>
              <Route path="/gardes/classe-vide" element={<EmptyClassPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    await scan(user, QR_LINK);
    expect(await screen.findByText('Déclaration de la classe…')).toBeInTheDocument();
    release(json(201, result('CREATED')));
    expect(await screen.findByRole('heading', { level: 2, name: 'CE1 Vert' })).toBeInTheDocument();
  });
});

/** 013 (US2) : sans caméra, la saisie manuelle et le formulaire gardent un chemin complet. */
describe('Sans caméra, ou par choix (013)', () => {
  it('sans caméra : message et saisie du lien ou du code', async () => {
    const user = userEvent.setup();
    setup('/gardes/classe-vide');
    await user.click(await screen.findByRole('button', { name: 'Scanner le QR code de la classe' }));
    const dialog = await screen.findByRole('dialog', { name: 'Scanner le QR code de la classe' });
    expect(within(dialog).getByText(/caméra n’est pas disponible|accès à la caméra n’est pas autorisé/)).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Lien ou code du QR code' })).toBeInTheDocument();
  });

  it('fermer le scan n’envoie rien ; le formulaire reste là', async () => {
    const user = userEvent.setup();
    const calls = setup('/gardes/classe-vide');
    await user.click(await screen.findByRole('button', { name: 'Scanner le QR code de la classe' }));
    const dialog = await screen.findByRole('dialog', { name: 'Scanner le QR code de la classe' });
    await user.click(within(dialog).getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(declarations(calls)).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Déclarer la classe vide' })).toBeInTheDocument();
  });

  it('ouverte depuis le lien du QR (appareil photo) : formulaire inchangé, et le scan reste proposé', async () => {
    const user = userEvent.setup();
    const calls = setup('/gardes/classe-vide?classe=k2&c=JETON');
    expect(await screen.findByRole('radio', { name: /2e année Bleu/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Scanner le QR code de la classe' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Déclarer la classe vide' }));
    await waitFor(() => expect(declarations(calls)).toHaveLength(1));
    expect(declarations(calls)[0].body).toMatchObject({ classId: 'k2', qrToken: 'JETON' });
  });
});

/** 013 (US3) : un QR inutilisable ne déclare rien et le dit. */
describe('QR refusés (013)', () => {
  async function scanText(user: ReturnType<typeof userEvent.setup>, text: string) {
    await user.click(await screen.findByRole('button', { name: 'Scanner le QR code de la classe' }));
    const dialog = await screen.findByRole('dialog', { name: 'Scanner le QR code de la classe' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Lien ou code du QR code' }), text);
    await user.click(within(dialog).getByRole('button', { name: 'Continuer' }));
    return dialog;
  }

  it('un texte qui n’est pas un QR de classe : message dans le scan, rien n’est envoyé', async () => {
    const user = userEvent.setup();
    const calls = setup('/gardes/classe-vide');
    const dialog = await scanText(user, 'https://exemple.org/autre-chose');
    expect(await within(dialog).findByText('Ce lien ou ce code n’est pas celui d’un QR code de classe.')).toBeInTheDocument();
    expect(declarations(calls)).toHaveLength(0);
  });

  it.each([
    [422, 'QR_INVALID', 'Ce QR code n’est pas valide ou a été révoqué. Demandez le QR code à jour.'],
    [400, 'CLASS_INACTIVE', 'Cette classe est introuvable ou désactivée.'],
  ])('refus du serveur %s %s : message au-dessus du scan, aucun résultat, scan et formulaire utilisables', async (status, code, message) => {
    const user = userEvent.setup();
    const calls = setup('/gardes/classe-vide', () => json(status, { error: { code, message } }));
    await scanText(user, QR_LINK);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    const scanner = screen.getByRole('button', { name: 'Scanner le QR code de la classe' });
    expect(alert.compareDocumentPosition(scanner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2, name: 'CE1 Vert' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Déclarer la classe vide' })).toBeEnabled();
    expect(declarations(calls)).toHaveLength(1);
  });

  it('après un refus, un nouveau scan envoie une nouvelle demande ; le message disparaît dès le nouveau scan', async () => {
    const user = userEvent.setup();
    let refuse = true;
    const calls = setup('/gardes/classe-vide', () =>
      refuse ? json(422, { error: { code: 'QR_INVALID', message: 'Ce QR code n’est pas valide ou a été révoqué. Demandez le QR code à jour.' } }) : json(201, result('CREATED')),
    );
    await scanText(user, QR_LINK);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    refuse = false;
    await user.click(screen.getByRole('button', { name: 'Scanner le QR code de la classe' }));
    expect(screen.queryByText('Ce QR code n’est pas valide ou a été révoqué. Demandez le QR code à jour.')).not.toBeInTheDocument();
    const dialog = await screen.findByRole('dialog', { name: 'Scanner le QR code de la classe' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Lien ou code du QR code' }), QR_LINK);
    await user.click(within(dialog).getByRole('button', { name: 'Continuer' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'CE1 Vert' })).toBeInTheDocument();
    expect(declarations(calls)).toHaveLength(2);
  });
});
