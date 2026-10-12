import { createStore, del, set, values } from 'idb-keyval';
import type { NewRequestInput } from '../requests/api';

/**
 * Boîte d'envoi (FR-008, research R10) : les demandes dont l'envoi a échoué sont conservées
 * dans IndexedDB, avec leur vocal, pour être renvoyées sans ressaisie (même clientId).
 */
export interface OutboxEntry {
  id: string;
  savedAt: string;
  payload: NewRequestInput;
  /** Libellés affichés dans la boîte d'envoi. */
  categoryName: string;
  lastError: string;
}

const store = createStore('ljj-boite-envoi', 'envois');

export async function saveToOutbox(entry: OutboxEntry): Promise<void> {
  await set(entry.id, entry, store);
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const entries = (await values(store)) as OutboxEntry[];
  return entries.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}

export async function removeFromOutbox(id: string): Promise<void> {
  await del(id, store);
}
