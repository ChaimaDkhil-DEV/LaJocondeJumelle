import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { navItemsFor } from '../../src/app/AppLayout';
import type { Me } from '../../src/api/types';
import { notificationPath } from '../../src/features/notifications/api';
import { GuardiansAdminPage } from '../../src/features/parent-communications/GuardiansAdminPage';
import { TeacherClassesAdminPage } from '../../src/features/parent-communications/TeacherClassesAdminPage';
import { json, mockApi, renderRoutes, route } from './helpers';

/** 015 — navigation par rôle, liens des notifications, représentants et classes des enseignants. */

afterEach(() => vi.unstubAllGlobals());

const me = (overrides: Partial<Me>): Me =>
  ({
    id: 'u1',
    username: 'u',
    displayName: 'U',
    jobTitle: null,
    role: 'EMPLOYEE',
    permissions: [],
    mustChangePassword: false,
    ...overrides,
  }) as Me;
const labels = (user: Me) => navItemsFor(user).map((item) => item.label);

describe('Navigation', () => {
  it('un parent ne voit que « Messages de l’école »', () => {
    expect(labels(me({ role: 'PARENT' }))).toEqual(['Messages de l’école']);
  });

  it('un enseignant voit la communication avec les parents ; un validateur, les communications à valider', () => {
    expect(labels(me({ isTeacher: true }))).toContain('Parents');
    expect(labels(me({ isTeacher: true }))).not.toContain('À valider');
    expect(
      labels(me({ role: 'SUPER_ADMIN', permissions: ['PARENT_COMMUNICATION_VALIDATE'] })),
    ).toContain('À valider');
    expect(labels(me({}))).not.toContain('Parents');
  });

  it('la surveillante générale (admin) voit « À valider » avec la permission, plus si elle lui est retirée', () => {
    expect(labels(me({ role: 'ADMIN', permissions: ['PARENT_COMMUNICATION_VALIDATE'] }))).toContain(
      'À valider',
    );
    expect(labels(me({ role: 'ADMIN', permissions: [] }))).not.toContain('À valider');
  });
});

describe('Notifications d’une communication', () => {
  it('ouvrent la page de chacun', () => {
    const item = (type: string) =>
      ({
        id: 'n',
        type,
        priority: 'NORMAL',
        request: null,
        communication: { id: 'pc1', studentName: 'Lina Ben Salah' },
        createdAt: '',
        readAt: null,
      }) as never;
    expect(notificationPath(item('PARENT_MESSAGE_NEW'))).toBe('/messages-ecole/pc1');
    expect(notificationPath(item('PARENT_COMM_TO_VALIDATE'))).toBe('/communications-a-valider/pc1');
    expect(notificationPath(item('PARENT_COMM_RETURNED'))).toBe('/communications-parents/pc1');
    // Conversations (015) : message d'un parent validé → conversation de l'enseignant ; un compte
    // parent ouvre toujours la conversation du message (le sien retourné, rejeté ou transmis).
    expect(notificationPath(item('TEACHER_MESSAGE_NEW'))).toBe(
      '/communications-parents/message/pc1',
    );
    expect(notificationPath(item('PARENT_COMM_RETURNED'), true)).toBe('/messages-ecole/pc1');
    expect(notificationPath(item('PARENT_COMM_APPROVED'), true)).toBe('/messages-ecole/pc1');
    expect(
      notificationPath({
        id: 'n',
        type: 'URGENT',
        priority: 'URGENT',
        request: { id: 'r1', reference: 'D-1', title: 'T', kind: 'WORK' },
        communication: null,
        createdAt: '',
        readAt: null,
      } as never),
    ).toBe('/demandes/r1');
  });
});

describe('Représentants légaux', () => {
  const GUARDIAN = {
    id: 'g1',
    firstName: 'Sonia',
    lastName: 'Ben Salah',
    relationship: 'Mère',
    phone: null,
    email: 'sonia@example.org',
    active: true,
    account: null,
    students: [
      {
        id: 's1',
        firstName: 'Lina',
        lastName: 'Ben Salah',
        active: true,
        class: { id: 'c1', name: '1ère année Violet' },
      },
    ],
  };

  it('crée le compte parent et montre le mot de passe provisoire une seule fois', async () => {
    const user = userEvent.setup();
    const calls = mockApi((call) => {
      if (call.url === '/api/admin/guardians' && call.method === 'GET')
        return json(200, [GUARDIAN]);
      if (call.url === '/api/admin/students')
        return json(200, [{ ...GUARDIAN.students[0], classId: 'c1' }]);
      if (call.url === '/api/admin/guardians/g1/account')
        return json(201, {
          guardian: { ...GUARDIAN, account: { id: 'p1', username: 'parent.lina', active: true } },
          temporaryPassword: 'Provisoire-123',
        });
      return undefined;
    });
    renderRoutes([route('/admin/representants', <GuardiansAdminPage />)], '/admin/representants');
    const row = await screen.findByRole('row', { name: /Sonia Ben Salah/ });
    expect(within(row).getByText(/Lina Ben Salah/)).toBeVisible();
    await user.click(within(row).getByRole('button', { name: 'Créer le compte parent' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compte parent de Sonia Ben Salah' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Identifiant' }), 'parent.lina');
    await user.click(within(dialog).getByRole('button', { name: 'Créer le compte' }));
    expect(await screen.findByText('Provisoire-123')).toBeVisible();
    expect(calls.find((c) => c.url.endsWith('/account'))!.body).toEqual({
      username: 'parent.lina',
    });
  });
});

describe('Classes des enseignants', () => {
  it('enregistre les classes attribuées à un enseignant', async () => {
    const user = userEvent.setup();
    const calls = mockApi((call) => {
      if (call.url === '/api/admin/teacher-classes' && call.method === 'GET')
        return json(200, [{ teacher: { id: 't1', displayName: 'Mme Enseignante' }, classIds: [] }]);
      if (call.url === '/api/admin/coverage/classes') {
        return json(200, [
          { id: 'c1', name: '1ère année Violet', room: null, active: true },
          { id: 'c2', name: '2e année Bleu', room: null, active: true },
        ]);
      }
      if (call.url === '/api/admin/teacher-classes/t1')
        return json(200, { teacherId: 't1', classIds: ['c1'] });
      return undefined;
    });
    renderRoutes(
      [route('/admin/classes-enseignants', <TeacherClassesAdminPage />)],
      '/admin/classes-enseignants',
    );
    await user.click(
      await screen.findByRole('button', { name: 'Modifier les classes de Mme Enseignante' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Classes de Mme Enseignante' });
    await user.click(within(dialog).getByRole('checkbox', { name: '1ère année Violet' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({ classIds: ['c1'] });
  });
});
