import IconButton, { type IconButtonProps } from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import type { LucideIcon } from 'lucide-react';
import { icon as iconSize } from '../design/tokens';

interface IconActionProps extends Omit<IconButtonProps, 'children' | 'aria-label'> {
  icon: LucideIcon;
  /** Nom accessible (aria-label), ex. « Modifier le compte de Marie ». */
  label: string;
  /** Infobulle courte ; par défaut le nom accessible. */
  tooltip?: string;
}

/** Bouton à icône seule : toujours un nom accessible et une infobulle. */
export function IconAction({ icon: Icon, label, tooltip, ...props }: IconActionProps) {
  return (
    <Tooltip title={tooltip ?? label}>
      <IconButton aria-label={label} {...props}>
        <Icon size={iconSize.md} strokeWidth={iconSize.stroke} aria-hidden="true" />
      </IconButton>
    </Tooltip>
  );
}
