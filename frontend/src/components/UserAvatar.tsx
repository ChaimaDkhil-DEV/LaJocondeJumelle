import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useState, type ReactNode } from 'react';
import { useAvatarUrl } from '../api/avatars';
import { avatarColors, font, fontSize, tokensOf } from '../design/tokens';
import { illustrationUri } from './avatarIllustration';

/**
 * Avatar par défaut d'un compte sans photo : « initials » (option A : initiales sur une couleur
 * douce stable) ou « illustration » (option B : dessin DiceBear stable, calculé dans le
 * navigateur). Aucun fichier n'est stocké pour l'avatar par défaut.
 */
export const DEFAULT_AVATAR_STYLE: 'initials' | 'illustration' = 'initials';

/** Tailles nommées (px) ; un nombre reste accepté pour les cas particuliers. */
export const AVATAR_SIZES = { sm: 24, md: 32, lg: 40 } as const;
export type AvatarSize = keyof typeof AVATAR_SIZES | number;

/** « Marie Dupont » → « MD » ; « reprographie » → « RE ». */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase('fr');
  return (words[0][0] + words[words.length - 1][0]).toLocaleUpperCase('fr');
}

/** Couleur douce stable pour une même personne (identifiant, sinon nom). */
export function colorFor(key: string) {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return avatarColors[hash % avatarColors.length];
}

interface UserAvatarProps {
  /** Compte affiché (forme recommandée) ; sinon `name` et `id`. */
  user?: { id: string; displayName: string };
  name?: string;
  /** Identifiant : photo du compte et couleur stable ; par défaut le nom. */
  id?: string;
  size?: AvatarSize;
  /** Gris neutre, identique pour tous (listes denses : la couleur reste réservée aux alertes). */
  neutral?: boolean;
  /**
   * Avatar seul, sans nom écrit à côté : annoncé « Photo de … ». Par défaut décoratif (le nom
   * est toujours écrit à côté), donc ignoré des lecteurs d'écran.
   */
  labelled?: boolean;
  /** Image imposée (aperçu avant enregistrement) ; null : avatar par défaut. */
  src?: string | null;
}

/**
 * Avatar rond d'un compte, partout dans l'application : photo personnalisée si elle existe, sinon
 * avatar par défaut ; si la photo ne se charge pas, retour à l'avatar par défaut.
 */
export function UserAvatar({ user, name: nameProp, id: idProp, size = 28, neutral = false, labelled = false, src }: UserAvatarProps) {
  const name = user?.displayName ?? nameProp ?? '';
  const id = user?.id ?? idProp;
  const px = typeof size === 'number' ? size : AVATAR_SIZES[size];
  const stored = useAvatarUrl(id);
  const photo = src === undefined ? stored : src;
  // Adresse qui n'a pas pu se charger : on n'insiste pas, l'avatar par défaut la remplace.
  const [failed, setFailed] = useState<string | null>(null);
  const a11y = labelled ? { role: 'img', 'aria-label': `Photo de ${name}` } : { 'aria-hidden': true };
  const round = { width: px, height: px, flex: 'none', borderRadius: '50%', display: 'block' } as const;

  if (photo && photo !== failed) {
    return (
      <Box
        component="img"
        src={photo}
        alt={labelled ? `Photo de ${name}` : ''}
        aria-hidden={labelled ? undefined : true}
        width={px}
        height={px}
        loading="lazy"
        onError={() => setFailed(photo)}
        sx={(theme) => ({ ...round, objectFit: 'cover', bgcolor: tokensOf(theme).surfaceMuted })}
      />
    );
  }

  if (DEFAULT_AVATAR_STYLE === 'illustration' && !neutral) {
    return (
      <Box
        component="img"
        src={illustrationUri(id ?? name)}
        alt={labelled ? `Photo de ${name}` : ''}
        aria-hidden={labelled ? undefined : true}
        width={px}
        height={px}
        sx={(theme) => ({ ...round, bgcolor: tokensOf(theme).surfaceMuted })}
      />
    );
  }

  const { bg, fg } = colorFor(id ?? name);
  return (
    <Box
      component="span"
      {...a11y}
      sx={(theme) => ({
        ...round,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: neutral ? tokensOf(theme).surfaceMuted : bg,
        color: neutral ? tokensOf(theme).textSecondary : fg,
        border: neutral ? `1px solid ${tokensOf(theme).border}` : undefined,
        fontSize: px >= 56 ? fontSize.lg : px >= 36 ? fontSize.sm : fontSize.xs,
        fontWeight: font.medium,
        letterSpacing: '0.02em',
        userSelect: 'none',
      })}
    >
      {initials(name)}
    </Box>
  );
}

interface PersonProps {
  name: string;
  id?: string;
  size?: AvatarSize;
  /** Ligne secondaire (rôle, fonction). */
  secondary?: ReactNode;
  /** Texte placé avant le nom, ex. « De : ». */
  prefix?: string;
  /** Avatar gris neutre (voir UserAvatar). */
  neutral?: boolean;
}

/** Avatar + nom (et éventuellement une ligne secondaire), partout où un auteur apparaît. */
export function Person({ name, id, size = 28, secondary, prefix, neutral = false }: PersonProps) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <UserAvatar name={name} id={id} size={size} neutral={neutral} />
      <Box component="span" sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Typography component="span" variant="body2" sx={{ fontWeight: font.medium, color: 'text.primary', overflowWrap: 'anywhere' }}>
          {prefix && (
            <Box component="span" sx={{ color: 'text.secondary', fontWeight: font.regular }}>
              {prefix}{' '}
            </Box>
          )}
          {name}
        </Typography>
        {secondary && (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            {secondary}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
