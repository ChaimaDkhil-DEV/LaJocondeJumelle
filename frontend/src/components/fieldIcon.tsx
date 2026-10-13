import InputAdornment from '@mui/material/InputAdornment';
import type { LucideIcon } from 'lucide-react';
import { icon } from '../design/tokens';

/** Icône discrète à gauche d'un champ : `slotProps={{ input: fieldIcon(UserRound) }}`. */
export function fieldIcon(Icon: LucideIcon) {
  return {
    startAdornment: (
      <InputAdornment position="start">
        <Icon size={icon.md} strokeWidth={icon.stroke} aria-hidden="true" />
      </InputAdornment>
    ),
  };
}
