import { fullName, type ConversationSummary } from './api';

/**
 * « Communications » de l'administration (017) : une seule page, trois vues choisies par `?vue=`.
 * Tout ce qui ne dépend pas de React est ici : lecture de l'onglet, filtres de la liste, adresses
 * des anciennes pages.
 */

export const ROOT = '/communications';

export type Vue = 'boite' | 'conversations' | 'valider';

/** Paramètres de l'adresse : onglet, conversation ouverte, message à valider, panneau d'écriture. */
export const PARAM = {
  vue: 'vue',
  conversation: 'conversation',
  message: 'message',
  nouveau: 'nouveau',
} as const;

/** Préremplissage du panneau (« Contacter le parent », anciennes adresses). */
export const PREFILL_KEYS = ['type', 'studentId', 'linkedInternalId'] as const;

/** L'onglet demandé ; « À valider » sans le droit de valider, ou une valeur inconnue : la boîte de réception. */
export function parseVue(raw: string | null, canValidate: boolean): Vue {
  if (raw === 'conversations') return 'conversations';
  if (raw === 'valider' && canValidate) return 'valider';
  return 'boite';
}

export type ConversationFilter = 'all' | 'unread' | 'teachers' | 'parents' | 'archived';

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .trim();

/** Filtre un seul à la fois (boutons-pilules) ; `q` cherche dans le nom de l'élève. */
export function filterConversations(
  list: ConversationSummary[],
  { filter, q }: { filter: ConversationFilter; q?: string },
): ConversationSummary[] {
  const needle = q ? fold(q) : '';
  return list.filter((c) => {
    if (needle && !fold(fullName(c.student)).includes(needle)) return false;
    switch (filter) {
      case 'unread':
        return c.unread > 0;
      case 'teachers':
        return c.type === 'INTERNAL';
      case 'parents':
        return c.type === 'PARENT';
      case 'archived':
        return c.type === 'LEGACY_TEACHER_PARENT';
      default:
        return true;
    }
  });
}

/** Messages non lus de la liste : le compteur de l'onglet vient des données, jamais d'une valeur fictive. */
export function unreadTotal(list: ConversationSummary[] | undefined): number {
  return (list ?? []).reduce((sum, c) => sum + c.unread, 0);
}

export type LegacyTarget = Vue | 'nouveau';

/**
 * Adresse de la page unique pour une ancienne adresse (`/communications/boite/:id`, `/nouveau`…),
 * afin que les favoris et les notifications déjà reçues continuent de fonctionner.
 */
export function legacyCommunicationsUrl(
  target: LegacyTarget,
  id: string | undefined,
  search: string,
): string {
  const parts: string[] = [];
  if (target === 'nouveau') {
    parts.push(PARAM.nouveau);
    const source = new URLSearchParams(search);
    for (const key of PREFILL_KEYS) {
      const value = source.get(key);
      if (value) parts.push(`${key}=${encodeURIComponent(value)}`);
    }
  } else {
    parts.push(`${PARAM.vue}=${target}`);
    if (id) {
      const key = target === 'valider' ? PARAM.message : PARAM.conversation;
      parts.push(`${key}=${encodeURIComponent(id)}`);
    }
  }
  return `${ROOT}?${parts.join('&')}`;
}
