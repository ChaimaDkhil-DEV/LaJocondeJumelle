import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeacherClassesAdminPage } from '../../src/features/parent-communications/TeacherClassesAdminPage';
import { json, mockApi, renderRoutes, route, type Call } from './helpers';

/** Classes des enseignants : liste à gauche, fiche de l'enseignant choisi à droite, classes en blocs. */

afterEach(() => vi.unstubAllGlobals());

const BILEL = { id: 't1', displayName: 'Bilel Nasri' };
const AMIRA = { id: 't2', displayName: 'Amira Ben Salem' };
const CLASSES = [
  { id: 'c1', name: '1ère année Violet', room: 'Salle 2', active: true, floor: { id: 'f1', name: '1er étage' }, level: { id: 'l1', name: '1re année' } },
  { id: 'c2', name: '2e année Bleu', room: null, active: true, floor: null, level: { id: 'l2', name: '2e année' } },
  { id: 'c3', name: '3e année Rouge', room: null, active: true, floor: null, level: null },
];

function setup(extra?: (call: Call) => Response | undefined) {
  const calls = mockApi((call) => {
    if (call.url === '/api/admin/teacher-classes' && call.method === 'GET') {
      return json(200, [
        { teacher: BILEL, classIds: ['c1', 'c2'] },
        { teacher: AMIRA, classIds: [] },
      ]);
    }
    if (call.url === '/api/admin/coverage/classes') return json(200, CLASSES);
    if (call.url.startsWith('/api/admin/teacher-classes/') && call.method === 'PUT') return json(200, { teacherId: 't1', classIds: [] });
    return extra?.(call);
  });
  renderRoutes([route('/admin/classes-enseignants', <TeacherClassesAdminPage />)], '/admin/classes-enseignants');
  return calls;
}

describe('Classes des enseignants — nouvelle présentation', () => {
  it('liste les enseignants avec leur nombre de classes ; le premier est sélectionné', async () => {
    setup();
    const list = await screen.findByRole('region', { name: 'Liste des enseignants' });
    const bilel = within(list).getByRole('button', { name: /Bilel Nasri/ });
    expect(bilel).toHaveTextContent('2 classes');
    expect(bilel).toHaveAttribute('aria-pressed', 'true');
    expect(within(list).getByRole('button', { name: /Amira Ben Salem/ })).toHaveTextContent('Aucune classe');
  });

  it('affiche chaque classe attribuée en bloc, avec son niveau', async () => {
    setup();
    const detail = await screen.findByRole('region', { name: 'Bilel Nasri' });
    const blocks = within(detail).getAllByRole('listitem');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveTextContent('1ère année Violet');
    expect(blocks[0]).toHaveTextContent('1re année');
    expect(blocks[1]).toHaveTextContent('2e année Bleu');
  });

  it('chiffres : enseignants, classes attribuées, enseignants sans classe', async () => {
    setup();
    const stats = await screen.findByRole('region', { name: 'Chiffres des affectations' });
    expect(within(stats).getByText('Enseignants').nextSibling).toHaveTextContent('2');
    expect(within(stats).getByText('Classes attribuées').nextSibling).toHaveTextContent('2');
    expect(within(stats).getByText('Enseignants sans classe').nextSibling).toHaveTextContent('1');
  });

  it('choisir un autre enseignant change la fiche ; sans classe : invite à en attribuer', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /Amira Ben Salem/ }));
    const detail = screen.getByRole('region', { name: 'Amira Ben Salem' });
    expect(within(detail).getByText('Aucune classe attribuée')).toBeInTheDocument();
    expect(within(detail).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('la recherche filtre les enseignants, sans tenir compte des accents ni de la casse', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('region', { name: 'Liste des enseignants' });
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher un enseignant' }), 'BEN sálem');
    const list = screen.getByRole('region', { name: 'Liste des enseignants' });
    expect(within(list).queryByRole('button', { name: /Bilel/ })).toBeNull();
    expect(within(list).getByRole('button', { name: /Amira/ })).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Rechercher un enseignant' }));
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher un enseignant' }), 'zzz');
    expect(screen.getByText('Aucun enseignant ne correspond.')).toBeInTheDocument();
  });

  it('« Assigner une classe » ouvre le choix des classes et envoie la liste complète', async () => {
    const user = userEvent.setup();
    const calls = setup();
    const detail = await screen.findByRole('region', { name: 'Bilel Nasri' });
    await user.click(within(detail).getByRole('button', { name: 'Assigner une classe' }));
    const dialog = await screen.findByRole('dialog', { name: 'Classes de Bilel Nasri' });
    expect(within(dialog).getByRole('checkbox', { name: '1ère année Violet' })).toBeChecked();
    await user.click(within(dialog).getByRole('checkbox', { name: '3e année Rouge' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({ classIds: ['c1', 'c2', 'c3'] });
  });

  it('retirer une classe demande confirmation, puis enregistre les autres classes', async () => {
    const user = userEvent.setup();
    const calls = setup();
    await user.click(await screen.findByRole('button', { name: 'Retirer 1ère année Violet de Bilel Nasri' }));
    const dialog = await screen.findByRole('dialog', { name: 'Retirer la classe 1ère année Violet' });
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Retirer' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe('/api/admin/teacher-classes/t1');
    expect(put.body).toEqual({ classIds: ['c2'] });
  });

  it('« Voir l’emploi du temps » mène à la page Emplois du temps de cet enseignant', async () => {
    setup();
    const link = await screen.findByRole('link', { name: 'Voir l’emploi du temps' });
    expect(link).toHaveAttribute('href', '/admin/emplois-du-temps?id=t1');
  });
});
