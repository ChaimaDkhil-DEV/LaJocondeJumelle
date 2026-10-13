import Box from '@mui/material/Box';
import { useId, type ChangeEvent, type ReactNode } from 'react';
import { font, fontSize, motion, tokensOf } from '../../design/tokens';

interface FilePickerButtonProps {
  label: string;
  icon: ReactNode;
  accept: string;
  /** « environment » ouvre directement l'appareil photo arrière sur mobile. */
  capture?: 'environment' | 'user';
  disabled?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Sélecteur de fichier accessible : un vrai champ fichier, masqué visuellement mais atteignable au
 * clavier, et son <label> présenté comme un bouton secondaire (pas de contrôles interactifs imbriqués).
 * Le focus du champ est rendu visible sur le libellé.
 */
export function FilePickerButton({ label, icon, accept, capture, disabled, onChange }: FilePickerButtonProps) {
  const id = useId();
  return (
    <Box
      sx={(theme) => ({
        position: 'relative',
        display: 'inline-flex',
        '&:focus-within label': { outline: `2px solid ${tokensOf(theme).focus}`, outlineOffset: 2 },
      })}
    >
      <Box
        component="input"
        id={id}
        type="file"
        accept={accept}
        capture={capture}
        disabled={disabled}
        onChange={onChange}
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      />
      <Box
        component="label"
        htmlFor={id}
        sx={(theme) => ({
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          minHeight: 36,
          px: 1.5,
          border: `1px solid ${tokensOf(theme).borderStrong}`,
          borderRadius: 1,
          bgcolor: tokensOf(theme).surface,
          color: tokensOf(theme).text,
          fontSize: fontSize.sm,
          fontWeight: font.medium,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          pointerEvents: disabled ? 'none' : 'auto',
          transition: `background-color ${motion.fast}ms`,
          '& svg': { color: tokensOf(theme).textSecondary },
          '&:hover': { bgcolor: tokensOf(theme).surfaceMuted },
          '@media (pointer: coarse)': { minHeight: 44 },
        })}
      >
        {icon}
        {label}
      </Box>
    </Box>
  );
}
