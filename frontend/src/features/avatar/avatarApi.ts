import { apiFetch } from '../../api/client';
import { setAvatarUrl } from '../../api/avatars';

export interface AvatarState {
  avatarUrl: string | null;
  avatarType: 'DEFAULT' | 'CUSTOM';
}

/** Nouvelle photo (POST /api/users/:id/avatar, champ `file`) ; tous les avatars du compte suivent. */
export async function uploadAvatar(userId: string, image: Blob): Promise<AvatarState> {
  const form = new FormData();
  form.append('file', image, 'photo.png');
  const state = await apiFetch<AvatarState>(`/api/users/${userId}/avatar`, { method: 'POST', body: form });
  setAvatarUrl(userId, state.avatarUrl);
  return state;
}

/** Retour à l'avatar par défaut (DELETE /api/users/:id/avatar). */
export async function resetAvatar(userId: string): Promise<AvatarState> {
  const state = await apiFetch<AvatarState>(`/api/users/${userId}/avatar`, { method: 'DELETE' });
  setAvatarUrl(userId, null);
  return state;
}
