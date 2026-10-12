import Box from '@mui/material/Box';
import { useId, type ChangeEvent, type ReactNode } from 'react';

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
 * clavier, et son <label> présenté comme un bouton (pas de contrôles interactifs imbriqués).
 * Le focus du champ est rendu visible sur le libellé.
 */
export function FilePickerButton({ label, icon, accept, capture, disabled, onChange }: FilePickerButtonProps) {
  const id = useId();
  return (
    <Box
      sx={{
        position: 'relative',
        display: 'inline-flex',
        '&:focus-within label': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
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
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
          minHeight: 44,
          px: 2,
          border: 1,
          borderColor: 'primary.main',
          borderRadius: 1,
          color: 'primary.main',
          fontWeight: 600,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          pointerEvents: disabled ? 'none' : 'auto',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        {icon}
        {label}
      </Box>
    </Box>
  );
}
