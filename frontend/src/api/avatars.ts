import { useSyncExternalStore } from 'react';

/**
 * Photos de profil personnalisées (GET /api/users/avatars), chargées une fois puis partagées par
 * tous les avatars de l'application : les autres comptes ont l'avatar par défaut, calculé ici
 * sans requête. Un changement fait dans cette session est appliqué aussitôt (setAvatarUrl) ;
 * ceux faits ailleurs apparaissent au prochain chargement de la page.
 */
let urls: ReadonlyMap<string, string> = new Map();
let status: 'idle' | 'loading' | 'ready' = 'idle';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

async function load(): Promise<void> {
  status = 'loading';
  try {
    // fetch direct : une erreur (hors ligne, session expirée) laisse simplement les avatars par défaut.
    const res = await fetch('/api/users/avatars', { credentials: 'same-origin' });
    if (res.ok) {
      const rows = (await res.json()) as Array<{ id: string; avatarUrl: string }>;
      urls = new Map(rows.map((r) => [r.id, r.avatarUrl]));
    }
  } catch {
    // Avatars par défaut.
  }
  status = 'ready';
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (status === 'idle') void load();
  return () => listeners.delete(listener);
}

/** Adresse de la photo d'un compte ; null : avatar par défaut. */
export function useAvatarUrl(userId: string | undefined): string | null {
  const map = useSyncExternalStore(subscribe, () => urls, () => urls);
  return userId ? (map.get(userId) ?? null) : null;
}

/** Photo changée ou retirée dans cette session : tous les avatars du compte se mettent à jour. */
export function setAvatarUrl(userId: string, avatarUrl: string | null): void {
  const next = new Map(urls);
  if (avatarUrl) next.set(userId, avatarUrl);
  else next.delete(userId);
  urls = next;
  emit();
}

/** Tests : repart d'un état vierge (rechargement au prochain avatar affiché). */
export function resetAvatarStore(): void {
  urls = new Map();
  status = 'idle';
}
