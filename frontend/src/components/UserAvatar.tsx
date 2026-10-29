import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { avatarColors, font, fontSize, tokensOf } from '../design/tokens';

/** « Marie Dupont » → « MD » ; « reprographie » → « RE ». */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase('fr');
  return (words[0][0] + words[words.length - 1][0]).toLocaleUpperCase('fr');
}

/** Couleur douce stable pour une même personne. */
function colorFor(key: string) {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return avatarColors[hash % avatarColors.length];
}

interface UserAvatarProps {
  name: string;
  /** Clé de couleur (identifiant) ; par défaut le nom. */
  id?: string;
  size?: number;
  /** Gris neutre, identique pour tous (listes denses : la couleur reste réservée aux alertes). */
  neutral?: boolean;
}

/** Avatar rond à initiales. Décoratif : le nom est toujours écrit à côté. */
export function UserAvatar({ name, id, size = 28, neutral = false }: UserAvatarProps) {
  const { bg, fg } = colorFor(id ?? name);
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={(theme) => ({
        width: size,
        height: size,
        flex: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        bgcolor: neutral ? tokensOf(theme).surfaceMuted : bg,
        color: neutral ? tokensOf(theme).textSecondary : fg,
        border: neutral ? `1px solid ${tokensOf(theme).border}` : undefined,
        fontSize: fontSize.xs,
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
  size?: number;
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
