import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { icon, tokensOf } from '../design/tokens';

interface ErrorStateProps {
  /** Ce qui ne va pas, en langage courant. */
  message: string;
  /** Action corrective proposée (ex. « Réessayer »). */
  actionLabel?: string;
  onAction?: () => void;
}

/** Erreur de chargement : message lisible, icône, et l'action pour réessayer. */
export function ErrorState({ message, actionLabel, onAction }: ErrorStateProps) {
  return (
    <Box
      role="alert"
      sx={(theme) => ({
        my: 2,
        p: 2,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1.5,
        borderRadius: 1,
        border: `1px solid ${tokensOf(theme).error.border}`,
        bgcolor: tokensOf(theme).error.soft,
        color: tokensOf(theme).error.text,
      })}
    >
      <Box component="span" sx={{ display: 'flex', color: 'error.main' }}>
        <CircleAlert size={icon.lg} strokeWidth={icon.stroke} aria-hidden="true" />
      </Box>
      <Typography variant="body2" sx={{ flex: '1 1 200px', color: 'inherit' }}>
        {message}
      </Typography>
      {actionLabel && onAction && (
        <Button variant="outlined" size="small" startIcon={<RefreshCw size={icon.sm} aria-hidden="true" />} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}
