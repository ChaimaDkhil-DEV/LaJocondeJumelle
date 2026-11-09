import type { Notification } from '@prisma/client';
import { CompositeNotificationPublisher } from '../../src/notifications/composite-notification.publisher';

/**
 * 014, T012 (research R2) : la publication Socket.IO reste attendue comme aujourd'hui ; le push est
 * confié ensuite au dispatcher, sans être attendu, et ne fait jamais échouer l'action métier (FR-005).
 */

const notification = { id: 'n1', userId: 'u1', type: 'ASSIGNED', requestId: 'r1', priority: 'URGENT' } as unknown as Notification;

function setup(enqueue: jest.Mock = jest.fn()) {
  const order: string[] = [];
  const socket = {
    publish: jest.fn(async () => {
      order.push('socket');
    }),
  };
  enqueue.mockImplementation(() => {
    order.push('push');
  });
  const dispatcher = { enqueue };
  const publisher = new CompositeNotificationPublisher(socket as never, dispatcher as never);
  return { publisher, socket, dispatcher, order };
}

describe('CompositeNotificationPublisher', () => {
  it('attend Socket.IO, puis confie les notifications au push', async () => {
    const { publisher, socket, dispatcher, order } = setup();
    await publisher.publish([notification]);
    expect(socket.publish).toHaveBeenCalledWith([notification]);
    expect(dispatcher.enqueue).toHaveBeenCalledWith([notification]);
    expect(order).toEqual(['socket', 'push']);
  });

  it('n’attend pas le push : une promesse jamais résolue ne bloque pas la publication', async () => {
    const enqueue = jest.fn();
    const { publisher } = setup(enqueue);
    enqueue.mockReturnValue(new Promise(() => undefined));
    await expect(publisher.publish([notification])).resolves.toBeUndefined();
  });

  it('une exception du push ne remonte jamais', async () => {
    const enqueue = jest.fn();
    const { publisher } = setup(enqueue);
    enqueue.mockImplementation(() => {
      throw new Error('panne push');
    });
    await expect(publisher.publish([notification])).resolves.toBeUndefined();
  });

  it('un rejet du push ne remonte jamais', async () => {
    const enqueue = jest.fn();
    const { publisher } = setup(enqueue);
    enqueue.mockReturnValue(Promise.reject(new Error('panne push')));
    await expect(publisher.publish([notification])).resolves.toBeUndefined();
    // Laisse passer le rejet : aucune « unhandled rejection » ne doit apparaître.
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('confie quand même le push si Socket.IO échoue, et laisse remonter l’erreur de Socket.IO comme aujourd’hui', async () => {
    const { publisher, socket, dispatcher } = setup();
    socket.publish.mockRejectedValueOnce(new Error('panne socket'));
    await expect(publisher.publish([notification])).rejects.toThrow('panne socket');
    expect(dispatcher.enqueue).toHaveBeenCalledWith([notification]);
  });

  it('ne fait rien pour une liste vide', async () => {
    const { publisher, socket, dispatcher } = setup();
    await publisher.publish([]);
    expect(socket.publish).not.toHaveBeenCalled();
    expect(dispatcher.enqueue).not.toHaveBeenCalled();
  });
});
