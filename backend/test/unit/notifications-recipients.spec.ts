import type { Notification } from '@prisma/client';
import {
  notificationRecipients,
  NotificationsService,
  type NotificationPublisher,
} from '../../src/notifications/notifications.service';

describe('notificationRecipients', () => {
  it('exclut l’auteur de l’action, les valeurs vides et les doublons', () => {
    expect(notificationRecipients(['a', 'b', null, undefined, 'a', 'auteur'], 'auteur')).toEqual(['a', 'b']);
  });

  it('garde tout le monde pour une action système (acteur null)', () => {
    expect(notificationRecipients(['a', 'b'], null)).toEqual(['a', 'b']);
  });
});

describe('NotificationsService', () => {
  function setup() {
    const created: Notification[] = [];
    const tx = {
      // Aucun super administrateur parmi les destinataires : pas de filtrage.
      user: { findMany: jest.fn(async () => []) },
      notification: {
        create: jest.fn(async ({ data }: { data: Omit<Notification, 'id' | 'createdAt' | 'readAt'> }) => {
          const row = { ...data, id: `n${created.length}`, createdAt: new Date(), readAt: null } as Notification;
          created.push(row);
          return row;
        }),
      },
    };
    const publisher: NotificationPublisher = { publish: jest.fn() };
    const service = new NotificationsService({} as never, publisher);
    return { tx, publisher, service, created };
  }

  it('écrit une notification par destinataire dans la transaction, sans l’auteur', async () => {
    const { tx, service } = setup();
    const pending = await service.notifyInTx(tx as never, ['employe', 'auteur', 'responsable'], 'auteur', {
      type: 'REQUEST_NEW',
      requestId: 'r1',
      priority: 'URGENT',
    });
    expect(tx.notification.create).toHaveBeenCalledTimes(2);
    expect(pending.map((n) => n.userId)).toEqual(['employe', 'responsable']);
    expect(pending[0]).toMatchObject({ type: 'REQUEST_NEW', requestId: 'r1', priority: 'URGENT' });
  });

  it('ne publie qu’après validation de la transaction, via flushAfterCommit', async () => {
    const { tx, service, publisher } = setup();
    const pending = await service.notifyInTx(tx as never, ['employe'], null, {
      type: 'OVERDUE',
      requestId: 'r1',
      priority: 'NORMAL',
    });
    expect(publisher.publish).not.toHaveBeenCalled();
    await service.flushAfterCommit(pending);
    expect(publisher.publish).toHaveBeenCalledWith(pending);
  });

  it('ne publie rien quand il n’y a aucun destinataire', async () => {
    const { tx, service, publisher } = setup();
    const pending = await service.notifyInTx(tx as never, ['auteur'], 'auteur', {
      type: 'MESSAGE_NEW',
      requestId: 'r1',
      priority: 'NORMAL',
    });
    expect(pending).toEqual([]);
    await service.flushAfterCommit(pending);
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
