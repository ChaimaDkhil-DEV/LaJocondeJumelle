import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarChart3, Download } from 'lucide-react';
import { useId, useState } from 'react';
import { ApiError, apiFetch } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { SectionCard } from '../../components/SectionCard';
import { fontSize, icon } from '../../design/tokens';
import { useCoverageProfile } from './api';
import { formatDuration } from './labels';
import type { CoverageStats, StatsCounters } from './types';

type GroupBy = 'teacher' | 'class' | 'period';
type Period = 'week' | 'month';

const GROUP_LABELS: Record<GroupBy, string> = {
  teacher: 'Enseignant',
  class: 'Classe',
  period: 'Période',
};
const TABLE_TITLES: Record<GroupBy, string> = {
  teacher: 'Par enseignant',
  class: 'Par classe',
  period: 'Par période',
};

const percent = (rate: number) => `${Math.round(rate * 100)} %`;
const duration = (minutes: number | null) => (minutes === null ? '—' : formatDuration(minutes));

/** Paires terme / valeur (liste de définitions) : lisibles par les lecteurs d'écran. */
function Figures({ label, items }: { label: string; items: Array<[string, string]> }) {
  const id = useId();
  return (
    <Box component="section" aria-labelledby={id} sx={{ display: 'grid', gap: 1 }}>
      <Typography id={id} component="h2" variant="subtitle2">
        {label}
      </Typography>
      <Box
        component="dl"
        sx={{
          m: 0,
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        }}
      >
        {items.map(([term, value]) => (
          <Box
            key={term}
            sx={{
              p: 1.5,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              display: 'grid',
              gap: 0.25,
            }}
          >
            <Box component="dt" sx={{ fontSize: fontSize.xs, color: 'text.secondary' }}>
              {term}
            </Box>
            <Box
              component="dd"
              sx={{ m: 0, fontSize: fontSize.lg, fontVariantNumeric: 'tabular-nums' }}
            >
              {value}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function StatsTable({ stats }: { stats: CoverageStats }) {
  const groupBy = stats.groupBy as GroupBy;
  const columns: Array<[string, (r: StatsCounters) => string]> = [
    ['Événements', (r) => String(r.events)],
    ['Retards', (r) => String(r.lateness)],
    ['Absences', (r) => String(r.absence)],
    ['Classes vides', (r) => String(r.emptyClass)],
    ['Non pourvues', (r) => String(r.unfilled)],
    ['Annulées', (r) => String(r.cancelled)],
    ['Durée moyenne', (r) => duration(r.averageDurationMinutes)],
  ];
  if (stats.rows.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Aucune affectation sur la période"
        description="Choisissez une autre période."
      />
    );
  }
  return (
    // Plus large que l'écran sur mobile : zone de défilement nommée et atteignable au clavier.
    <TableContainer tabIndex={0} role="region" aria-label={TABLE_TITLES[groupBy]}>
      <Table size="small">
        <caption style={{ captionSide: 'top', textAlign: 'left', padding: '0 0 8px' }}>
          {TABLE_TITLES[groupBy]}
        </caption>
        <TableHead>
          <TableRow>
            <TableCell component="th" scope="col">
              {GROUP_LABELS[groupBy]}
            </TableCell>
            {columns.map(([label]) => (
              <TableCell key={label} component="th" scope="col" align="right">
                {label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {stats.rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell component="th" scope="row">
                {r.label}
              </TableCell>
              {columns.map(([label, value]) => (
                <TableCell key={label} align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {value(r)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/**
 * Statistiques des affectations (US5, FR-022) : admin et super administrateur. Les annulées et les
 * doublons « non tranchés » sont comptés à part ; export CSV de la vue affichée (spec 008).
 */
export function CoverageStatsPage() {
  const profile = useCoverageProfile();
  if (profile.isPending)
    return <LoadingState label="Chargement des statistiques" variant="detail" />;
  if (profile.error) return <ErrorState message="Impossible de charger les statistiques." />;
  const today = profile.data.schoolDates.today;
  return <StatsView defaultFrom={`${today.slice(0, 7)}-01`} defaultTo={today} />;
}

function StatsView({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [groupBy, setGroupBy] = useState<GroupBy>('teacher');
  const [period, setPeriod] = useState<Period>('week');
  const params = new URLSearchParams({
    from,
    to,
    groupBy,
    ...(groupBy === 'period' ? { period } : {}),
  });
  const complete = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to);
  const stats = useQuery({
    queryKey: ['coverage', 'stats', params.toString()],
    queryFn: () => apiFetch<CoverageStats>(`/api/coverage/stats?${params.toString()}`),
    enabled: complete,
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Statistiques des affectations"
        description="Retards, absences et classes vides de la période, dans le fuseau de l’école. Les annulées et les doublons non tranchés sont comptés à part."
        back={{ to: '/gardes', label: 'Gardes' }}
      />
      <Box sx={{ display: 'grid', gap: 2 }}>
        <SectionCard>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, minmax(0, 1fr))' },
            }}
          >
            <TextField
              id="stats-du"
              label="Du"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              id="stats-au"
              label="Au"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              select
              id="stats-regroupement"
              label="Regrouper par"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            >
              {(Object.keys(GROUP_LABELS) as GroupBy[]).map((g) => (
                <MenuItem key={g} value={g}>
                  {GROUP_LABELS[g]}
                </MenuItem>
              ))}
            </TextField>
            {groupBy === 'period' && (
              <TextField
                select
                id="stats-periode"
                label="Période"
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
              >
                <MenuItem value="week">Semaine</MenuItem>
                <MenuItem value="month">Mois</MenuItem>
              </TextField>
            )}
          </Box>
        </SectionCard>

        {stats.error ? (
          <Alert severity="error" role="alert">
            {stats.error instanceof ApiError
              ? stats.error.message
              : 'Impossible de calculer les statistiques.'}
          </Alert>
        ) : !stats.data ? (
          <LoadingState label="Calcul des statistiques" />
        ) : (
          <>
            {/* Seulement sur des statistiques à jour : ni date incomplète, ni recalcul (anciennes valeurs affichées). */}
            {complete && !stats.isPlaceholderData && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  component="a"
                  href={`/api/coverage/stats/export.csv?${params.toString()}`}
                  download
                  startIcon={<Download size={icon.sm} aria-hidden="true" />}
                >
                  Exporter en CSV
                </Button>
              </Box>
            )}
            <SectionCard>
              <Figures
                label="Totaux de la période"
                items={[
                  ['Retards et absences', String(stats.data.totals.events)],
                  ['Retards', String(stats.data.totals.lateness)],
                  ['Absences', String(stats.data.totals.absence)],
                  ['Classes vides', String(stats.data.totals.emptyClass)],
                  ['Non pourvues', String(stats.data.totals.unfilled)],
                  ['Taux de non pourvue', percent(stats.data.totals.unfilledRate)],
                  ['Durée moyenne', duration(stats.data.totals.averageDurationMinutes)],
                ]}
              />
              <Figures
                label="Comptés à part"
                items={[
                  ['Annulées (non comptées comme retards)', String(stats.data.totals.cancelled)],
                  [
                    'Doublons non tranchés (comptés une fois)',
                    String(stats.data.totals.undecidedDuplicates),
                  ],
                ]}
              />
            </SectionCard>
            <SectionCard>
              <StatsTable stats={stats.data} />
            </SectionCard>
          </>
        )}
      </Box>
    </>
  );
}
