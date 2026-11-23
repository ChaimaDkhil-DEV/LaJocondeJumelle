import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WeekGrid } from '../../src/features/timetable/WeekGrid';
import type { TimetableSession } from '../../src/features/timetable/types';

/** Grille de la semaine : séance détaillée de l'enseignant, teinte par matière, repères du jour et de l'heure. */

const DAYS = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'];
const ROSE = { id: 'k1', name: 'Préparatoire 1 - Rose', room: 'Salle 001' };
const LOTUS = { id: 'k2', name: 'Préparatoire 1 - Lotus', room: 'Salle 002' };

const session = (over: Partial<TimetableSession> = {}): TimetableSession => ({
  id: 's1',
  seriesId: null,
  detached: false,
  teacher: { id: 't1', displayName: 'Amel' },
  class: ROSE,
  level: null,
  date: '2026-11-23',
  weekday: 1,
  startAt: '2026-11-23T07:00:00.000Z',
  endAt: '2026-11-23T09:00:00.000Z',
  startTime: '08:00',
  endTime: '10:00',
  subject: 'Mathématiques',
  room: 'Salle 001',
  status: 'SCHEDULED',
  ...over,
});

const SESSIONS = [
  session(),
  session({ id: 's2', date: '2026-11-24', weekday: 2, startTime: '10:15', endTime: '12:00', subject: 'Français', class: LOTUS, room: 'Salle 002' }),
  session({ id: 's3', date: '2026-11-25', weekday: 3, subject: 'Mathématiques', class: LOTUS, room: 'Salle 002' }),
];

type Props = Partial<Parameters<typeof WeekGrid>[0]>;
const grid = (props: Props = {}) =>
  render(<WeekGrid days={DAYS} sessions={SESSIONS} selectedId={undefined} today="2026-11-23" onSelect={() => undefined} {...props} />);

const barOf = (el: HTMLElement) => getComputedStyle(el).borderLeftColor;

describe('WeekGrid : séance détaillée (emploi du temps de l’enseignant)', () => {
  it('montre l’heure, la matière, la classe et la salle, et nomme la séance avec sa matière', () => {
    grid({ detailed: true, tintBy: 'subject' });
    const block = screen.getByRole('button', { name: 'Séance de 08:00 à 10:00, Mathématiques, Préparatoire 1 - Rose' });
    expect(within(block).getByText('08:00 – 10:00')).toBeVisible();
    expect(within(block).getByText('Mathématiques')).toBeVisible();
    expect(within(block).getByText('Préparatoire 1 - Rose')).toBeVisible();
    expect(within(block).getByText('Salle 001')).toBeVisible();
  });

  it('sans salle ni matière, le nom reste celui de la séance simple et rien n’est inventé', () => {
    grid({ detailed: true, sessions: [session({ subject: null, room: null })] });
    const block = screen.getByRole('button', { name: 'Séance de 08:00 à 10:00, Préparatoire 1 - Rose' });
    expect(within(block).queryByText(/Salle/)).toBeNull();
    expect(within(block).queryByText('Mathématiques')).toBeNull();
  });

  it('la grille simple (administration) reste inchangée : heure et classe seulement', () => {
    grid();
    const block = screen.getAllByRole('button', { name: /^Séance de 08:00 à 10:00, Préparatoire 1 - Rose$/ })[0]!;
    expect(within(block).queryByText('Mathématiques')).toBeNull();
    expect(within(block).queryByText('Salle 001')).toBeNull();
  });

  it('sans onSelect, les séances ne sont pas des boutons : elles sont seulement lues', () => {
    grid({ detailed: true, onSelect: undefined });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getAllByRole('group', { name: /^Séance de / }).length).toBe(SESSIONS.length);
  });
});

describe('WeekGrid : teinte', () => {
  it('par matière : une même matière a la même teinte quelle que soit la classe, une autre matière une autre', () => {
    grid({ detailed: true, tintBy: 'subject' });
    const maths1 = screen.getByRole('button', { name: /08:00 à 10:00, Mathématiques, Préparatoire 1 - Rose/ });
    const maths2 = screen.getAllByRole('button', { name: /Mathématiques, Préparatoire 1 - Lotus/ })[0]!;
    const french = screen.getByRole('button', { name: /Français/ });
    expect(barOf(maths1)).toBe(barOf(maths2));
    expect(barOf(maths1)).not.toBe(barOf(french));
  });

  it('par classe (défaut) : une même classe a la même teinte, quelle que soit la matière', () => {
    grid({ sessions: [session(), session({ id: 'x', date: '2026-11-24', subject: 'Français' }), session({ id: 'y', date: '2026-11-25', class: LOTUS })] });
    const [rose1, rose2, lotus] = screen.getAllByRole('button');
    expect(barOf(rose1!)).toBe(barOf(rose2!));
    expect(barOf(rose1!)).not.toBe(barOf(lotus!));
  });
});

describe('WeekGrid : heures', () => {
  it('ajustée aux séances : de la première à la dernière heure, avec l’heure de fin écrite en bas', () => {
    const { container } = grid({ fitHours: true, sessions: [session(), session({ id: 'f', date: '2026-11-24', startTime: '10:15', endTime: '12:00' })] });
    const labels = [...container.querySelectorAll('[data-hour-label]')].map((el) => el.textContent);
    expect(labels).toEqual(['08:00', '09:00', '10:00', '11:00', '12:00']);
  });

  it('par défaut : 8 h – 17 h au minimum, heure de fin comprise', () => {
    const { container } = grid();
    const labels = [...container.querySelectorAll('[data-hour-label]')].map((el) => el.textContent);
    expect(labels[0]).toBe('08:00');
    expect(labels.at(-1)).toBe('17:00');
  });
});

describe('WeekGrid : repères du jour et de l’heure', () => {
  it('la colonne du jour est repérée, une seule', () => {
    const { container } = grid();
    const today = container.querySelectorAll('[data-today]');
    expect(today).toHaveLength(1);
    expect(today[0]).toHaveAttribute('data-today', '2026-11-23');
  });

  it('aucune colonne repérée quand le jour n’est pas dans la semaine affichée', () => {
    const { container } = grid({ today: '2026-12-15' });
    expect(container.querySelector('[data-today]')).toBeNull();
  });

  it('le trait de l’heure actuelle est posé à l’heure, dans la colonne du jour', () => {
    // 9 h 30 locale : une heure et demie après 8 h, à 50 px l'heure.
    const { container } = grid({ fitHours: true, now: new Date(2026, 10, 23, 9, 30) });
    const line = container.querySelector('[data-now-line]') as HTMLElement;
    expect(line).not.toBeNull();
    expect(line).toHaveAttribute('aria-hidden', 'true');
    expect(line.parentElement).toHaveAttribute('data-today', '2026-11-23');
    expect(line).toHaveStyle({ top: '75px' });
  });

  it.each([
    ['avant la plage affichée', new Date(2026, 10, 23, 6, 0)],
    ['après la plage affichée', new Date(2026, 10, 23, 19, 0)],
  ])('pas de trait %s', (_label, now) => {
    const { container } = grid({ fitHours: true, now, sessions: [session({ endTime: '12:00' })] });
    expect(container.querySelector('[data-now-line]')).toBeNull();
  });

  it('pas de trait quand le jour n’est pas dans la semaine affichée, ni sans heure fournie', () => {
    expect(grid({ now: new Date(2026, 11, 15, 9, 30), today: '2026-12-15' }).container.querySelector('[data-now-line]')).toBeNull();
  });

  it('pas de trait sans heure fournie', () => {
    expect(grid().container.querySelector('[data-now-line]')).toBeNull();
  });
});

describe('WeekGrid : présence de l’enseignant (administration)', () => {
  const BILEL = { id: 't2', displayName: 'Bilel Professeur' };
  const presence = (over: Partial<NonNullable<TimetableSession['presence']>> = {}): NonNullable<TimetableSession['presence']> => ({
    status: 'PRESENT',
    arrivedAt: '2026-11-23T07:00:00.000Z',
    lateMinutes: null,
    lateReason: null,
    requestId: null,
    replacedBy: null,
    substitute: null,
    ...over,
  });
  const makeSession = session;
  const withPresence = (over: Partial<NonNullable<TimetableSession['presence']>>, extra: Partial<TimetableSession> = {}) =>
    grid({ showPresence: true, sessions: [makeSession({ presence: presence(over), ...extra })] });

  it.each([
    ['PRESENT', 'Présent'],
    ['NOT_ARRIVED', 'Non arrivé'],
    ['EXCUSED', 'Absence justifiée'],
    ['EXPECTED', 'Attendu'],
  ] as const)('%s : le statut est écrit sur la séance (« %s »)', (status, label) => {
    withPresence({ status });
    const block = screen.getByRole('button', { name: new RegExp(`Séance de 08:00 à 10:00, Préparatoire 1 - Rose, ${label}$`) });
    expect(within(block).getByText(label)).toBeVisible();
  });

  it('en retard : le statut et la durée du retard', () => {
    withPresence({ status: 'LATE', lateMinutes: 12, lateReason: 'ARRIVAL' });
    const block = screen.getByRole('button', { name: /En retard, 12 min$/ });
    expect(within(block).getByText('En retard')).toBeVisible();
    expect(within(block).getByText('12 min')).toBeVisible();
  });

  it('en retard sans durée connue : le statut seul', () => {
    withPresence({ status: 'LATE', lateMinutes: null, lateReason: 'ANNOUNCED' });
    const block = screen.getByRole('button', { name: /En retard$/ });
    expect(within(block).queryByText(/min$/)).toBeNull();
  });

  it('remplacé : le nom du remplaçant est sur la séance, sans ouvrir le détail, et le titulaire reste celui de la séance', () => {
    withPresence({ status: 'EXCUSED', replacedBy: BILEL, substitute: { teacher: BILEL, status: 'PRESENT', arrivedAt: '2026-11-23T07:05:00.000Z', lateMinutes: null } });
    const block = screen.getByRole('button', { name: /Absence justifiée, remplacé\(e\) par Bilel Professeur$/ });
    expect(within(block).getByText('Absence justifiée')).toBeVisible();
    expect(within(block).getByText('Remplacé(e) par Bilel Professeur')).toBeVisible();
  });

  it('à venir : rien de plus que l’heure et la classe (pas de pastille sur chaque séance future)', () => {
    withPresence({ status: 'UPCOMING', arrivedAt: null });
    const block = screen.getByRole('button', { name: 'Séance de 08:00 à 10:00, Préparatoire 1 - Rose' });
    expect(within(block).queryByText('À venir')).toBeNull();
  });

  it('séance annulée : « Annulée » seulement, sans statut de présence', () => {
    withPresence({ status: 'PRESENT' }, { status: 'CANCELLED' });
    const block = screen.getByRole('button', { name: /Séance annulée de 08:00 à 10:00, Préparatoire 1 - Rose$/ });
    expect(within(block).getByText('Annulée')).toBeVisible();
    expect(within(block).queryByText('Présent')).toBeNull();
  });

  it('sans showPresence ou sans présence reçue : la grille reste celle d’avant', () => {
    grid({ sessions: [session({ presence: presence({ status: 'NOT_ARRIVED' }) })] });
    expect(screen.getByRole('button', { name: 'Séance de 08:00 à 10:00, Préparatoire 1 - Rose' })).toBeVisible();
    expect(screen.queryByText('Non arrivé')).toBeNull();
    grid({ showPresence: true, sessions: [session({ id: 'sans', presence: undefined })] });
    expect(screen.getAllByRole('button', { name: 'Séance de 08:00 à 10:00, Préparatoire 1 - Rose' }).length).toBeGreaterThan(0);
  });

  it('l’icône du statut n’est pas la seule information : le libellé est écrit', () => {
    const { container } = withPresence({ status: 'NOT_ARRIVED' });
    expect(container.querySelector('[data-presence="NOT_ARRIVED"] svg')).not.toBeNull();
    expect(container.querySelector('[data-presence="NOT_ARRIVED"]')).toHaveTextContent('Non arrivé');
  });
});
