import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { icon as iconSize, tokensOf } from '../design/tokens';

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Icône illustrative (Lucide). */
  icon?: LucideIcon;
  action?: ReactNode;
  /** Version compacte, pour une section de page plutôt qu'une page entière. */
  compact?: boolean;
}

/** État vide : icône, phrase utile et, si possible, l'action qui permet d'en sortir. */
export function EmptyState({ title, description, icon: Icon = Inbox, action, compact = false }: EmptyStateProps) {
  return (
    <Box
      sx={{
        py: compact ? 3 : 6,
        px: 2,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
      }}
    >
      <Box
        aria-hidden="true"
        sx={(theme) => ({
          width: compact ? 40 : 48,
          height: compact ? 40 : 48,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: tokensOf(theme).surfaceMuted,
          color: tokensOf(theme).textSecondary,
          mb: 0.5,
        })}
      >
        <Icon size={iconSize.lg} strokeWidth={iconSize.stroke} />
      </Box>
      <Typography component="p" variant="subtitle1">
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 1.5 }}>{action}</Box>}
    </Box>
  );
}
