import { describe, expect, it, vi } from 'vitest';
import { listOutbox, saveToOutbox, type OutboxEntry } from '../../src/features/outbox/outbox';

/**
 * 016 : une demande restée dans la boîte d'envoi (hors ligne) avant le passage à deux priorités garde
 * son ancienne priorité dans le navigateur. Relue, elle suit la même correspondance que la migration 0024
 * (MEDIUM → NORMAL, HIGH → URGENT) : le renvoi n'est pas refusé par le serveur.
 */

const store = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async (key: string) => store.get(key),
  set: async (key: string, value: unknown) => void store.set(key, value),
  del: async (key: string) => void store.delete(key),
  values: async () => [...store.values()],
}));

const entry = (id: string, priority: string, savedAt: string) =>
  ({
    id,
    type: 'request',
    savedAt,
    categoryName: 'Photocopies',
    lastError: 'Envoi impossible.',
    payload: { clientId: id, title: `Demande ${priority}`, categoryId: 'cat-a', priority },
  }) as unknown as OutboxEntry;

describe('Boîte d’envoi et anciennes priorités', () => {
  it('relit MEDIUM en NORMAL et HIGH en URGENT ; les priorités en vigueur sont inchangées', async () => {
    await saveToOutbox(entry('a', 'MEDIUM', '2026-11-01T08:00:00.000Z'));
    await saveToOutbox(entry('b', 'HIGH', '2026-11-01T08:01:00.000Z'));
    await saveToOutbox(entry('c', 'URGENT', '2026-11-01T08:02:00.000Z'));
    await saveToOutbox(entry('d', 'NORMAL', '2026-11-01T08:03:00.000Z'));
    const priorities = (await listOutbox()).map((e) => (e.type === 'request' ? e.payload.priority : null));
    expect(priorities).toEqual(['NORMAL', 'URGENT', 'URGENT', 'NORMAL']);
  });
});
