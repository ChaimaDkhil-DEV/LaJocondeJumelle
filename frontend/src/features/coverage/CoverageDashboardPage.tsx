import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import GlobalStyles from '@mui/material/GlobalStyles';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Download, LifeBuoy, Printer, Radio, ScrollText, ShieldCheck, TriangleAlert, AlarmClock, UserCheck, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { loadErrorMessage } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { SectionCard } from '../../components/SectionCard';
import { SectionHeader } from '../../components/SectionHeader';
import { Person } from '../../components/UserAvatar';
import { font, fontSize, icon, tokensOf, type Tone } from '../../design/tokens';
import { useAdminClasses, useAdminFloors, useDashboard, type EmployeeStats } from './adminApi';
import { CoverageRows } from './ManagerViews';
import { AVAILABILITY_LABELS, CoverageStatusBadge, Elapsed, MAIN_STATUS_LABELS, derivedStatus } from './labels';
import type { MainStatus } from './types';

interface Filters {
  assigneeId: string;
  classId: string;
  mainStatus: string;
  floorId: string;
  from: string;
  to: string;
}

const EMPTY: Filters = { assigneeId: '', classId: '', mainStatus: '', floorId: '', from: '', to: '' };

function toQuery(f: Filters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(f)) if (value) params.set(key, value);
  return params.toString();
}

function Kpi({ label, value, tone, icon: Icon }: { label: string; value: number; tone: Tone; icon: LucideIcon }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'grid', gap: 0.5 }}>
      <Box
        sx={(theme) => ({
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          fontSize: fontSize.sm,
          color: tokensOf(theme).textSecondary,
          '& svg': { color: tone === 'neutral' ? tokensOf(theme).textMuted : tokensOf(theme)[tone].main },
        })}
      >
        <Icon size={icon.sm} aria-hidden="true" />
        {label}
      </Box>
      <Typography sx={{ fontSize: fontSize.xl, fontWeight: font.medium, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Paper>
  );
}

function EmployeeRow({ e }: { e: EmployeeStats }) {
  return (
    <Box
      component="li"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.4fr) minmax(0, 1.6fr) repeat(2, minmax(0, 0.7fr))' },
        gap: { xs: 1, md: 2 },
        alignItems: 'center',
        p: 2,
        borderTop: 1,
        borderColor: 'divider',
        '&:first-of-type': { borderTop: 0 },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Person name={e.displayName} id={e.id} size={28} secondary={e.available ? 'Disponible' : e.currentGuard ? 'Affecté' : AVAILABILITY_LABELS[e.availability]} />
      </Box>
      <Box sx={{ minWidth: 0, display: 'grid', gap: 0.5 }}>
        {e.currentGuard ? (
          <>
            <Box component={RouterLink} to={`/gardes/${e.currentGuard.requestId}`} sx={{ color: 'inherit', fontSize: fontSize.sm }}>
              {e.currentGuard.class.name}
              {e.currentGuard.class.room ? ` — ${e.currentGuard.class.room}` : ''}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', fontSize: fontSize.xs, color: 'text.secondary' }}>
              <CoverageStatusBadge {...derivedStatus(e.currentGuard.status)} />
              {e.currentGuard.since && <Elapsed since={e.currentGuard.since} prefix="depuis" />}
            </Box>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Aucune affectation en cours{e.activeWorkTasks > 0 ? ` · ${e.activeWorkTasks} tâche${e.activeWorkTasks > 1 ? 's' : ''} en cours` : ''}
          </Typography>
        )}
      </Box>
      <Stat label="Affectations effectuées" value={String(e.guardsDone)} />
      <Stat label="Retards" value={String(e.lates)} />
    </Box>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, fontSize: fontSize.sm, '& dt': { color: 'text.secondary', display: { md: 'none' } } }} component="dl">
      <Box component="dt" sx={{ m: 0 }}>
        {label}
      </Box>
      <Box component="dd" sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Box>
    </Box>
  );
}

/**
 * Suivi des affectations (super administrateur) : vue temps réel des demandes en attente, affectations
 * assignées et en cours, retards et non pourvues ; statistiques par surveillant ; filtres ; export CSV et impression.
 */
export function CoverageDashboardPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const query = toQuery(filters);
  const dashboard = useDashboard(query);
  const classes = useAdminClasses();
  const floors = useAdminFloors();
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <Box component="section" aria-labelledby="titre-suivi">
      {/* Impression : la page seule, sans navigation ni boutons. */}
      <GlobalStyles
        styles={{
          '@media print': {
            'aside, header, .MuiDrawer-root, .no-print': { display: 'none !important' },
            '#contenu': { margin: '0 !important', padding: '0 !important', maxWidth: 'none !important' },
          },
        }}
      />
      <SectionHeader
        id="titre-suivi"
        title="Suivi des affectations"
        description="Mis à jour en direct. Les chiffres sont calculés sur les affectations correspondant aux filtres."
        action={
          <Box className="no-print" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button component="a" href={`/api/admin/coverage/export.csv${query ? `?${query}` : ''}`} download startIcon={<Download size={icon.sm} aria-hidden="true" />}>
              Exporter en CSV
            </Button>
            <Button onClick={() => window.print()} startIcon={<Printer size={icon.sm} aria-hidden="true" />}>
              Imprimer
            </Button>
            <Button component={RouterLink} to="/admin/journal" startIcon={<ScrollText size={icon.sm} aria-hidden="true" />}>
              Journal d’audit
            </Button>
          </Box>
        }
      />

      <Box className="no-print" sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(6, minmax(0, 1fr))' }, mb: 3 }}>
        <TextField select size="small" label="Surveillant" value={filters.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}>
          <MenuItem value="">Tous</MenuItem>
          {(dashboard.data?.employees ?? []).map((e) => (
            <MenuItem key={e.id} value={e.id}>
              {e.displayName}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Classe" value={filters.classId} onChange={(e) => set({ classId: e.target.value })}>
          <MenuItem value="">Toutes</MenuItem>
          {(classes.data ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Statut" value={filters.mainStatus} onChange={(e) => set({ mainStatus: e.target.value })}>
          <MenuItem value="">Tous</MenuItem>
          {(Object.keys(MAIN_STATUS_LABELS) as MainStatus[]).map((s) => (
            <MenuItem key={s} value={s}>
              {MAIN_STATUS_LABELS[s]}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Étage" value={filters.floorId} onChange={(e) => set({ floorId: e.target.value })}>
          <MenuItem value="">Tous</MenuItem>
          {(floors.data ?? []).map((f) => (
            <MenuItem key={f.id} value={f.id}>
              {f.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField size="small" type="date" label="Du" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
        <TextField size="small" type="date" label="Au" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
      </Box>

      {dashboard.isPending ? (
        <LoadingState label="Chargement du suivi" variant="detail" />
      ) : dashboard.error ? (
        <ErrorState
          message={loadErrorMessage(dashboard.error, 'le suivi', 'Réinitialisez les filtres puis réessayez.')}
          actionLabel="Réessayer"
          onAction={() => void dashboard.refetch()}
        />
      ) : (
        <Box sx={{ display: 'grid', gap: 3 }}>
          {dashboard.data.emptyGroups.length > 0 && (
            <Alert severity="warning" icon={<TriangleAlert size={icon.lg} aria-hidden="true" />}>
              Groupe Surveillants sans surveillant disponible :{' '}
              {dashboard.data.emptyGroups
                .map((g) => `${g.name} (${g.memberCount === 0 ? 'vide' : `${g.memberCount} membre${g.memberCount > 1 ? 's' : ''}, aucun disponible`})`)
                .join(', ')}
              . <RouterLink to="/admin/groupes">Gérer le groupe</RouterLink>
            </Alert>
          )}

          <Box
            component="section"
            aria-label="Chiffres clés"
            sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(6, minmax(0, 1fr))' } }}
          >
            <Kpi label="En attente" value={dashboard.data.counts.open} tone="info" icon={Radio} />
            <Kpi label="Non pourvues" value={dashboard.data.counts.unfilled} tone="error" icon={AlarmClock} />
            <Kpi label="Assignées" value={dashboard.data.counts.taken} tone="accent" icon={UserCheck} />
            <Kpi label="En retard" value={dashboard.data.counts.late} tone="error" icon={AlarmClock} />
            <Kpi label="En cours" value={dashboard.data.counts.onDuty} tone="success" icon={ShieldCheck} />
            <Kpi label="Relèves demandées" value={dashboard.data.counts.reliefPending} tone="warning" icon={LifeBuoy} />
          </Box>

          <Box component="section" aria-labelledby="titre-suivi-actives" sx={{ display: 'grid', gap: 1.5 }}>
            <Typography id="titre-suivi-actives" component="h3" variant="subtitle1">
              Affectations actives ({dashboard.data.active.length})
            </Typography>
            <CoverageRows items={dashboard.data.active} empty="Aucune affectation active pour ces filtres." />
          </Box>

          <SectionCard title={`Par surveillant (${dashboard.data.employees.length})`} flush>
            <Box
              aria-hidden="true"
              sx={(theme) => ({
                display: { xs: 'none', md: 'grid' },
                gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1.6fr) repeat(2, minmax(0, 0.7fr))',
                gap: 2,
                px: 2,
                py: 1,
                fontSize: fontSize.xs,
                color: tokensOf(theme).textSecondary,
                borderBottom: 1,
                borderColor: 'divider',
              })}
            >
              <span>Surveillant</span>
              <span>Affectation en cours</span>
              <span>Affectations effectuées</span>
              <span>Retards</span>
            </Box>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {dashboard.data.employees.map((e) => (
                <EmployeeRow key={e.id} e={e} />
              ))}
            </Box>
          </SectionCard>
          <Typography variant="caption" color="text.secondary">
            Export PDF : utilisez « Imprimer » puis « Enregistrer au format PDF » (export PDF natif prévu en évolution).
          </Typography>
        </Box>
      )}
    </Box>
  );
}
