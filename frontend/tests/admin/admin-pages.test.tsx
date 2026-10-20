import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from '../../src/features/admin/adminRoutes';

/** T102 — administration : formulaires validés, mot de passe provisoire affiché une seule fois, confirmations. */

type Call = { url: string; method: string; body: unknown };
type Handler = (url: string, method: string, body: unknown) => Response | undefined;

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const SUPER_ADMIN = { id: 'sa', displayName: 'Super administrateur', role: 'SUPER_ADMIN', permissions: [], mustChangePassword: false };

const USERS = [
  { id: 'e1', username: 'reprographie', displayName: 'Reprographie', jobTitle: 'Reprographie', role: 'EMPLOYEE', active: true, mustChangePassword: false, createdAt: '2026-09-01T08:00:00.000Z', recipientCategories: [{ id: 'c1', name: 'Photocopies' }] },
  { id: 'm1', username: 'responsable', displayName: 'Responsable administratif', jobTitle: 'Direction', role: 'ADMIN', active: true, mustChangePassword: false, createdAt: '2026-09-01T08:00:00.000Z', recipientCategories: [] },
  { id: 'sa', username: 'superadmin', displayName: 'Super administrateur', jobTitle: null, role: 'SUPER_ADMIN', active: true, mustChangePassword: false, createdAt: '2026-09-01T08:00:00.000Z', recipientCategories: [] },
  { id: 'e2', username: 'technicien', displayName: 'Technicien', jobTitle: null, role: 'EMPLOYEE', active: true, mustChangePassword: true, createdAt: '2026-10-13T08:00:00.000Z', recipientCategories: [] },
];

const RULES = (['NORMAL', 'MEDIUM', 'HIGH', 'URGENT'] as const).map((priority) => ({
  priority,
  validationMinutes: null,
  takeoverMinutes: 60,
  completionMinutes: 240,
}));

const CATEGORY = {
  id: 'c1',
  name: 'Photocopies',
  active: true,
  circuit: 'A_DIRECT',
  routingMode: 'DIRECT',
  creatorRoles: ['EMPLOYEE', 'ADMIN'],
  closureMode: 'AUTO',
  autoCloseAfterMinutes: 1440,
  finalValidation: false,
  assignmentMode: 'MANUAL',
  autoAssigneeId: null,
  photoRequired: false,
  recipients: [{ id: 'e1', displayName: 'Reprographie' }],
  managers: [{ id: 'm1', displayName: 'Responsable administratif' }],
  deadlineRules: RULES,
};

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
};

function setup(path: string, handler: Handler = () => undefined, me: unknown = SUPER_ADMIN) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });
      const custom = handler(url, method, body);
      if (custom) return custom;
      if (url === '/api/auth/me') return json(200, me);
      if (url === '/api/admin/users' && method === 'GET') return json(200, USERS);
      if (url === '/api/admin/categories' && method === 'GET') return json(200, [CATEGORY]);
      if (url === '/api/admin/settings' && method === 'GET') return json(200, SETTINGS);
      if (url === '/api/admin/role-permissions' && method === 'GET')
        return json(200, { EMPLOYEE: ['PRIORITY_CHANGE_OWN', 'REQUEST_CREATE'], ADMIN: ['REQUEST_CREATE'] });
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  const router = createMemoryRouter(adminRoutes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { calls, router };
}

describe('Accès à l’administration', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuse l’espace Administrateur à un admin, sans appeler les routes /admin', async () => {
    const { calls } = setup('/admin/comptes', undefined, { ...SUPER_ADMIN, id: 'm1', role: 'ADMIN' });
    expect(await screen.findByText('Accès réservé au super administrateur.')).toBeVisible();
    expect(calls.some((c) => c.url.startsWith('/api/admin'))).toBe(false);
  });

  it('propose une navigation entre les sections', async () => {
    setup('/admin');
    const nav = await screen.findByRole('navigation', { name: 'Sections de l’espace Administrateur' });
    for (const label of ['Comptes', 'Catégories', 'Réglages', 'Journal d’audit']) {
      expect(within(nav).getByRole('link', { name: label })).toBeVisible();
    }
    expect(await screen.findByRole('heading', { name: 'Comptes' })).toBeVisible();
  });
});

describe('Comptes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('valide le formulaire puis affiche le mot de passe provisoire une seule fois, avec un bouton copier', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { calls } = setup('/admin/comptes', (url, method) =>
      url === '/api/admin/users' && method === 'POST'
        ? json(201, { user: { ...USERS[0], id: 'n1', username: 'cuisine.chef', displayName: 'Chef de cuisine', mustChangePassword: true }, temporaryPassword: 'Provisoire-1234abcd' })
        : undefined,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Nouveau compte' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouveau compte' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Créer le compte' }));
    expect(within(dialog).getByText('L’identifiant est obligatoire.')).toBeVisible();
    expect(within(dialog).getByText('Le nom est obligatoire.')).toBeVisible();

    await userEvent.type(within(dialog).getByLabelText(/Identifiant/), 'chef cuisine');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Créer le compte' }));
    expect(within(dialog).getByText(/lettres sans accent, chiffres/)).toBeVisible();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await userEvent.clear(within(dialog).getByLabelText(/Identifiant/));
    await userEvent.type(within(dialog).getByLabelText(/Identifiant/), 'cuisine.chef');
    await userEvent.type(within(dialog).getByLabelText(/Nom affiché/), 'Chef de cuisine');
    await userEvent.type(within(dialog).getByLabelText(/Fonction/), 'Cantine');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Créer le compte' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')).toMatchObject({
        url: '/api/admin/users',
        body: { username: 'cuisine.chef', displayName: 'Chef de cuisine', jobTitle: 'Cantine', role: 'EMPLOYEE', recipientCategoryIds: [] },
      }),
    );

    const passwordDialog = await screen.findByRole('dialog', { name: 'Mot de passe provisoire' });
    expect(within(passwordDialog).getByLabelText('Mot de passe')).toHaveValue('Provisoire-1234abcd');
    expect(within(passwordDialog).getByText(/ne sera plus affiché/)).toBeVisible();
    await userEvent.click(within(passwordDialog).getByRole('button', { name: 'Copier le mot de passe' }));
    expect(writeText).toHaveBeenCalledWith('Provisoire-1234abcd');
    expect(await within(passwordDialog).findByText('Mot de passe copié.')).toBeVisible();

    await userEvent.click(within(passwordDialog).getByRole('button', { name: 'J’ai noté le mot de passe' }));
    await waitFor(() => expect(screen.queryByDisplayValue('Provisoire-1234abcd')).not.toBeInTheDocument());
  });

  it('rattache le nouveau compte aux catégories choisies (destinataire, donc affectable)', async () => {
    const { calls } = setup('/admin/comptes', (url, method) =>
      url === '/api/admin/users' && method === 'POST'
        ? json(201, { user: { ...USERS[3], id: 'n2', username: 'agent', displayName: 'Agent', recipientCategories: [{ id: 'c1', name: 'Photocopies' }] }, temporaryPassword: 'Provisoire-5678efgh' })
        : undefined,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Nouveau compte' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouveau compte' });
    expect(within(dialog).getByText(/ne peut ni en recevoir ni être affecté/)).toBeVisible();

    await userEvent.type(within(dialog).getByLabelText(/Identifiant/), 'agent');
    await userEvent.type(within(dialog).getByLabelText(/Nom affiché/), 'Agent');
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Destinataire des catégories' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Photocopies' }));
    expect(within(dialog).getByText(/pourra recevoir les demandes de ces catégories/)).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Créer le compte' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')).toMatchObject({
        url: '/api/admin/users',
        body: { username: 'agent', displayName: 'Agent', role: 'EMPLOYEE', recipientCategoryIds: ['c1'] },
      }),
    );
  });

  it('signale les employés destinataires d’aucune catégorie et permet de les rattacher', async () => {
    const { calls } = setup('/admin/comptes', (url, method) =>
      url === '/api/admin/users/e2' && method === 'PATCH' ? json(200, { ...USERS[3], recipientCategories: [{ id: 'c1', name: 'Photocopies' }] }) : undefined,
    );
    expect(await screen.findByText('Destinataire : Photocopies')).toBeVisible();
    expect(screen.getByText('Destinataire d’aucune catégorie : ne peut pas être affecté.')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Modifier le compte de Technicien' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifier : Technicien' });
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Destinataire des catégories' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Photocopies' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ url: '/api/admin/users/e2', body: { recipientCategoryIds: ['c1'] } }),
    );
  });

  it('demande une confirmation avant de désactiver un compte', async () => {
    const { calls } = setup('/admin/comptes', (url, method) =>
      url === '/api/admin/users/e1' && method === 'PATCH' ? json(200, { ...USERS[0], active: false }) : undefined,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Désactiver le compte de Reprographie' }));
    let dialog = await screen.findByRole('dialog', { name: 'Désactiver ce compte ?' });
    expect(within(dialog).getByText(/sera déconnecté immédiatement/)).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Désactiver le compte de Reprographie' }));
    dialog = await screen.findByRole('dialog', { name: 'Désactiver ce compte ?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Désactiver le compte' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ url: '/api/admin/users/e1', body: { active: false } }));
  });

  it('ne propose ni désactivation ni réinitialisation sur son propre compte', async () => {
    setup('/admin/comptes');
    expect(await screen.findByRole('button', { name: 'Désactiver le compte de Reprographie' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Désactiver le compte de Super administrateur' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réinitialiser le mot de passe de Super administrateur' })).not.toBeInTheDocument();
  });
});

describe('Catégories', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('n’affiche les options de validation qu’en mode « via l’administration », puis enregistre catégorie, destinataires et admins', async () => {
    const created = { ...CATEGORY, id: 'c2', name: 'Travaux', circuit: 'B_ADMIN_VALIDATION', routingMode: 'VIA_ADMIN', recipients: [], managers: [] };
    const { calls } = setup('/admin/categories', (url, method) => {
      if (url === '/api/admin/categories' && method === 'POST') return json(201, created);
      if (url.startsWith('/api/admin/categories/c2/') && method === 'PUT') return json(200, created);
      return undefined;
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Nouvelle catégorie' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle catégorie' });
    expect(within(dialog).queryByRole('checkbox', { name: 'Validation finale par un admin' })).not.toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/Nom de la catégorie/), 'Travaux');
    await userEvent.click(within(dialog).getByRole('radio', { name: /Via l’administration/ }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Validation finale par un admin' }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Photo de preuve obligatoire' }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Destinataires' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Reprographie' }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Admins de la catégorie' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Responsable administratif' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la catégorie' }));

    await waitFor(() => expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(3));
    const writes = calls.filter((c) => c.method !== 'GET');
    expect(writes[0]).toMatchObject({
      url: '/api/admin/categories',
      method: 'POST',
      body: { name: 'Travaux', routingMode: 'VIA_ADMIN', circuit: 'B_ADMIN_VALIDATION', finalValidation: true, photoRequired: true, assignmentMode: 'MANUAL' },
    });
    expect(writes[1]).toMatchObject({ url: '/api/admin/categories/c2/recipients', body: { userIds: ['e1'] } });
    expect(writes[2]).toMatchObject({ url: '/api/admin/categories/c2/managers', body: { userIds: ['m1'] } });
  });

  it('mode « entre enseignants » : envoyé avec le circuit direct ; clôture par l’administration impossible hors validation', async () => {
    const created = { ...CATEGORY, id: 'c3', name: 'Enseignants', routingMode: 'PEER', recipients: [], managers: [] };
    const { calls } = setup('/admin/categories', (url, method) => (url === '/api/admin/categories' && method === 'POST' ? json(201, created) : undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Nouvelle catégorie' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle catégorie' });
    await userEvent.type(within(dialog).getByLabelText(/Nom de la catégorie/), 'Enseignants');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Entre enseignants' }));
    expect(within(dialog).getByText(/Un enseignant écrit directement à un collègue/)).toBeVisible();

    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Clôture' }));
    expect(await screen.findByRole('option', { name: 'Par un admin' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('option', { name: 'Par le demandeur' }));

    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la catégorie' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ name: 'Enseignants', routingMode: 'PEER', circuit: 'A_DIRECT', closureMode: 'REQUESTER' });
  });

  it('valide les délais (entiers positifs ou vides) avant de les enregistrer', async () => {
    const { calls } = setup('/admin/categories', (url, method) =>
      url === '/api/admin/categories/c1/deadlines' && method === 'PUT' ? json(200, RULES) : undefined,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Délais de Photocopies' }));
    const dialog = await screen.findByRole('dialog', { name: 'Délais : Photocopies' });
    // Circuit A : pas de délai de validation administrative.
    expect(within(dialog).queryByLabelText(/Validation/)).not.toBeInTheDocument();

    const urgent = within(dialog).getByRole('group', { name: 'Urgente' });
    const takeover = within(urgent).getByLabelText(/Prise en charge/);
    await userEvent.clear(takeover);
    await userEvent.type(takeover, '0');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer les délais' }));
    expect(within(urgent).getByText('Au moins 1 minute, ou vide pour aucun délai.')).toBeVisible();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);

    await userEvent.clear(takeover);
    await userEvent.type(takeover, '5');
    await userEvent.clear(within(urgent).getByLabelText(/Réalisation/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer les délais' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')).toBeDefined());
    const sent = calls.find((c) => c.method === 'PUT')!.body as { rules: Array<Record<string, unknown>> };
    expect(sent.rules.find((r) => r.priority === 'URGENT')).toEqual({ priority: 'URGENT', validationMinutes: null, takeoverMinutes: 5, completionMinutes: null });
  });
});

describe('Réglages', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('n’envoie que les réglages modifiés et affiche l’erreur du serveur sous le champ', async () => {
    const { calls } = setup('/admin/reglages', (url, method) =>
      url === '/api/admin/settings' && method === 'PUT'
        ? json(400, {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Certaines informations sont manquantes ou invalides.',
              details: { fields: [{ field: 'voiceMaxSeconds', messages: ['Nombre entier entre 10 et 600 secondes attendu.'] }] },
            },
          })
        : undefined,
    );
    const field = await screen.findByLabelText(/Durée maximale d’un vocal/);
    await userEvent.clear(field);
    await userEvent.type(field, '900');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ body: { voiceMaxSeconds: 900 } }));
    expect(await screen.findByText('Nombre entier entre 10 et 600 secondes attendu.')).toBeVisible();
  });

  it('modifie les permissions d’un rôle', async () => {
    const { calls } = setup('/admin/reglages', (url, method) =>
      url === '/api/admin/role-permissions' && method === 'PUT'
        ? json(200, { EMPLOYEE: ['PRIORITY_CHANGE_OWN', 'REQUEST_CREATE'], ADMIN: ['REQUEST_CREATE', 'REQUEST_REASSIGN'] })
        : undefined,
    );
    const manager = await screen.findByRole('group', { name: 'Admin' });
    await userEvent.click(within(manager).getByRole('checkbox', { name: 'Réaffecter une demande' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer les permissions' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')).toMatchObject({
        url: '/api/admin/role-permissions',
        body: { EMPLOYEE: ['PRIORITY_CHANGE_OWN', 'REQUEST_CREATE'], ADMIN: ['REQUEST_CREATE', 'REQUEST_REASSIGN'] },
      }),
    );
    expect(await screen.findByText('Permissions enregistrées.')).toBeVisible();
  });
});

describe('Journal d’audit', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('présente les entrées en français et filtre par action', async () => {
    const { calls } = setup('/admin/journal', (url) =>
      url.startsWith('/api/admin/audit')
        ? json(200, {
            items: [
              { id: 'a1', action: 'LOGIN_FAILURE', actor: { id: 'm1', displayName: 'Responsable administratif' }, targetType: null, targetId: null, details: { username: 'responsable', reason: 'BAD_PASSWORD' }, ip: '127.0.0.1', createdAt: '2026-10-12T08:00:00.000Z' },
              { id: 'a2', action: 'ACCESS_DENIED', actor: null, targetType: null, targetId: null, details: { reason: 'UNAUTHENTICATED' }, ip: null, createdAt: '2026-10-12T07:00:00.000Z' },
            ],
            nextCursor: null,
          })
        : undefined,
    );
    const list = await screen.findByRole('list', { name: 'Entrées du journal' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Échec de connexion');
    expect(items[0]).toHaveTextContent('Responsable administratif');
    expect(items[1]).toHaveTextContent('Accès refusé');
    expect(items[1]).toHaveTextContent('Anonyme');
    expect(screen.queryByRole('button', { name: /Supprimer|Modifier/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Action' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Échec de connexion' }));
    await waitFor(() => expect(calls.at(-1)?.url).toBe('/api/admin/audit?action=LOGIN_FAILURE'));
  });
});
