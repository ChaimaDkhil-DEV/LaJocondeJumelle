import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  AlarmClock,
  Ban,
  CalendarRange,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Hourglass,
  Inbox,
  Mic,
  MessageSquare,
  Play,
  SearchX,
  Siren,
  Timer,
  TriangleAlert,
  UserRoundX,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { loadErrorMessage } from '../../api/client';
import type { Priority } from '../../api/types';
import { STAGE_LABELS } from '../../components/Countdown';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime, formatRelative } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { PRIORITY_LABELS, PriorityBadge } from '../../components/PriorityBadge';
import { SectionCard } from '../../components/SectionCard';
import { SectionHeader } from '../../components/SectionHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { Person } from '../../components/UserAvatar';
import { font, fontSize, icon, tokensOf, type Tone } from '../../design/tokens';
import { useRequestList } from '../requests/api';
import { describeEvent } from '../requests/HistoryTimeline';
import { useAdminCategories, useAdminUsers } from './api';
import { DailyChart, StatusChart } from './DashboardCharts';
import {
  DEFAULT_FILTERS,
  formatDurationMs,
  formatRate,
  toDashboardQuery,
  toRequestListFilters,
  useDashboardActivity,
  useDashboardEmployees,
  useDashboardPerformance,
  useDashboardSummary,
  type ActivityItem,
  type DashboardAlert,
  type DashboardFilters,
  type DurationStats,
  type PerformanceStats,
  type StatusGroup,
} from './dashboardApi';
import { ROLE_LABELS } from './labels';

const GROUP_LABELS: Record<StatusGroup, string> = {
  pendingValidation: 'À valider',
  pendingTakeover: 'En attente de prise en charge',
  inProgress: 'En cours',
  done: 'Terminées',
  rejected: 'Refusées',
  cancelled: 'Annulées',
};

const GROUP_ICONS: Record<StatusGroup, LucideIcon> = {
  pendingValidation: ClipboardCheck,
  pendingTakeover: Hourglass,
  inProgress: Play,
  done: CircleCheck,
  rejected: CircleX,
  cancelled: Ban,
};

const GROUP_HINTS: Record<StatusGroup, string> = {
  pendingValidation: 'En attente de validation administrative',
  pendingTakeover: 'Envoyées, pas encore acceptées',
  inProgress: 'Acceptées, en cours ou à corriger',
  done: 'Terminées, en validation finale ou clôturées',
  rejected: 'Refusées par l’administration ou l’employé',
  cancelled: 'Annulées par le demandeur',
};

const VIEWS = [
  { key: 'general', label: 'Vue générale' },
  { key: 'delais', label: 'Délais' },
  { key: 'employes', label: 'Employés' },
  { key: 'demandes', label: 'Demandes' },
  { key: 'activite', label: 'Activité' },
] as const;

type ViewKey = (typeof VIEWS)[number]['key'];

const PRIORITIES: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'NORMAL'];

/** Tableau défilant (mobile) : atteignable au clavier et nommé pour les lecteurs d’écran. */
function scrollRegion(label: string) {
  return { tabIndex: 0, role: 'region', 'aria-label': label } as const;
}

const SUBJECT = 'le tableau de bord';

function Kpi({ label, value, hint, tone = 'neutral', icon: Icon }: { label: string; value: ReactNode; hint?: string; tone?: Tone; icon: LucideIcon }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'grid', gap: 0.5, alignContent: 'start' }}>
      <Box
        sx={(theme) => ({
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          fontSize: fontSize.sm,
          color: tokensOf(theme).textSecondary,
          '& svg': { flex: 'none', color: tone === 'neutral' ? tokensOf(theme).textMuted : tokensOf(theme)[tone].main },
        })}
      >
        <Icon size={icon.sm} aria-hidden="true" />
        {label}
      </Box>
      <Typography component="p" sx={{ fontSize: fontSize.xl, fontWeight: font.medium, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Paper>
  );
}

const kpiGrid = { display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } } as const;

function Filters({ value, onChange }: { value: DashboardFilters; onChange: (patch: Partial<DashboardFilters>) => void }) {
  const categories = useAdminCategories();
  const users = useAdminUsers();
  const workCategories = (categories.data ?? []).filter((c) => c.kind === 'WORK');
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, mb: 2, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } }}
    >
      <TextField select id="tdb-periode" label="Période" size="small" value={value.preset} onChange={(e) => onChange({ preset: e.target.value as DashboardFilters['preset'] })}>
        <MenuItem value="7">7 derniers jours</MenuItem>
        <MenuItem value="30">30 derniers jours</MenuItem>
        <MenuItem value="90">90 derniers jours</MenuItem>
        <MenuItem value="custom">Personnalisée</MenuItem>
      </TextField>
      <TextField select id="tdb-categorie" label="Catégorie (service)" size="small" value={value.categoryId} onChange={(e) => onChange({ categoryId: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
        <MenuItem value="">Toutes</MenuItem>
        {workCategories.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField select id="tdb-priorite" label="Priorité" size="small" value={value.priority} onChange={(e) => onChange({ priority: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
        <MenuItem value="">Toutes</MenuItem>
        {PRIORITIES.map((p) => (
          <MenuItem key={p} value={p}>
            {PRIORITY_LABELS[p]}
          </MenuItem>
        ))}
      </TextField>
      <TextField select id="tdb-employe" label="Employé" size="small" value={value.employeeId} onChange={(e) => onChange({ employeeId: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
        <MenuItem value="">Tous</MenuItem>
        {(users.data ?? []).map((u) => (
          <MenuItem key={u.id} value={u.id}>
            {u.displayName}
          </MenuItem>
        ))}
      </TextField>
      {value.preset === 'custom' && (
        <>
          <TextField id="tdb-du" label="Du" type="date" size="small" value={value.from} onChange={(e) => onChange({ from: e.target.value })} />
          <TextField id="tdb-au" label="Au" type="date" size="small" value={value.to} onChange={(e) => onChange({ to: e.target.value })} />
        </>
      )}
    </Paper>
  );
}

function GeneralView({ qs }: { qs: string }) {
  const summary = useDashboardSummary(qs);
  if (summary.isPending) return <LoadingState label="Chargement des indicateurs" />;
  if (summary.error) return <ErrorState message={loadErrorMessage(summary.error, SUBJECT)} actionLabel="Réessayer" onAction={() => void summary.refetch()} />;
  const s = summary.data;
  const groups = Object.keys(GROUP_LABELS) as StatusGroup[];

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <SectionCard title="À traiter maintenant" icon={TriangleAlert} description="Situation actuelle, toutes périodes confondues (les autres filtres s’appliquent)." contentGap={2}>
        <Box sx={{ ...kpiGrid, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' } }}>
          <Kpi label="En retard" value={s.current.overdueNow} tone={s.current.overdueNow > 0 ? 'error' : 'neutral'} icon={AlarmClock} hint="Échéance de l’étape en cours dépassée" />
          <Kpi label="Urgentes en cours" value={s.current.urgentActive} tone={s.current.urgentActive > 0 ? 'warning' : 'neutral'} icon={Siren} hint="Priorité urgente, non terminées" />
          <Kpi label="Sans employé affecté" value={s.current.unassigned} icon={UserRoundX} hint="Envoyées ou en cours sans responsable" />
        </Box>
        {s.alerts.length === 0 ? (
          <EmptyState compact icon={CircleCheck} title="Aucune alerte" description="Aucune demande en retard ni urgente en cours." />
        ) : (
          <AlertTable alerts={s.alerts} />
        )}
      </SectionCard>

      <Box component="section" aria-labelledby="tdb-periode-titre" sx={{ display: 'grid', gap: 1.5 }}>
        <Typography id="tdb-periode-titre" component="h3" sx={{ fontWeight: font.medium }}>
          Demandes créées sur la période
        </Typography>
        <Box sx={kpiGrid}>
          <Kpi label="Total" value={s.counts.total} icon={Inbox} hint="Hors brouillons" />
          {groups.map((g) => (
            <Kpi key={g} label={GROUP_LABELS[g]} value={s.counts[g]} icon={GROUP_ICONS[g]} hint={GROUP_HINTS[g]} />
          ))}
          <Kpi label="Hors délai" value={s.counts.overdueInPeriod} tone={s.counts.overdueInPeriod > 0 ? 'error' : 'neutral'} icon={AlarmClock} hint="Au moins une étape en retard" />
        </Box>
      </Box>

      {s.counts.total === 0 ? (
        <Paper variant="outlined">
          <EmptyState icon={SearchX} title="Aucune demande" description="Aucune demande ne correspond à cette période et à ces filtres." />
        </Paper>
      ) : (
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' } }}>
          <SectionCard title="Répartition par état">
            <StatusChart data={groups.map((g) => ({ label: GROUP_LABELS[g], count: s.counts[g] }))} />
          </SectionCard>
          <SectionCard title="Évolution quotidienne">
            <DailyChart data={s.daily} />
          </SectionCard>
        </Box>
      )}

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) minmax(0, 1fr)' } }}>
        <SectionCard title="Par catégorie (service)" flush>
          {s.byCategory.length === 0 ? (
            <EmptyState compact title="Aucune donnée" description="Aucune demande sur la période." />
          ) : (
            <TableContainer {...scrollRegion('Demandes par catégorie')}>
              <Table size="small" aria-label="Demandes par catégorie">
                <TableHead>
                  <TableRow>
                    <TableCell>Catégorie</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell align="right">À traiter</TableCell>
                    <TableCell align="right">Terminées</TableCell>
                    <TableCell align="right">Hors délai</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {s.byCategory.map((c) => (
                    <TableRow key={c.category.id}>
                      <TableCell>{c.category.name}</TableCell>
                      <TableCell align="right">{c.total}</TableCell>
                      <TableCell align="right">{c.active}</TableCell>
                      <TableCell align="right">{c.done}</TableCell>
                      <TableCell align="right">{c.overdue}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </SectionCard>
        <SectionCard title="Échanges" description="Messages sur les demandes de la période (nombre seulement, jamais le contenu)." contentGap={1.5}>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <Kpi label="Écrits" value={s.messages.text} icon={MessageSquare} />
            <Kpi label="Vocaux" value={s.messages.voice} icon={Mic} />
          </Box>
        </SectionCard>
      </Box>
    </Box>
  );
}

function AlertTable({ alerts }: { alerts: DashboardAlert[] }) {
  return (
    <TableContainer component={Paper} variant="outlined" {...scrollRegion('Demandes à traiter en priorité')}>
      <Table size="small" aria-label="Demandes à traiter en priorité">
        <TableHead>
          <TableRow>
            <TableCell>Demande</TableCell>
            <TableCell>Priorité</TableCell>
            <TableCell>Statut</TableCell>
            <TableCell>Échéance</TableCell>
            <TableCell>Responsable</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {alerts.map((a) => (
            <TableRow key={a.id}>
              <TableCell sx={{ minWidth: 200 }}>
                <Box component={RouterLink} to={`/demandes/${a.id}`} sx={{ color: 'inherit', fontWeight: font.medium }}>
                  {a.title}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {a.reference} · {a.category.name}
                </Typography>
              </TableCell>
              <TableCell>
                <PriorityBadge priority={a.priority} />
              </TableCell>
              <TableCell>
                <StatusBadge status={a.status} />
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {a.overdueStage ? (
                  <Box component="span" sx={(theme) => ({ color: tokensOf(theme).error.text })}>
                    En retard ({STAGE_LABELS[a.overdueStage]})
                  </Box>
                ) : a.currentDueAt ? (
                  formatDateTime(a.currentDueAt)
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell>{a.assignee ? <Person name={a.assignee.displayName} id={a.assignee.id} size={24} /> : 'Personne'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function durationCell(d: DurationStats) {
  return (
    <>
      {formatDurationMs(d.avgMs)}
      {d.count > 0 && (
        <Typography component="span" variant="caption" color="text.secondary">
          {' '}
          (n = {d.count})
        </Typography>
      )}
    </>
  );
}

function PerformanceView({ qs }: { qs: string }) {
  const perf = useDashboardPerformance(qs);
  if (perf.isPending) return <LoadingState label="Chargement des délais" />;
  if (perf.error) return <ErrorState message={loadErrorMessage(perf.error, 'les délais')} actionLabel="Réessayer" onAction={() => void perf.refetch()} />;
  const o: PerformanceStats = perf.data.overall;
  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <Box sx={kpiGrid}>
        <Kpi label="Prise en charge moyenne" value={formatDurationMs(o.takeover.avgMs)} icon={Timer} hint={`Envoi → acceptation · ${o.takeover.count} demande(s)`} />
        <Kpi label="Traitement net moyen" value={formatDurationMs(o.resolution.avgMs)} icon={Play} hint={`Hors suspensions · ${o.resolution.count} demande(s)`} />
        <Kpi label="Traitement brut moyen" value={formatDurationMs(o.grossResolution.avgMs)} icon={Hourglass} hint="Envoi → terminée, suspensions comprises" />
        <Kpi
          label="Respect des délais"
          value={formatRate(o.compliance.rate)}
          tone={o.compliance.rate !== null && o.compliance.rate < 0.8 ? 'warning' : 'neutral'}
          icon={CircleCheck}
          hint={`${o.compliance.onTime} sur ${o.compliance.evaluated} demande(s) terminée(s) avec délai`}
        />
      </Box>
      <SectionCard title="Par priorité" flush description="Les délais attendus sont ceux des règles de chaque catégorie (Administration › Catégories).">
        <TableContainer {...scrollRegion('Délais par priorité')}>
          <Table size="small" aria-label="Délais par priorité">
            <TableHead>
              <TableRow>
                <TableCell>Priorité</TableCell>
                <TableCell align="right">Demandes</TableCell>
                <TableCell align="right">Validation</TableCell>
                <TableCell align="right">Prise en charge</TableCell>
                <TableCell align="right">Traitement net</TableCell>
                <TableCell align="right">Respect des délais</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {perf.data.byPriority.map((p) => (
                <TableRow key={p.priority}>
                  <TableCell>
                    <PriorityBadge priority={p.priority} />
                  </TableCell>
                  <TableCell align="right">{p.total}</TableCell>
                  <TableCell align="right">{durationCell(p.validation)}</TableCell>
                  <TableCell align="right">{durationCell(p.takeover)}</TableCell>
                  <TableCell align="right">{durationCell(p.resolution)}</TableCell>
                  <TableCell align="right">
                    {formatRate(p.compliance.rate)}
                    {p.compliance.evaluated > 0 && (
                      <Typography component="span" variant="caption" color="text.secondary">
                        {' '}
                        ({p.compliance.onTime}/{p.compliance.evaluated})
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionCard>
      <Typography variant="body2" color="text.secondary">
        Les moyennes ne portent que sur les demandes mesurables (n). Le traitement net compte le temps passé « Envoyée », « Acceptée » et « En cours » ; les
        périodes « À corriger » et d’attente de validation sont exclues. Une demande encore en cours n’entre pas dans le taux de respect des délais.
      </Typography>
    </Box>
  );
}

function EmployeesView({ qs }: { qs: string }) {
  const employees = useDashboardEmployees(qs);
  if (employees.isPending) return <LoadingState label="Chargement des employés" />;
  if (employees.error) return <ErrorState message={loadErrorMessage(employees.error, 'l’activité des employés')} actionLabel="Réessayer" onAction={() => void employees.refetch()} />;
  const items = employees.data.items;
  if (items.length === 0) {
    return (
      <Paper variant="outlined">
        <EmptyState icon={SearchX} title="Aucune activité" description="Aucun compte actif et aucune demande sur cette période." />
      </Paper>
    );
  }
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <TableContainer component={Paper} variant="outlined" {...scrollRegion('Activité des employés')}>
        <Table size="small" aria-label="Activité des employés">
          <TableHead>
            <TableRow>
              <TableCell>Employé</TableCell>
              <TableCell align="right">Créées</TableCell>
              <TableCell align="right">Reçues</TableCell>
              <TableCell align="right">À prendre en charge</TableCell>
              <TableCell align="right">En cours</TableCell>
              <TableCell align="right">Terminées</TableCell>
              <TableCell align="right">En retard</TableCell>
              <TableCell align="right">Prise en charge moy.</TableCell>
              <TableCell align="right">Traitement net moy.</TableCell>
              <TableCell>Dernière action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((e) => (
              <TableRow key={e.user.id}>
                <TableCell sx={{ minWidth: 180 }}>
                  <Person
                    name={e.user.displayName}
                    id={e.user.id}
                    size={24}
                    secondary={`${e.user.jobTitle ?? ROLE_LABELS[e.user.role]}${e.user.active ? '' : ' · compte désactivé'}`}
                  />
                </TableCell>
                <TableCell align="right">{e.created}</TableCell>
                <TableCell align="right">{e.assigned}</TableCell>
                <TableCell align="right">{e.pendingTakeover}</TableCell>
                <TableCell align="right">{e.inProgress}</TableCell>
                <TableCell align="right">{e.done}</TableCell>
                <TableCell align="right">{e.overdueNow > 0 ? <strong>{e.overdueNow}</strong> : 0}</TableCell>
                <TableCell align="right">{formatDurationMs(e.takeover.avgMs)}</TableCell>
                <TableCell align="right">{formatDurationMs(e.resolution.avgMs)}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{e.lastActionAt ? formatRelative(e.lastActionAt) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="body2" color="text.secondary">
        « Reçues » : demandes de la période dont l’employé est actuellement responsable. Les comptes actifs sans demande sur la période (destinataires de la
        catégorie si elle est filtrée) figurent à zéro. « Dernière action » : dernière action enregistrée sur une demande ; elle
        n’indique ni la présence ni la disponibilité de la personne.
      </Typography>
    </Box>
  );
}

function RequestsView({ filters }: { filters: string }) {
  const list = useRequestList('all', [], filters);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  if (list.isPending) return <LoadingState label="Chargement des demandes" />;
  if (list.error) return <ErrorState message={loadErrorMessage(list.error, 'les demandes')} actionLabel="Réessayer" onAction={() => void list.refetch()} />;
  if (items.length === 0) {
    return (
      <Paper variant="outlined">
        <EmptyState icon={SearchX} title="Aucune demande" description="Aucune demande ne correspond à ces filtres." />
      </Paper>
    );
  }
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <TableContainer component={Paper} variant="outlined" {...scrollRegion('Demandes de la période')}>
        <Table size="small" aria-label="Demandes de la période">
          <TableHead>
            <TableRow>
              <TableCell>Demande</TableCell>
              <TableCell>Priorité</TableCell>
              <TableCell>Statut</TableCell>
              <TableCell>Demandeur</TableCell>
              <TableCell>Responsable</TableCell>
              <TableCell>Créée le</TableCell>
              <TableCell>Échéance</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r.id}>
                <TableCell sx={{ minWidth: 200 }}>
                  <Box component={RouterLink} to={`/demandes/${r.id}`} sx={{ color: 'inherit', fontWeight: font.medium }}>
                    {r.title}
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {r.reference} · {r.category.name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={r.priority} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell>{r.requester.displayName}</TableCell>
                <TableCell>{r.assignee?.displayName ?? '—'}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.createdAt)}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {r.overdueStage ? `En retard (${STAGE_LABELS[r.overdueStage]})` : r.currentDueAt ? formatDateTime(r.currentDueAt) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="body2" color="text.secondary">
        Dates de prise en charge et de résolution : ouvrir la demande (historique complet). Le filtre « Employé » retient ici l’employé affecté.
      </Typography>
      {list.hasNextPage && (
        <Box sx={{ textAlign: 'center' }}>
          <Button variant="outlined" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
            Afficher plus de demandes
          </Button>
        </Box>
      )}
    </Box>
  );
}

/** Adapte un événement du tableau de bord au format de l'historique, pour réutiliser ses libellés. */
function describeActivity(item: ActivityItem): string {
  const d = item.details;
  const assignee = d.assignee as { displayName: string } | null | undefined;
  return describeEvent({
    id: item.id,
    type: item.type,
    actor: item.actor,
    comment: null,
    createdAt: item.createdAt,
    fromValue: { status: d.from, priority: d.from },
    toValue: { status: d.to, priority: d.to, stage: d.stage, kind: d.kind, assigneeName: assignee?.displayName },
  } as Parameters<typeof describeEvent>[0]);
}

function ActivityView({ qs }: { qs: string }) {
  const activity = useDashboardActivity(qs);
  const items = activity.data?.pages.flatMap((p) => p.items) ?? [];
  if (activity.isPending) return <LoadingState label="Chargement de l’activité" />;
  if (activity.error) return <ErrorState message={loadErrorMessage(activity.error, 'l’activité')} actionLabel="Réessayer" onAction={() => void activity.refetch()} />;
  if (items.length === 0) {
    return (
      <Paper variant="outlined">
        <EmptyState icon={SearchX} title="Aucune activité" description="Aucune action sur cette période." />
      </Paper>
    );
  }
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Box component="ul" aria-label="Dernières actions" sx={{ listStyle: 'none', m: 0, p: 0, '& > li + li': { borderTop: 1, borderColor: 'divider' } }}>
          {items.map((item) => (
            <Box component="li" key={item.id} sx={{ px: { xs: 2, md: 2.5 }, py: 1.5, display: 'grid', gap: 0.25 }}>
              <Typography variant="body2" sx={{ fontWeight: font.medium }}>
                {describeActivity(item)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <Box component={RouterLink} to={`/demandes/${item.request.id}`} sx={{ color: 'inherit' }}>
                  {item.request.reference} — {item.request.title}
                </Box>
                {' · '}
                {item.actor ? item.actor.displayName : 'Système'} · <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>
      {activity.hasNextPage && (
        <Box sx={{ textAlign: 'center' }}>
          <Button variant="outlined" loading={activity.isFetchingNextPage} onClick={() => void activity.fetchNextPage()}>
            Afficher plus d’actions
          </Button>
        </Box>
      )}
    </Box>
  );
}

/** Tableau de bord de supervision des demandes de travail (super administrateur). */
export function DashboardPage() {
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [params, setParams] = useSearchParams();
  const view: ViewKey = VIEWS.find((v) => v.key === params.get('vue'))?.key ?? 'general';
  const customIncomplete = filters.preset === 'custom' && (!filters.from || !filters.to);
  const qs = toDashboardQuery(filters);
  const listFilters = toRequestListFilters(filters);

  return (
    <Box component="section" aria-labelledby="titre-tableau-de-bord">
      <SectionHeader
        id="titre-tableau-de-bord"
        title="Tableau de bord"
        description="Supervision des demandes de travail. Les chiffres sont actualisés automatiquement chaque minute."
      />
      <Filters value={filters} onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))} />

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={view}
          onChange={(_, key: ViewKey) => {
            const next = new URLSearchParams(params);
            next.set('vue', key);
            setParams(next, { replace: true });
          }}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label="Vues du tableau de bord"
        >
          {VIEWS.map((v) => (
            <Tab key={v.key} value={v.key} label={v.label} id={`tdb-onglet-${v.key}`} aria-controls="tdb-contenu" />
          ))}
        </Tabs>
      </Box>

      <Box id="tdb-contenu" role="tabpanel" aria-labelledby={`tdb-onglet-${view}`}>
        {customIncomplete ? (
          <Paper variant="outlined">
            <EmptyState icon={CalendarRange} title="Période incomplète" description="Choisissez une date de début et une date de fin." />
          </Paper>
        ) : view === 'general' ? (
          <GeneralView qs={qs} />
        ) : view === 'delais' ? (
          <PerformanceView qs={qs} />
        ) : view === 'employes' ? (
          <EmployeesView qs={qs} />
        ) : view === 'demandes' ? (
          <RequestsView filters={listFilters} />
        ) : (
          <ActivityView qs={qs} />
        )}
      </Box>
    </Box>
  );
}
