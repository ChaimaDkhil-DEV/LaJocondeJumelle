import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import { ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { icon, radius, tokensOf } from '../design/tokens';

/** Logo de l'établissement, servi tel quel depuis frontend/public/logo.png. */
export const LOGO_SRC = `${import.meta.env.BASE_URL}logo.png`;

/** Vignette d'origine, affichée si le logo manque ou ne se charge pas. */
const FALLBACK_SIZE = 34;

interface AppLogoProps {
  /** Hauteur du logo en pixels ; la largeur suit les proportions du fichier. */
  height?: number;
}

/**
 * Logo de l'application, à côté du nom (barre latérale, en-tête mobile, écran de connexion).
 * Décoratif : le nom de l'application est toujours écrit à côté. En mode sombre, il est posé sur
 * une pastille claire pour rester lisible ; sans fichier, la vignette d'origine le remplace.
 */
export function AppLogo({ height = 40 }: AppLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <Box
        aria-hidden="true"
        data-testid="app-logo-fallback"
        sx={(theme) => ({
          width: FALLBACK_SIZE,
          height: FALLBACK_SIZE,
          flex: 'none',
          borderRadius: `${radius.control}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: tokensOf(theme).accent.main,
          color: tokensOf(theme).accent.contrastText,
          boxShadow: `0 4px 12px ${alpha(tokensOf(theme).accent.main, 0.3)}`,
        })}
      >
        <ClipboardList size={icon.md} />
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={LOGO_SRC}
      alt=""
      aria-hidden="true"
      onError={() => setFailed(true)}
      sx={(theme) => ({
        display: 'block',
        flex: 'none',
        height,
        width: 'auto',
        maxWidth: height,
        objectFit: 'contain',
        ...(theme.palette.mode === 'dark' && { bgcolor: '#ffffff', borderRadius: `${radius.control}px`, p: 0.25 }),
      })}
    />
  );
}
