import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { visuallyHidden } from './a11y';

type LoadingVariant = 'list' | 'detail' | 'form' | 'inline';

interface LoadingStateProps {
  /** Annoncé aux lecteurs d'écran (et affiché en mode « inline »). */
  label?: string;
  /**
   * Forme du squelette, proche du contenu attendu : lignes de liste, page de détail, formulaire,
   * ou simple barre de progression (« inline ») pour une opération en cours.
   */
  variant?: LoadingVariant;
  rows?: number;
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper', overflow: 'hidden' }}>
      {Array.from({ length: rows }, (_, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', p: 2, borderTop: i === 0 ? 0 : 1, borderColor: 'divider' }}>
          <Skeleton variant="circular" width={32} height={32} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Skeleton variant="text" width="45%" height={22} />
            <Skeleton variant="text" width="70%" height={18} />
          </Box>
          <Skeleton variant="rounded" width={72} height={24} sx={{ display: { xs: 'none', sm: 'block' } }} />
        </Box>
      ))}
    </Box>
  );
}

function DetailSkeleton() {
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Skeleton variant="text" width={160} height={20} />
      <Skeleton variant="text" width="60%" height={34} />
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Skeleton variant="rounded" width={88} height={24} />
        <Skeleton variant="rounded" width={72} height={24} />
      </Box>
      <Skeleton variant="rounded" height={120} />
      <Skeleton variant="rounded" height={200} />
    </Box>
  );
}

function FormSkeleton() {
  return (
    <Box sx={{ display: 'grid', gap: 3, maxWidth: 720 }}>
      {[0, 1, 2, 3].map((i) => (
        <Box key={i}>
          <Skeleton variant="text" width={120} height={20} />
          <Skeleton variant="rounded" height={44} />
        </Box>
      ))}
    </Box>
  );
}

/** Chargement : squelettes à la forme du contenu plutôt qu'un indicateur tournant. */
export function LoadingState({ label = 'Chargement…', variant = 'list', rows = 3 }: LoadingStateProps) {
  if (variant === 'inline') {
    return (
      <Box role="status" aria-live="polite" sx={{ py: 1, display: 'grid', gap: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <LinearProgress aria-hidden="true" />
      </Box>
    );
  }
  return (
    <Box role="status" aria-live="polite" aria-busy="true" sx={{ py: 1 }}>
      <Box component="span" sx={visuallyHidden}>
        {label}
      </Box>
      <Box aria-hidden="true">
        {variant === 'detail' ? <DetailSkeleton /> : variant === 'form' ? <FormSkeleton /> : <ListSkeleton rows={rows} />}
      </Box>
    </Box>
  );
}
