import { createAvatar } from '@dicebear/core';
import * as thumbs from '@dicebear/thumbs';

/**
 * Avatar illustré DiceBear (style « thumbs »), généré dans le navigateur à partir d'une graine
 * (l'identifiant du compte) : même compte, même dessin, sans aucun appel réseau. Sert à l'avatar
 * par défaut « illustration » (option B) et à la galerie d'avatars prédéfinis.
 */
const cache = new Map<string, string>();

export function illustrationUri(seed: string): string {
  let uri = cache.get(seed);
  if (!uri) {
    uri = createAvatar(thumbs, { seed, radius: 50 }).toDataUri();
    cache.set(seed, uri);
  }
  return uri;
}
