import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import { visuallyHidden } from '../../components/a11y';

/** Forme du contenu attendu : celle de chaque vue du tableau de bord. */
export type DashboardSkeletonShape = 'general' | 'performance' | 'table' | 'timeline';

const tileGrid = (columns: { xs: number; sm?: number; md?: number }) =>
  ({
    display: 'grid',
    gap: 1.5,
    gridTemplateColumns: Object.fromEntries(Object.entries(columns).map(([bp, n]) => [bp, `repeat(${n}, minmax(0, 1fr))`])),
  }) as const;

function Tiles({ count, columns }: { count: number; columns: { xs: number; sm?: number; md?: number } }) {
  return (
    <Box sx={tileGrid(columns)}>
      {Array.from({ length: count }, (_, i) => (
        <Paper key={i} variant="elevated" sx={{ p: 2, display: 'grid', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Skeleton variant="rounded" width={28} height={28} />
            <Skeleton variant="text" width="55%" height={20} />
          </Box>
          <Skeleton variant="text" width={64} height={34} />
          <Skeleton variant="text" width="80%" height={16} />
        </Paper>
      ))}
    </Box>
  );
}

/** Onglet « Délais » : carte « Respect des délais » (anneau) en tête, puis 4 cartes de durée. */
function DelayTiles() {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 1.5,
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', md: 'minmax(0, 1.15fr) repeat(2, minmax(0, 1fr))' },
      }}
    >
      <Paper variant="elevated" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, gridColumn: { sm: '1 / -1', md: 'auto' }, gridRow: { md: 'span 2' } }}>
        <Skeleton variant="circular" width={88} height={88} sx={{ flex: 'none' }} />
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width="60%" height={20} />
          <Skeleton variant="text" width={72} height={40} />
          <Skeleton variant="text" width="80%" height={16} />
        </Box>
      </Paper>
      {Array.from({ length: 4 }, (_, i) => (
        <Paper key={i} variant="elevated" sx={{ p: 2, display: 'grid', gap: 1 }}>
          <Skeleton variant="text" width="70%" height={20} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Skeleton variant="rounded" width={44} height={44} />
            <Skeleton variant="text" width={64} height={34} />
          </Box>
          <Skeleton variant="rounded" width={52} height={22} />
        </Paper>
      ))}
    </Box>
  );
}

function TableBlock({ rows = 5 }: { rows?: number }) {
  return (
    <Paper variant="elevated" sx={{ overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.hover', display: 'flex', gap: 3 }}>
        {[30, 15, 15, 20].map((w, i) => (
          <Skeleton key={i} variant="text" width={`${w}%`} height={20} />
        ))}
      </Box>
      {Array.from({ length: rows }, (_, i) => (
        <Box key={i} sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 3, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ width: '30%' }}>
            <Skeleton variant="text" width="90%" height={20} />
            <Skeleton variant="text" width="60%" height={16} />
          </Box>
          <Skeleton variant="rounded" width={72} height={24} />
          <Skeleton variant="rounded" width={88} height={24} sx={{ display: { xs: 'none', sm: 'block' } }} />
          <Skeleton variant="text" width="15%" height={20} sx={{ display: { xs: 'none', md: 'block' } }} />
        </Box>
      ))}
    </Paper>
  );
}

function ChartBlock() {
  return (
    <Paper variant="elevated" sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 2 }}>
      <Skeleton variant="text" width="40%" height={24} />
      <Skeleton variant="rounded" height={220} />
    </Paper>
  );
}

/**
 * Chargement du tableau de bord : squelette à la forme de la vue (tuiles, graphiques, tableau ou
 * chronologie), annoncé une seule fois aux lecteurs d'écran par son libellé.
 */
export function DashboardSkeleton({ label, shape }: { label: string; shape: DashboardSkeletonShape }) {
  return (
    <Box role="status" aria-live="polite" aria-busy="true">
      <Box component="span" sx={visuallyHidden}>
        {label}
      </Box>
      <Box aria-hidden="true" sx={{ display: 'grid', gap: 3 }}>
        {shape === 'general' && (
          <>
            <Paper variant="elevated" sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 2 }}>
              <Skeleton variant="text" width={200} height={24} />
              <Tiles count={3} columns={{ xs: 1, sm: 3 }} />
              <TableBlock rows={2} />
            </Paper>
            <Tiles count={8} columns={{ xs: 2, md: 4 }} />
            <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' } }}>
              <ChartBlock />
              <ChartBlock />
            </Box>
          </>
        )}
        {shape === 'performance' && (
          <>
            <DelayTiles />
            <TableBlock rows={4} />
            <Skeleton variant="rounded" height={44} />
          </>
        )}
        {shape === 'table' && <TableBlock rows={6} />}
        {shape === 'timeline' && (
          <Paper variant="elevated" sx={{ p: { xs: 2, md: 2.5 }, display: 'grid', gap: 2.5 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1.5 }}>
                <Skeleton variant="circular" width={32} height={32} sx={{ flex: 'none' }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Skeleton variant="text" width="50%" height={20} />
                  <Skeleton variant="text" width="80%" height={18} />
                </Box>
              </Box>
            ))}
          </Paper>
        )}
      </Box>
    </Box>
  );
}
