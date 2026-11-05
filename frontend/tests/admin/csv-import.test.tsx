import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from '../../src/features/admin/adminRoutes';
import type { AccountsImportReport, ImportReport } from '../../src/features/admin/csvImport';

/**
 * Import CSV (comptes, élèves) côté interface : le fichier est d'abord vérifié en entier, rien n'est créé tant que
 * la personne n'a pas confirmé, la création n'est proposée que si tout est valide, et les mots de passe
 * provisoires — donnés une seule fois — ne sont pas perdus sans avertissement.
 */

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const SUPER_ADMIN = { id: 'sa', displayName: 'Direction', role: 'SUPER_ADMIN', permissions: [], mustChangePassword: false };

const base: ImportReport = { dryRun: true, created: false, count: 0, total: 2, valid: 2, invalid: 0, fileErrors: [], issues: [], truncated: false, preview: [] };
const PREVIEW = [
  { line: 2, label: 'Amine Ben Salah (amine.bs)', detail: 'Employé · groupes : Enseignants' },
  { line: 3, label: 'Sarra Trabelsi (sarra.t)', detail: 'Employé · 1er étage' },
];
const VALID: ImportReport = { ...base, preview: PREVIEW };
const CREATED: AccountsImportReport = {
  ...base,
  dryRun: false,
  created: true,
  count: 2,
  preview: PREVIEW,
  accounts: [
    { username: 'amine.bs', displayName: 'Amine Ben Salah', temporaryPassword: 'Mdp-provisoire-1' },
    { username: 'sarra.t', displayName: 'Sarra Trabelsi', temporaryPassword: 'Mdp-provisoire-2' },
  ],
  passwordsCsv: 'IDENTIFIANT;NOM;MOT DE PASSE\r\namine.bs;Amine;Mdp-provisoire-1\r\n',
};
const INVALID: ImportReport = {
  ...base,
  total: 3,
  valid: 2,
  invalid: 1,
  issues: [{ line: 3, label: 'Trop Court (a)', errors: ['L’identifiant doit comporter au moins 3 caractères.', 'Cet identifiant est déjà utilisé.'] }],
  preview: PREVIEW,
};

const file = (content: string | number[], name = 'comptes.csv') => new File([typeof content === 'string' ? content : new Uint8Array(content)], name, { type: 'text/csv' });
const CSV = 'identifiant;nom_affiche\r\namine.bs;Amine Ben Salah\r\nsarra.t;Sarra Trabelsi\r\n';

let downloads: Blob[] = [];

beforeEach(() => {
  downloads = [];
  Object.assign(URL, {
    createObjectURL: vi.fn((blob: Blob) => {
      downloads.push(blob);
      return 'blob:test';
    }),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(path: string, importUrl: string, answer: (call: Call) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: Call = { url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined };
      calls.push(call);
      if (url === importUrl && call.method === 'POST') return answer(call);
      if (url === '/api/auth/me') return json(200, SUPER_ADMIN);
      if (url.startsWith('/api/admin/users?')) return json(200, { items: [], nextCursor: null });
      if (url === '/api/admin/categories') return json(200, []);
      if (url === '/api/admin/levels') return json(200, [{ id: 'l1', name: 'CP', cycle: 'PRIMARY', position: 1, classes: [{ id: 'c1', name: 'CP Violet', room: null, floor: null, studentCount: 0 }] }]);
      if (url === '/api/admin/students') return json(200, []);
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  const router = createMemoryRouter(adminRoutes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return calls;
}

const imports = (calls: Call[]) => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/import'));

async function openAccountsDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Importer un fichier' }));
  return screen.findByRole('dialog', { name: 'Importer des comptes' });
}
const upload = (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, f: File) => user.upload(within(dialog).getByLabelText('Fichier CSV à importer'), f);

describe('Import de comptes', () => {
  it('le dialogue explique les colonnes et propose un modèle au bon format', async () => {
    const user = userEvent.setup();
    setup('/admin/comptes', '/api/admin/users/import', () => json(200, VALID));
    const dialog = await openAccountsDialog(user);
    for (const column of ['identifiant', 'nom_affiche', 'fonction', 'role', 'groupes', 'etage', 'categories']) {
      expect(within(dialog).getByText(column)).toBeInTheDocument();
    }
    expect(within(dialog).getAllByText(/\(obligatoire\)/)).toHaveLength(2);
    await user.click(within(dialog).getByRole('button', { name: 'Télécharger le modèle' }));
    expect(downloads).toHaveLength(1);
    const { readCsvFile } = await import('../../src/features/admin/csvImport');
    const template = await readCsvFile(downloads[0]);
    expect(template).toBe('identifiant;nom_affiche;fonction;role;groupes;etage;categories\r\namine.bensalah;Amine Ben Salah;Professeur;employé;Enseignants;;\r\nsarra.trabelsi;Sarra Trabelsi;Surveillante;employé;Surveillants;1er étage;\r\n');
  });

  it('choisir un fichier le fait vérifier sans rien créer, puis montre l’aperçu', async () => {
    const user = userEvent.setup();
    const calls = setup('/admin/comptes', '/api/admin/users/import', () => json(200, VALID));
    const dialog = await openAccountsDialog(user);
    await upload(user, dialog, file(CSV));

    expect(await within(dialog).findByText('Le fichier est valide : 2 comptes à créer.')).toBeInTheDocument();
    expect(imports(calls)).toHaveLength(1);
    expect(imports(calls)[0].body).toEqual({ csv: CSV, dryRun: true });
    expect(within(dialog).getByText('Fichier : comptes.csv')).toBeInTheDocument();
    expect(within(dialog).getByText('Amine Ben Salah (amine.bs)')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Créer 2 comptes' })).toBeEnabled();
  });

  it('confirmer envoie le même fichier pour de bon, puis donne les mots de passe provisoires', async () => {
    const user = userEvent.setup();
    const calls = setup('/admin/comptes', '/api/admin/users/import', (call) => json(200, call.body?.dryRun ? VALID : CREATED));
    const dialog = await openAccountsDialog(user);
    await upload(user, dialog, file(CSV));
    await user.click(await within(dialog).findByRole('button', { name: 'Créer 2 comptes' }));

    expect(await within(dialog).findByText('2 comptes créés.')).toBeInTheDocument();
    expect(imports(calls).map((c) => c.body)).toEqual([
      { csv: CSV, dryRun: true },
      { csv: CSV, dryRun: false },
    ]);
    expect(within(dialog).getByText(/ne seront plus affichés nulle part/)).toBeInTheDocument();
    // La liste des comptes est rafraîchie après la création.
    await waitFor(() => expect(calls.filter((c) => c.url.startsWith('/api/admin/users?')).length).toBeGreaterThan(1));
  });

  it('télécharge les mots de passe fournis par le serveur, puis permet de fermer sans avertissement', async () => {
    const user = userEvent.setup();
    setup('/admin/comptes', '/api/admin/users/import', (call) => json(200, call.body?.dryRun ? VALID : CREATED));
    const dialog = await openAccountsDialog(user);
    await upload(user, dialog, file(CSV));
    await user.click(await within(dialog).findByRole('button', { name: 'Créer 2 comptes' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Télécharger les mots de passe provisoires' }));

    expect(downloads).toHaveLength(1);
    const { readCsvFile } = await import('../../src/features/admin/csvImport');
    expect(await readCsvFile(downloads[0])).toBe(CREATED.passwordsCsv);

    await user.click(within(dialog).getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Importer des comptes' })).not.toBeInTheDocument());
  });

  it('fermer sans avoir téléchargé les mots de passe demande confirmation, puis ferme', async () => {
    const user = userEvent.setup();
    setup('/admin/comptes', '/api/admin/users/import', (call) => json(200, call.body?.dryRun ? VALID : CREATED));
    const dialog = await openAccountsDialog(user);
    await upload(user, dialog, file(CSV));
    await user.click(await within(dialog).findByRole('button', { name: 'Créer 2 comptes' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Fermer' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Vous n’avez pas téléchargé les mots de passe provisoires');
    expect(screen.getByRole('dialog', { name: 'Importer des comptes' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Fermer sans télécharger' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Importer des comptes' })).not.toBeInTheDocument());
  });

  it('une ligne en erreur : les erreurs sont listées par ligne et la création n’est pas proposée', async () => {
    const user = userEvent.setup();
    const calls = setup('/admin/comptes', '/api/admin/users/import', () => json(200, INVALID));
    const dialog = await openAccountsDialog(user);
    await upload(user, dialog, file(CSV));

    expect(await within(dialog).findByText('1 ligne à corriger sur 3. Rien n’est créé tant que le fichier n’est pas corrigé.')).toBeInTheDocument();
    const list = within(dialog).getByRole('list', { name: 'Lignes à corriger' });
    expect(within(list).getByText('Ligne 3 — Trop Court (a)')).toBeInTheDocument();
    expect(within(list).getByText('L’identifiant doit comporter au moins 3 caractères.')).toBeInTheDocument();
    expect(within(list).getByText('Cet identifiant est déjà utilisé.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Créer/ })).not.toBeInTheDocument();
    expect(imports(calls)).toHaveLength(1);

    // On peut choisir un fichier corrigé, qui repart d'une vérification neuve.
    await user.click(within(dialog).getByRole('button', { name: 'Choisir un fichier corrigé' }));
    expect(within(dialog).getByRole('button', { name: 'Choisir un fichier' })).toBeInTheDocument();
  });

  it('plusieurs lignes en erreur : le message est au pluriel ; une liste tronquée le dit', async () => {
    const user = userEvent.setup();
    setup('/admin/comptes', '/api/admin/users/import', () => json(200, { ...INVALID, invalid: 250, total: 300, truncated: true }));
    const dialog = await openAccountsDialog(user);
    await upload(user, dialog, file(CSV));
    expect(await within(dialog).findByText('250 lignes à corriger sur 300. Rien n’est créé tant que le fichier n’est pas corrigé.')).toBeInTheDocument();
    expect(within(dialog).getByText(/Seules les premières erreurs sont affichées/)).toBeInTheDocument();
  });

  it('un fichier refusé en entier (colonne inconnue…) affiche ses raisons', async () => {
    const user = userEvent.setup();
    setup('/admin/comptes', '/api/admin/users/import', () =>
      json(200, { ...base, total: 0, valid: 0, fileErrors: ['Colonne inconnue : « telephone ». Colonnes reconnues : identifiant, nom_affiche.'] }),
    );
    const dialog = await openAccountsDialog(user);
    await upload(user, dialog, file(CSV));
    expect(await within(dialog).findByText('Ce fichier ne peut pas être importé.')).toBeInTheDocument();
    expect(within(dialog).getByText(/Colonne inconnue : « telephone »/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Créer/ })).not.toBeInTheDocument();
  });

  it('lit un fichier Excel ancien (Windows-1252) sans abîmer les accents avant de l’envoyer', async () => {
    const user = userEvent.setup();
    const calls = setup('/admin/comptes', '/api/admin/users/import', () => json(200, VALID));
    const dialog = await openAccountsDialog(user);
    // « nom_affiche;Élodie » : É = 0xC9 en Windows-1252.
    const bytes = [...'identifiant;nom_affiche\r\nelodie;'].map((c) => c.charCodeAt(0)).concat([0xc9], [...'lodie'].map((c) => c.charCodeAt(0)));
    await upload(user, dialog, file(bytes));
    await within(dialog).findByText('Le fichier est valide : 2 comptes à créer.');
    expect(imports(calls)[0].body?.csv).toBe('identifiant;nom_affiche\r\nelodie;Élodie');
  });

  it('un fichier de plus de 1 Mo est refusé avant tout envoi', async () => {
    const user = userEvent.setup();
    const calls = setup('/admin/comptes', '/api/admin/users/import', () => json(200, VALID));
    const dialog = await openAccountsDialog(user);
    await upload(user, dialog, file('x'.repeat(1_000_001)));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ce fichier dépasse 1 Mo');
    expect(imports(calls)).toHaveLength(0);
  });

  it('une erreur du serveur à la vérification est affichée et laisse choisir un autre fichier', async () => {
    const user = userEvent.setup();
    setup('/admin/comptes', '/api/admin/users/import', () => json(400, { error: { code: 'VALIDATION_ERROR', message: 'Le fichier est trop volumineux (1 Mo au plus).' } }));
    const dialog = await openAccountsDialog(user);
    await upload(user, dialog, file(CSV));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Le fichier est trop volumineux (1 Mo au plus).');
    expect(within(dialog).getByRole('button', { name: 'Choisir un fichier' })).toBeInTheDocument();
  });

  it('si le serveur refuse à la création (données modifiées entre-temps), on revient à l’aperçu avec les erreurs', async () => {
    const user = userEvent.setup();
    setup('/admin/comptes', '/api/admin/users/import', (call) => json(200, call.body?.dryRun ? VALID : { ...INVALID, dryRun: false }));
    const dialog = await openAccountsDialog(user);
    await upload(user, dialog, file(CSV));
    await user.click(await within(dialog).findByRole('button', { name: 'Créer 2 comptes' }));
    expect(await within(dialog).findByText(/1 ligne à corriger sur 3/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/comptes? créés?\./)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Créer/ })).not.toBeInTheDocument();
  });

  it('un seul compte : accords au singulier', async () => {
    const user = userEvent.setup();
    setup('/admin/comptes', '/api/admin/users/import', (call) =>
      json(200, call.body?.dryRun ? { ...VALID, total: 1, valid: 1 } : { ...CREATED, count: 1, accounts: [CREATED.accounts![0]] }),
    );
    const dialog = await openAccountsDialog(user);
    await upload(user, dialog, file(CSV));
    await user.click(await within(dialog).findByRole('button', { name: 'Créer 1 compte' }));
    expect(await within(dialog).findByText('1 compte créé.')).toBeInTheDocument();
  });

  it('Annuler ferme le dialogue sans rien envoyer', async () => {
    const user = userEvent.setup();
    const calls = setup('/admin/comptes', '/api/admin/users/import', () => json(200, VALID));
    const dialog = await openAccountsDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Importer des comptes' })).not.toBeInTheDocument());
    expect(imports(calls)).toHaveLength(0);
  });
});

describe('Import d’élèves', () => {
  const STUDENTS_CSV = 'prenom;nom;classe;telephone_parent;restauration\r\nLina;Hammami;CP Violet;06 12 34 56 78;panier\r\n';
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Importer un fichier' }));
    return screen.findByRole('dialog', { name: 'Importer des élèves' });
  };

  it('vérifie, confirme, puis rafraîchit la liste — sans mot de passe à télécharger', async () => {
    const user = userEvent.setup();
    const calls = setup('/admin/eleves', '/api/admin/students/import', (call) =>
      json(200, call.body?.dryRun ? { ...base, total: 1, valid: 1, preview: [{ line: 2, label: 'Lina Hammami', detail: 'CP Violet · panier' }] } : { ...base, dryRun: false, created: true, count: 1, total: 1, valid: 1 }),
    );
    const dialog = await open(user);
    expect(within(dialog).getAllByText(/\(obligatoire\)/)).toHaveLength(5);
    await upload(user, dialog, file(STUDENTS_CSV, 'eleves.csv'));
    expect(await within(dialog).findByText('Le fichier est valide : 1 élève à créer.')).toBeInTheDocument();
    expect(within(dialog).getByText('Lina Hammami')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Créer 1 élève' }));

    expect(await within(dialog).findByText('1 élève créé.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/mots de passe/)).not.toBeInTheDocument();
    expect(imports(calls).map((c) => c.body?.dryRun)).toEqual([true, false]);
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/admin/students' && c.method === 'GET').length).toBeGreaterThan(1));
    // Sans mot de passe en jeu, fermer ne demande aucune confirmation.
    await user.click(within(dialog).getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Importer des élèves' })).not.toBeInTheDocument());
  });

  it('une classe inconnue est signalée à sa ligne, et rien ne se crée', async () => {
    const user = userEvent.setup();
    setup('/admin/eleves', '/api/admin/students/import', () =>
      json(200, { ...base, total: 1, valid: 0, invalid: 1, issues: [{ line: 2, label: 'Lina Hammami', errors: ['Classe inconnue : « CM9 ».'] }] }),
    );
    const dialog = await open(user);
    await upload(user, dialog, file(STUDENTS_CSV));
    expect(await within(dialog).findByText('Ligne 2 — Lina Hammami')).toBeInTheDocument();
    expect(within(dialog).getByText('Classe inconnue : « CM9 ».')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Créer/ })).not.toBeInTheDocument();
  });
});
