import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { AttendanceFollowUpTab } from '../../src/features/attendance/AttendanceFollowUpTab';
import { MyAttendanceTab } from '../../src/features/attendance/MyAttendanceTab';
import { QrEntryPage } from '../../src/features/attendance/QrEntryPage';
import type { AnnouncedItem, AttendanceDay, AttendanceItem } from '../../src/features/attendance/types';
import { CoveragePage } from '../../src/features/coverage/CoveragePage';

/**
 * Pointage des enseignants par QR (écrans) : ouvrir le lien n'enregistre rien, l'identité et l'heure
 * viennent du serveur, aucune absence n'est déduite d'un défaut de scan, les corrections sont motivées.
 */

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const TOKEN = 'c1.0a1b2c3d-1111-4222-8333-444455556666.1.c2lnbmF0dXJl';
const VIOLET = { id: 'k1', name: '1ère année Violet', room: 'Salle 12' };
const BLEU = { id: 'k2', name: '2e année Bleu', room: null };
const ENS = { id: 't1', displayName: 'Enseignante' };
const REMPL = { id: 't2', displayName: 'Remplaçant' };
const ADMIN = { id: 'a1', displayName: 'Admin' };

const PROFILES = {
  teacher: { isTeacher: true, isSupervisor: false, canManage: false },
  supervisor: { isTeacher: false, isSupervisor: true, canManage: false },
  both: { isTeacher: true, isSupervisor: true, canManage: false },
  admin: { isTeacher: false, isSupervisor: false, canManage: true },
} as const;

function attendance(overrides: Partial<AttendanceItem> = {}): AttendanceItem {
  return {
    id: 'p1',
    date: '2026-11-05',
    method: 'QR',
    status: 'ARRIVED',
    arrivedAt: '2026-11-05T08:12:00.000Z',
    recordedAt: '2026-11-05T08:12:00.000Z',
    comment: null,
    class: VIOLET,
    teacher: ENS,
    recordedBy: ENS,
    requestId: null,
    announcedType: null,
    announcedLateMinutes: null,
    substituteFor: null,
    anomaly: false,
    ...overrides,
  };
}

function day(overrides: Partial<AttendanceDay> = {}): AttendanceDay {
  return { date: '2026-11-05', attendances: [], announced: [], emptyClasses: [], classStates: [], ...overrides };
}

function announced(overrides: Partial<AnnouncedItem> = {}): AnnouncedItem {
  return {
    requestId: 'r1',
    type: 'LATENESS',
    startAt: '2026-11-05T08:00:00.000Z',
    plannedEndAt: '2026-11-05T10:00:00.000Z',
    class: VIOLET,
    teacher: ENS,
    substituteTeacher: null,
    status: 'PENDING',
    attendanceId: null,
    ...overrides,
  };
}

/** Rend `ui` avec un faux serveur ; `handler` répond en premier, sinon des listes vides. */
function mount(ui: ReactNode, path: string, handler: (call: Call) => Response | undefined = () => undefined) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: Call = { url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined };
      calls.push(call);
      const custom = handler(call);
      if (custom) return custom;
      if (url === '/api/coverage/classes') return json(200, [{ ...VIOLET, floor: null }, { ...BLEU, floor: null }]);
      if (url === '/api/coverage/teachers') return json(200, [ENS, REMPL]);
      return json(200, []);
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return calls;
}

const posts = (calls: Call[], url: string) => calls.filter((c) => c.method === 'POST' && c.url === url);
const where = () => {
  function Where() {
    const location = useLocation();
    return <p data-testid="where">{location.pathname + location.search}</p>;
  }
  return <Where />;
};

afterEach(() => vi.unstubAllGlobals());

describe('Page du QR code : aiguillage selon le profil', () => {
  const routes = (
    <Routes>
      <Route path="/gardes/presence" element={<QrEntryPage />} />
    </Routes>
  );
  const profileOf = (kind: keyof typeof PROFILES) => (call: Call) => {
    if (call.url === '/api/coverage/availability') return json(200, { availability: 'AVAILABLE', activeGuards: [], ...PROFILES[kind] });
    if (call.url === '/api/attendance/resolve') return json(200, { class: VIOLET, attendance: null, preview: { kind: 'NONE' } });
    if (call.url === '/api/coverage/presence/resolve') return json(200, { class: VIOLET, coverage: null, otherClassGuard: false });
    return undefined;
  };

  it('un enseignant arrive sur l’enregistrement de son arrivée', async () => {
    mount(routes, `/gardes/presence?c=${TOKEN}`, profileOf('teacher'));
    expect(await screen.findByRole('button', { name: 'Enregistrer mon arrivée' })).toBeInTheDocument();
  });

  it('un surveillant garde la page de présence en garde', async () => {
    const calls = mount(routes, `/gardes/presence?c=${TOKEN}`, profileOf('supervisor'));
    expect(await screen.findByText(/pas de garde en cours pour la classe/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer mon arrivée' })).not.toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/attendance/resolve')).toBe(false);
  });

  it('enseignant et surveillant : page de l’enseignant, avec un lien vers la page de garde', async () => {
    mount(routes, `/gardes/presence?c=${TOKEN}`, profileOf('both'));
    const link = await screen.findByRole('link', { name: 'Je suis ici en tant que surveillant' });
    expect(link).toHaveAttribute('href', expect.stringContaining('as=surveillant'));
  });

  it('« as=surveillant » force la page de garde pour un compte enseignant et surveillant', async () => {
    mount(routes, `/gardes/presence?c=${TOKEN}&as=surveillant`, profileOf('both'));
    expect(await screen.findByText(/pas de garde en cours pour la classe/)).toBeInTheDocument();
  });
});

describe('Enregistrer mon arrivée', () => {
  const routes = (
    <Routes>
      <Route path="/gardes/presence" element={<QrEntryPage />} />
    </Routes>
  );

  function server(options: { preview?: unknown; existing?: AttendanceItem | null; arrive?: Response } = {}) {
    let recorded: AttendanceItem | null = options.existing ?? null;
    return (call: Call) => {
      if (call.url === '/api/coverage/availability') return json(200, { availability: 'AVAILABLE', activeGuards: [], ...PROFILES.teacher });
      if (call.url === '/api/attendance/resolve') {
        return json(200, { class: VIOLET, attendance: recorded, preview: options.preview ?? { kind: 'NONE' } });
      }
      if (call.url === '/api/attendance/arrive') {
        if (options.arrive) return options.arrive;
        recorded = attendance();
        return json(201, { created: true, attendance: recorded, match: { kind: 'NONE' } });
      }
      return undefined;
    };
  }

  it('ouvrir le lien n’enregistre rien ; un appui envoie le jeton seul (ni identité ni heure)', async () => {
    const user = userEvent.setup();
    const calls = mount(routes, `/gardes/presence?c=${TOKEN}`, server());
    const button = await screen.findByRole('button', { name: 'Enregistrer mon arrivée' });
    expect(screen.getByRole('heading', { name: VIOLET.name })).toBeInTheDocument();
    expect(screen.getByText('Votre arrivée sera enregistrée à l’heure du serveur.')).toBeInTheDocument();
    expect(posts(calls, '/api/attendance/arrive')).toHaveLength(0);

    await user.click(button);
    await waitFor(() => expect(posts(calls, '/api/attendance/arrive')).toHaveLength(1));
    expect(posts(calls, '/api/attendance/arrive')[0].body).toEqual({ token: TOKEN });
  });

  it('la confirmation reste affichée après le rafraîchissement qui suit l’enregistrement', async () => {
    const user = userEvent.setup();
    const calls = mount(routes, `/gardes/presence?c=${TOKEN}`, server());
    await user.click(await screen.findByRole('button', { name: 'Enregistrer mon arrivée' }));

    expect(await screen.findByText('Votre arrivée est enregistrée.')).toBeInTheDocument();
    // Le serveur renvoie désormais le pointage à la résolution du QR : la confirmation ne doit pas être remplacée.
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/attendance/resolve').length).toBeGreaterThan(1));
    expect(screen.getByText('Votre arrivée est enregistrée.')).toBeInTheDocument();
    expect(screen.queryByText('Votre arrivée était déjà enregistrée pour aujourd’hui.')).not.toBeInTheDocument();
    const summary = screen.getByText('Enseignant').closest('dl')!;
    expect(within(summary).getByText('Enseignante')).toBeInTheDocument();
    expect(within(summary).getByText(VIOLET.name)).toBeInTheDocument();
    expect(within(summary).getByText('Arrivée enregistrée')).toBeInTheDocument();
    expect(screen.getByText('L’heure enregistrée est celle du serveur au moment du scan.')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Mes présences' })) {
      expect(link).toHaveAttribute('href', '/gardes?onglet=mes-presences');
    }
  });

  it('arrivée déjà enregistrée aujourd’hui : confirmation, aucun bouton', async () => {
    mount(routes, `/gardes/presence?c=${TOKEN}`, server({ existing: attendance() }));
    expect(await screen.findByText('Votre arrivée était déjà enregistrée pour aujourd’hui.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer mon arrivée' })).not.toBeInTheDocument();
  });

  it.each([
    [{ kind: 'ANNOUNCED_LATENESS', requestId: 'r1', lateMinutes: 12 }, /retard pour cette classe/],
    [{ kind: 'ANNOUNCED_ABSENCE', requestId: 'r1' }, /annoncé une absence couvrant ce moment/],
    [{ kind: 'SUBSTITUTE', requestId: 'r1', titularId: 't1' }, /remplaçant autorisé/],
  ])('annonce trouvée (%j) : message adapté avant l’enregistrement', async (preview, message) => {
    mount(routes, `/gardes/presence?c=${TOKEN}`, server({ preview }));
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('QR invalide : message du serveur, aucun bouton', async () => {
    mount(routes, `/gardes/presence?c=${TOKEN}`, (call) => {
      if (call.url === '/api/coverage/availability') return json(200, { availability: 'AVAILABLE', activeGuards: [], ...PROFILES.teacher });
      if (call.url === '/api/attendance/resolve') return json(422, { error: { code: 'QR_INVALID', message: 'Ce QR code n’est pas valide ou a été révoqué. Demandez le QR code à jour.' } });
      return undefined;
    });
    expect(await screen.findByText(/n’est pas valide ou a été révoqué/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer mon arrivée' })).not.toBeInTheDocument();
  });

  it('échec de l’enregistrement : erreur annoncée, nouvelle tentative possible', async () => {
    const user = userEvent.setup();
    mount(routes, `/gardes/presence?c=${TOKEN}`, server({ arrive: json(500, { error: { code: 'INTERNAL', message: 'Erreur.' } }) }));
    await user.click(await screen.findByRole('button', { name: 'Enregistrer mon arrivée' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer mon arrivée' })).toBeEnabled();
  });
});

describe('Mes présences (enseignant)', () => {
  it('liste les arrivées avec le statut, le retard annoncé, le remplacement et la saisie de l’admin', async () => {
    mount(<MyAttendanceTab />, '/', (call) =>
      call.url === '/api/attendance/mine'
        ? json(200, [
            attendance({ id: 'a', announcedType: 'LATENESS', announcedLateMinutes: 12 }),
            attendance({ id: 'b', class: BLEU, substituteFor: { id: 't9', displayName: 'Titulaire' }, announcedType: 'ABSENCE' }),
            attendance({ id: 'c', method: 'MANUAL', status: 'LATE', recordedBy: ADMIN, comment: 'Oubli de scan' }),
          ])
        : undefined,
    );
    const list = await screen.findByRole('list', { name: 'Mes présences' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText('Retard annoncé : 12 min après l’heure indiquée')).toBeInTheDocument();
    expect(within(list).getByText('Remplacement de Titulaire')).toBeInTheDocument();
    expect(within(list).getByText('En retard')).toBeInTheDocument();
    expect(within(list).getByText(/Saisi par Admin — Oubli de scan/)).toBeInTheDocument();
  });

  it('aucune présence : état vide explicite', async () => {
    mount(<MyAttendanceTab />, '/', (call) => (call.url === '/api/attendance/mine' ? json(200, []) : undefined));
    expect(await screen.findByText('Aucune présence enregistrée')).toBeInTheDocument();
  });

  it('« Scanner QR Code » : sans caméra, coller le lien ouvre la page de la classe ; un texte invalide est refusé', async () => {
    const user = userEvent.setup();
    mount(
      <>
        <MyAttendanceTab />
        {where()}
      </>,
      '/',
      (call) => (call.url === '/api/attendance/mine' ? json(200, []) : undefined),
    );
    await user.click(await screen.findByRole('button', { name: 'Scanner QR Code' }));
    const dialog = await screen.findByRole('dialog', { name: 'Scanner le QR code de la classe' });
    // jsdom n'a pas de caméra : l'alternative sans caméra est annoncée et utilisable.
    expect(within(dialog).getByText(/La caméra n’est pas disponible/)).toBeInTheDocument();

    const field = within(dialog).getByRole('textbox', { name: 'Lien ou code du QR code' });
    await user.type(field, 'n-importe-quoi');
    await user.click(within(dialog).getByRole('button', { name: 'Continuer' }));
    expect(within(dialog).getByText('Ce lien ou ce code n’est pas celui d’un QR code de classe.')).toBeInTheDocument();

    await user.clear(field);
    await user.type(field, `https://ecole.example/gardes/presence?c=${encodeURIComponent(TOKEN)}`);
    await user.click(within(dialog).getByRole('button', { name: 'Continuer' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/gardes/presence?c=${encodeURIComponent(TOKEN)}`));
  });
});

describe('Suivi des présences (admin)', () => {
  const server = (data: AttendanceDay, extra?: (call: Call) => Response | undefined) => (call: Call) => {
    const custom = extra?.(call);
    if (custom) return custom;
    if (call.url.startsWith('/api/attendance/day')) return json(200, data);
    return undefined;
  };

  it('un défaut de scan n’est jamais présenté comme une absence', async () => {
    mount(<AttendanceFollowUpTab />, '/', server(day({ announced: [announced()] })));
    const list = await screen.findByRole('list', { name: 'Retards et absences annoncés' });
    expect(within(list).getByText('Aucun scan enregistré')).toBeInTheDocument();
    expect(within(list).queryByText('Absent')).not.toBeInTheDocument();
    expect(screen.getByText(/un défaut de scan n’est jamais une absence/)).toBeInTheDocument();
  });

  it('pointages du jour : statut, méthode, retard annoncé, anomalie ; classe vide puis occupée', async () => {
    mount(
      <AttendanceFollowUpTab />,
      '/',
      server(
        day({
          attendances: [
            attendance({ announcedType: 'LATENESS', announcedLateMinutes: 25 }),
            attendance({ id: 'p2', class: BLEU, teacher: REMPL, recordedBy: REMPL, announcedType: 'ABSENCE', anomaly: true }),
          ],
          announced: [announced({ attendanceId: 'p1' })],
          classStates: [
            {
              class: VIOLET,
              current: 'OCCUPIED',
              events: [
                { at: '2026-11-05T08:10:00.000Z', kind: 'EMPTY' },
                { at: '2026-11-05T08:15:00.000Z', kind: 'ARRIVAL' },
              ],
            },
          ],
        }),
      ),
    );
    const arrivals = await screen.findByRole('list', { name: 'Arrivées enregistrées' });
    expect(within(arrivals).getByText('Retard annoncé : 25 min après l’heure indiquée')).toBeInTheDocument();
    expect(within(arrivals).getByText('Absence annoncée : à vérifier')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Retards et absences annoncés' })).getByText('Arrivée scannée')).toBeInTheDocument();
    const states = screen.getByRole('list', { name: 'État des classes' });
    expect(within(states).getByText('Occupée')).toBeInTheDocument();
    expect(within(states).getByText(/Classe vide .* → Arrivée /)).toBeInTheDocument();
  });

  it('régularisation : choix de l’enseignant et de la classe obligatoires', async () => {
    const user = userEvent.setup();
    const calls = mount(<AttendanceFollowUpTab />, '/', server(day()));
    await user.click(await screen.findByRole('button', { name: 'Régulariser une présence' }));
    const dialog = await screen.findByRole('dialog', { name: 'Régulariser une présence' });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Choisissez l’enseignant et la classe.');
    expect(posts(calls, '/api/attendance/manual')).toHaveLength(0);
  });

  it('régularisation « en retard » avec heure réelle : envoie le jour, le statut, l’heure et le commentaire', async () => {
    const user = userEvent.setup();
    const calls = mount(<AttendanceFollowUpTab />, '/', server(day(), (call) => (call.url === '/api/attendance/manual' ? json(201, attendance({ method: 'MANUAL', status: 'LATE' })) : undefined)));
    await user.click(await screen.findByRole('button', { name: 'Régulariser une présence' }));
    const dialog = await screen.findByRole('dialog', { name: 'Régulariser une présence' });
    await user.click(within(dialog).getByRole('combobox', { name: /Enseignant/ }));
    await user.click(await screen.findByRole('option', { name: 'Enseignante' }));
    await user.click(within(dialog).getByRole('combobox', { name: /Classe/ }));
    await user.click(await screen.findByRole('option', { name: VIOLET.name }));
    await user.click(within(dialog).getByRole('radio', { name: 'Marquer en retard' }));
    await user.type(within(dialog).getByLabelText(/Heure réelle d’arrivée/), '08:40');
    await user.type(within(dialog).getByLabelText(/Commentaire/), 'Oubli de scan');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(posts(calls, '/api/attendance/manual')).toHaveLength(1));
    expect(posts(calls, '/api/attendance/manual')[0].body).toEqual({
      teacherId: 't1',
      classId: 'k1',
      date: '2026-11-05',
      status: 'LATE',
      arrivedTime: '08:40',
      comment: 'Oubli de scan',
    });
  });

  it('absence : pas d’heure d’arrivée, motif exigé par le serveur et affiché', async () => {
    const user = userEvent.setup();
    const calls = mount(
      <AttendanceFollowUpTab />,
      '/',
      server(day(), (call) =>
        call.url === '/api/attendance/manual'
          ? json(400, { error: { code: 'VALIDATION_ERROR', message: 'Indiquez le motif de l’absence.', fields: [{ field: 'comment', messages: ['Indiquez le motif de l’absence.'] }] } })
          : undefined,
      ),
    );
    await user.click(await screen.findByRole('button', { name: 'Régulariser une présence' }));
    const dialog = await screen.findByRole('dialog', { name: 'Régulariser une présence' });
    await user.click(within(dialog).getByRole('combobox', { name: /Enseignant/ }));
    await user.click(await screen.findByRole('option', { name: 'Enseignante' }));
    await user.click(within(dialog).getByRole('combobox', { name: /Classe/ }));
    await user.click(await screen.findByRole('option', { name: VIOLET.name }));
    await user.click(within(dialog).getByRole('radio', { name: 'Marquer absent' }));
    expect(within(dialog).queryByLabelText(/Heure réelle d’arrivée/)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Motif de l’absence/)).toBeRequired();
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Indiquez le motif de l’absence.');
    expect(posts(calls, '/api/attendance/manual')[0].body).not.toHaveProperty('arrivedTime');
  });

  it('correction d’un scan : pas d’absence, ni d’heure ; motif obligatoire, envoyé avec le nouveau statut', async () => {
    const user = userEvent.setup();
    const calls = mount(
      <AttendanceFollowUpTab />,
      '/',
      server(day({ attendances: [attendance()] }), (call) => (call.url === '/api/attendance/p1' ? json(200, attendance({ status: 'LATE' })) : undefined)),
    );
    await user.click(await screen.findByRole('button', { name: 'Corriger' }));
    const dialog = await screen.findByRole('dialog', { name: 'Corriger : Enseignante' });
    expect(within(dialog).queryByLabelText(/Nouvelle heure d’arrivée/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('combobox', { name: 'Nouveau statut' }));
    expect(screen.queryByRole('option', { name: 'Absent' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'En retard' }));

    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Indiquez le motif de la correction.');
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/Motif de la correction/), 'Arrivé après la sonnerie');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1));
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ status: 'LATE', reason: 'Arrivé après la sonnerie' });
  });

  it('remplaçant : désigné sur une absence annoncée, le titulaire est exclu de la liste', async () => {
    const user = userEvent.setup();
    const calls = mount(
      <AttendanceFollowUpTab />,
      '/',
      server(day({ announced: [announced({ type: 'ABSENCE' }), announced({ requestId: 'r2', type: 'LATENESS' })] }), (call) =>
        call.url === '/api/attendance/substitutes/r1' ? json(200, { requestId: 'r1', substituteTeacherId: 't2' }) : undefined,
      ),
    );
    // Seule l'absence propose un remplaçant.
    const buttons = await screen.findAllByRole('button', { name: 'Désigner un remplaçant' });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Remplaçant de Enseignante' });
    await user.click(within(dialog).getByRole('combobox', { name: 'Enseignant remplaçant' }));
    expect(screen.queryByRole('option', { name: 'Enseignante' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'Remplaçant' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1));
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ teacherId: 't2' });
  });
});

describe('Onglets de la page Gardes', () => {
  const tabsFor = async (profile: keyof typeof PROFILES) => {
    mount(<CoveragePage />, '/gardes', (call) =>
      call.url === '/api/coverage/availability' ? json(200, { availability: 'AVAILABLE', activeGuards: [], ...PROFILES[profile] }) : undefined,
    );
    return (await screen.findAllByRole('tab')).map((tab) => tab.textContent);
  };

  it('l’enseignant a « Mes présences »', async () => {
    expect(await tabsFor('teacher')).toEqual(['Mes signalements', 'Mes présences']);
  });

  it('l’admin a « Présences » ; le surveillant seul n’a aucun onglet de pointage', async () => {
    expect(await tabsFor('admin')).toContain('Présences');
  });

  it('le surveillant seul n’a aucun onglet de pointage', async () => {
    expect((await tabsFor('supervisor')).join()).not.toMatch(/présences/i);
  });
});
