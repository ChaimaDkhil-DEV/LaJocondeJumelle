import { createStore, del, set, values } from 'idb-keyval';
import type { NewRequestInput } from '../requests/api';
import type { NewMessageInput } from '../thread/api';

/**
 * Boîte d'envoi (FR-008, research R10) : les demandes et messages dont l'envoi a échoué sont
 * conservés dans IndexedDB, avec leur vocal, pour être renvoyés sans ressaisie (même clientId).
 */
interface OutboxBase {
  id: string;
  savedAt: string;
  lastError: string;
}

/** Nouvelle demande (les entrées enregistrées avant l'ajout des messages n'ont pas de `type`). */
export interface RequestOutboxEntry extends OutboxBase {
  type?: 'request';
  payload: NewRequestInput;
  categoryName: string;
}

/** Message du fil de discussion d'une demande. */
export interface MessageOutboxEntry extends OutboxBase {
  type: 'message';
  payload: NewMessageInput;
  requestTitle: string;
}

export type OutboxEntry = RequestOutboxEntry | MessageOutboxEntry;

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
