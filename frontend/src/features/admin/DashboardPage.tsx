import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import type { Theme } from '@mui/material/styles';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { AlarmClock, CalendarRange, Download, Inbox, SearchX, Siren, SlidersHorizontal, Ticket } from 'lucide-react';
import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { loadErrorMessage } from '../../api/client';
import type { Priority } from '../../api/types';
import { STAGE_LABELS } from '../../components/Countdown';
import { visuallyHidden } from '../../components/a11y';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime, formatLateness } from '../../components/format';
import { PageHeader } from '../../components/PageHeader';
import { PRIORITY_LABELS, PriorityLabel } from '../../components/PriorityBadge';
import { SectionCard } from '../../components/SectionCard';
import { STATUS_LABELS, StatusBadge } from '../../components/StatusBadge';
import { Person, UserAvatar } from '../../components/UserAvatar';
import { cardShadow, font, fontSize, icon, radius, tokensOf } from '../../design/tokens';
import { locale, isPlural, t } from '../../i18n';
import { useAdminCategories, useAdminUsers } from './api';
import { DailyChart, StatusDonut } from './DashboardCharts';
import { ActivityFeed } from './ActivityFeed';
import { DashboardSkeleton } from './DashboardSkeleton';
import { FilterChips } from './FilterChips';
import { DelaysView } from './DelaysView';
import { EmployeesView } from './EmployeesView';
import { KpiCard } from './KpiCard';
import {
  CURRENT_INDICATORS,
  filtersFromParams,
  indicatorFromParams,
  indicatorLink,
  priorityLink,
  periodOf,
  toDashboardQuery,
  useDashboardActivity,
  useDashboardRequests,
  useDashboardSummary,
  withFilters,
  withoutIndicator,
  type DashboardAlert,
  type DashboardFilters,
  type DashboardIndicator,
  type DashboardRequestRow,
  type DashboardSummary,
  type StatusGroup,
} from './dashboardApi';

const GROUP_LABELS: Record<StatusGroup, string> = {
  pendingValidation: t('À valider'),
  pendingTakeover: t('En attente de prise en charge'),
  inProgress: t('En cours'),
  done: t('Terminées'),
  rejected: t('Refusées'),
  cancelled: t('Annulées'),
};

/** Libellé de chaque chiffre cliquable, repris dans le bandeau et le nom de sa liste. */
const INDICATOR_LABELS: Record<DashboardIndicator, string> = {
  total: t('Total'),
  ...GROUP_LABELS,
  overdueInPeriod: t('Hors délai'),
  overdueNow: t('En retard'),
  urgentActive: t('Urgentes en cours'),
  unassigned: t('Sans employé affecté'),
  waiting: t('En attente'),
  toCorrect: t('À corriger'),
};

/** Nom du lien d'un chiffre pour les lecteurs d'écran : libellé, valeur, destination. */
const linkLabel = (label: string, value: number) => t('{label} : {value} — voir ces demandes', { label, value });

const VIEWS = [
  { key: 'general', label: t('Vue générale') },
  { key: 'delais', label: t('Délais') },
  { key: 'employes', label: t('Employés') },
  { key: 'demandes', label: t('Demandes') },
  { key: 'activite', label: t('Activité') },
] as const;

type ViewKey = (typeof VIEWS)[number]['key'];

/** Filtre : l'urgence d'abord (016 : deux priorités). */
const PRIORITIES: Priority[] = ['URGENT', 'NORMAL'];

/** Tableau défilant (mobile) : atteignable au clavier et nommé pour les lecteurs d’écran. */
function scrollRegion(label: string) {
  return { tabIndex: 0, role: 'region', 'aria-label': label } as const;
}

/**
 * Longs tableaux : hauteur bornée à partir de md pour que l'en-tête collant reste visible ; sur
 * mobile, la page défile normalement (pas de zone défilante imbriquée).
 */
const stickyArea = { maxHeight: { md: 560 } } as const;

const SUBJECT = t('le tableau de bord');

/**
 * Onglets de vue en contrôle segmenté, pour ne pas les confondre avec la navigation soulignée des
 * sections de l'administration. L'onglet actif est signalé par sa pastille blanche en relief et sa
 * graisse, pas par la seule couleur.
 */
const segmentedTabs = (theme: Theme) => {
  const t = tokensOf(theme);
  return {
    display: 'inline-flex',
    maxWidth: '100%',
    minHeight: 0,
    p: 0.5,
    border: `1px solid ${t.border}`,
    borderBottom: `1px solid ${t.border}`,
    borderRadius: `${radius.control + 2}px`,
    bgcolor: t.surfaceMuted,
    '& .MuiTabs-indicator': { display: 'none' },
    '& .MuiTabs-list': { gap: 0.5 },
    '& .MuiTabs-scrollButtons': { width: 32, borderRadius: `${radius.control}px` },
    '& .MuiTab-root': {
      minHeight: 36,
      py: 0.75,
      px: 1.5,
      borderRadius: `${radius.control}px`,
      '@media (pointer: coarse)': { minHeight: 44 },
      '&.Mui-focusVisible': { outlineOffset: -2 },
    },
    '& .MuiTab-root.Mui-selected': { bgcolor: t.surface, color: t.text, fontWeight: font.semibold, boxShadow: cardShadow },
  };
};

/** Période : toujours visible dans l'en-tête (libellé masqué visuellement, nom accessible « Période »). */
function PeriodSelect({ value, onChange }: { value: DashboardFilters; onChange: (patch: Partial<DashboardFilters>) => void }) {
  return (
    <TextField
      select
      id="tdb-periode"
      label={t('Période')}
      size="small"
      fullWidth={false}
      value={value.preset}
      onChange={(e) => onChange({ preset: e.target.value as DashboardFilters['preset'] })}
      slotProps={{ inputLabel: { sx: visuallyHidden } }}
      sx={{ minWidth: 176 }}
    >
      <MenuItem value="1">{t('Aujourd’hui')}</MenuItem>
      <MenuItem value="7">{t('7 derniers jours')}</MenuItem>
      <MenuItem value="30">{t('30 derniers jours')}</MenuItem>
      <MenuItem value="90">{t('90 derniers jours')}</MenuItem>
      <MenuItem value="custom">{t('Personnalisée')}</MenuItem>
    </TextField>
  );
}

const dayMonth = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' });

/** « 29 sept. – 29 oct. 2026 » (année répétée si elle change) ; null tant qu'une date manque. */
function periodLabel(f: DashboardFilters): string | null {
  const { from, to } = periodOf(f);
  if (!from || !to) return null;
  // Jours calendaires locaux (AAAA-MM-JJ) : midi évite tout décalage de fuseau.
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${(sameYear ? dayMonth : dayMonthYear).format(start)} – ${dayMonthYear.format(end)}`;
}

/** Filtres secondaires actifs (catégorie, priorité, employé), affichés sur le bouton « Filtres ». */
function activeFilterCount(f: DashboardFilters): number {
  return [f.categoryId, f.priority, f.employeeId].filter(Boolean).length;
}

/** Panneau des filtres secondaires, et des dates d'une période personnalisée. */
function FiltersPanel({ value, onChange }: { value: DashboardFilters; onChange: (patch: Partial<DashboardFilters>) => void }) {
  const categories = useAdminCategories();
  const users = useAdminUsers();
  const workCategories = (categories.data ?? []).filter((c) => c.kind === 'WORK');
  // À 320 px : catégorie (libellés longs) et dates sur toute la largeur, priorité et employé côte à côte.
  const wide = { gridColumn: { xs: '1 / -1', sm: 'auto' } } as const;
  return (
    <Paper
      variant="elevated"
      id="tdb-filtres"
      role="group"
      aria-label={t('Filtres du tableau de bord')}
      sx={{
        p: { xs: 1.5, sm: 2 },
        mb: 2,
        display: 'grid',
        gap: { xs: 1.5, sm: 2 },
        alignItems: 'end',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' },
      }}
    >
      {value.preset === 'custom' && (
        <>
          <TextField id="tdb-du" label={t('Du')} type="date" size="small" sx={wide} value={value.from} onChange={(e) => onChange({ from: e.target.value })} />
          <TextField id="tdb-au" label={t('Au')} type="date" size="small" sx={{ ...wide, gridColumn: { xs: '1 / -1', sm: 'auto', md: 'span 2' } }} value={value.to} onChange={(e) => onChange({ to: e.target.value })} />
        </>
      )}
      <TextField select id="tdb-categorie" label={t('Catégorie (service)')} size="small" sx={wide} value={value.categoryId} onChange={(e) => onChange({ categoryId: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
        <MenuItem value="">{t('Toutes')}</MenuItem>
        {workCategories.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField select id="tdb-priorite" label={t('Priorité')} size="small" value={value.priority} onChange={(e) => onChange({ priority: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
        <MenuItem value="">{t('Toutes')}</MenuItem>
        {PRIORITIES.map((p) => (
          <MenuItem key={p} value={p}>
            {PRIORITY_LABELS[p]}
          </MenuItem>
        ))}
      </TextField>
      <TextField select id="tdb-employe" label={t('Employé')} size="small" value={value.employeeId} onChange={(e) => onChange({ employeeId: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
        <MenuItem value="">{t('Tous')}</MenuItem>
        {(users.data ?? []).map((u) => (
          <MenuItem key={u.id} value={u.id}>
            {u.displayName}
          </MenuItem>
        ))}
      </TextField>
    </Paper>
  );
}

/** Pastilles de « À traiter maintenant » : tout, en retard, urgentes, non assignées. */
type AlertFilter = 'all' | 'overdue' | 'urgent' | 'unassigned';

const ALERT_FILTERS: Array<{ key: AlertFilter; label: string; tone: 'accent' | 'error' | 'warning' }> = [
  { key: 'all', label: t('Tout'), tone: 'accent' },
  { key: 'overdue', label: t('En retard'), tone: 'error' },
  { key: 'urgent', label: t('Urgentes'), tone: 'warning' },
  { key: 'unassigned', label: t('Non assignées'), tone: 'accent' },
];

/** Lien d'action isolé (« Voir toutes… ») : couleur d'accent, souligné au survol. */
const actionLink = { fontWeight: font.medium, color: 'primary.main', textDecoration: 'none', justifySelf: 'start', '&:hover, &:focus-visible': { textDecoration: 'underline' } } as const;

/** Une tuile de tête : teintée, avec un liseré de couleur, qui ouvre la liste de ses demandes. */
const tilesGrid = { display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, '& > :first-of-type': { gridColumn: { xs: '1 / -1', sm: 'auto' } } } as const;

function GeneralView({ qs, linkTo, priorityTo }: { qs: string; linkTo: (indicator: DashboardIndicator) => string; priorityTo: (priority: Priority) => string }) {
  const summary = useDashboardSummary(qs);
  if (summary.isPending) return <DashboardSkeleton label={t('Chargement des indicateurs')} shape="general" />;
  if (summary.error) return <ErrorState message={loadErrorMessage(summary.error, SUBJECT)} actionLabel={t('Réessayer')} onAction={() => void summary.refetch()} />;
  const s = summary.data;
  const groups = Object.keys(GROUP_LABELS) as StatusGroup[];
  const empty = s.counts.total === 0 && s.daily.every((d) => d.completed === 0);

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      {/* Une ligne de trois chiffres pour la période : le total, puis sa part urgente et sa part normale. */}
      <Box component="section" aria-labelledby="tdb-periode-titre" sx={{ display: 'grid', gap: 1.5 }}>
        <Typography id="tdb-periode-titre" component="h2" variant="h6">
          {t('Demandes créées sur la période')}
        </Typography>
        <Box sx={tilesGrid}>
          <KpiCard bar label={t('Total')} value={s.counts.total} icon={Inbox} accent="indigo" to={linkTo('total')} linkLabel={linkLabel(t('Total'), s.counts.total)} />
          <KpiCard bar label={t('Urgentes')} value={s.counts.urgent} icon={Siren} accent="red" to={priorityTo('URGENT')} linkLabel={linkLabel(t('Urgentes'), s.counts.urgent)} />
          <KpiCard bar label={t('Normales')} value={s.counts.normal} icon={Ticket} accent="yellow" to={priorityTo('NORMAL')} linkLabel={linkLabel(t('Normales'), s.counts.normal)} />
        </Box>
      </Box>

      {empty && (
        <Paper variant="elevated">
          <EmptyState icon={SearchX} title={t('Aucune demande')} description={t('Aucune demande ne correspond à cette période et à ces filtres.')} />
        </Paper>
      )}

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: empty ? '1fr' : 'minmax(0, 2fr) minmax(0, 1fr)' }, alignItems: 'start' }}>
        <AlertsPanel summary={s} linkTo={linkTo} />
        {!empty && (
          <SectionCard elevated title={t('Répartition par état')} description={t('Demandes de la période')}>
            <StatusDonut data={groups.map((g) => ({ label: GROUP_LABELS[g], count: s.counts[g], to: linkTo(g), linkLabel: linkLabel(GROUP_LABELS[g], s.counts[g]) }))} />
          </SectionCard>
        )}
      </Box>

      <SectionCard elevated title={t('Par catégorie (service)')} flush>
        {s.byCategory.length === 0 ? (
          <EmptyState compact title={t('Aucune donnée')} description={t('Aucune demande sur la période.')} />
        ) : (
          <Box
            component="ul"
            aria-label={t('Demandes par catégorie')}
            sx={(theme) => ({ listStyle: 'none', m: 0, p: 0, pb: 1, '& > li + li': { borderTop: `1px solid ${tokensOf(theme).border}` } })}
          >
            {s.byCategory.map((c) => (
              <CategoryRow key={c.category.id} row={c} />
            ))}
          </Box>
        )}
      </SectionCard>

      {!empty && (
        <SectionCard
          elevated
          title={t('Évolution quotidienne')}
          description={t('Créées : jour de création. Terminées : jour de la première fin de traitement, même pour une demande créée avant la période.')}
          contentGap={1}
        >
          <DailyChart data={s.daily} />
          <Typography variant="body2" color="text.secondary">
            {t('Messages de la période : écrits {text}, vocaux {voice}.', { text: s.messages.text, voice: s.messages.voice })}
          </Typography>
        </SectionCard>
      )}
    </Box>
  );
}

/** Demande active sans employé affecté, comme le compte le serveur (une demande à valider n'en a pas encore). */
const isUnassigned = (a: DashboardAlert) => !a.assignee && a.status !== 'PENDING_ADMIN_VALIDATION';

/**
 * « À traiter maintenant » : la situation actuelle, toutes périodes confondues. Les pastilles (avec leur
 * effectif réel) filtrent les alertes déjà chargées ; un seul lien « voir toutes » suit la pastille choisie.
 */
function AlertsPanel({ summary: s, linkTo }: { summary: DashboardSummary; linkTo: (indicator: DashboardIndicator) => string }) {
  const [filter, setFilter] = useState<AlertFilter>('all');
  const counts: Record<AlertFilter, number> = { all: s.alerts.length, overdue: s.current.overdueNow, urgent: s.current.urgentActive, unassigned: s.current.unassigned };
  const matches: Record<AlertFilter, (a: DashboardAlert) => boolean> = {
    all: () => true,
    overdue: (a) => Boolean(a.overdueStage),
    urgent: (a) => a.priority === 'URGENT',
    unassigned: isUnassigned,
  };
  const rows = s.alerts.filter(matches[filter]);
  // Le lien « voir toutes » ouvre la liste complète ; « Tout » mène à la première liste qui n'est pas vide.
  const target: 'overdueNow' | 'urgentActive' | 'unassigned' =
    filter === 'urgent'
      ? 'urgentActive'
      : filter === 'unassigned'
        ? 'unassigned'
        : filter === 'overdue' || s.current.overdueNow > 0
          ? 'overdueNow'
          : s.current.urgentActive > 0
            ? 'urgentActive'
            : s.current.unassigned > 0
              ? 'unassigned'
              : 'overdueNow';
  const targetCount = s.current[target];
  const targetText = { overdueNow: t('Voir toutes les demandes en retard'), urgentActive: t('Voir toutes les demandes urgentes'), unassigned: t('Voir toutes les demandes non assignées') }[target];
  const emptyText = { all: '', overdue: t('Aucune demande en retard.'), urgent: t('Aucune demande urgente.'), unassigned: t('Aucune demande non assignée.') }[filter];
  const hidden = filter !== 'all' && rows.length < counts[filter];

  return (
    <SectionCard elevated title={t('À traiter maintenant')} description={t('Situation actuelle, toutes périodes confondues (les autres filtres s’appliquent).')} contentGap={2}>
      {s.alerts.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('Aucune alerte : aucune demande en retard, urgente ou sans employé affecté.')}
        </Typography>
      ) : (
        <>
          <FilterChips
            label={t('Filtrer les demandes à traiter')}
            items={ALERT_FILTERS.map((f) => ({ key: f.key, label: f.label, tone: f.tone, count: counts[f.key] }))}
            value={filter}
            onChange={setFilter}
          />
          {rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {emptyText}
            </Typography>
          ) : (
            <AlertTable alerts={rows} />
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5 }}>
            {targetCount > 0 ? (
              <Box component={RouterLink} to={linkTo(target)} aria-label={linkLabel(INDICATOR_LABELS[target], targetCount)} sx={actionLink}>
                {targetText}
              </Box>
            ) : (
              <span />
            )}
            {hidden && (
              <Typography variant="body2" color="text.secondary">
                {t('Affichées : {shown} sur {total}.', { shown: rows.length, total: counts[filter] })}
              </Typography>
            )}
          </Box>
        </>
      )}
    </SectionCard>
  );
}

/**
 * Échéance d'une alerte : texte rouge simple « 3 j de retard » (ou « En retard » sans date) ; étape
 * et date exacte en infobulle, accessible au clavier. Sinon, la date d'échéance en gris.
 */
function DueText({ alert: a }: { alert: DashboardAlert }) {
  if (a.overdueStage) {
    // Le marqueur de retard porte sur l'étape en cours : son échéance est la date dépassée.
    const dueAt = a.currentStage === a.overdueStage ? a.currentDueAt : null;
    const lateness = dueAt ? formatLateness(dueAt) : null;
    const stage = STAGE_LABELS[a.overdueStage];
    const detail = dueAt ? t('En retard ({stage}), échéance le {date}', { stage, date: formatDateTime(dueAt) }) : t('En retard ({stage})', { stage });
    return (
      <Tooltip title={detail} describeChild placement="bottom-start">
        <Box component="span" tabIndex={0} sx={(theme) => ({ color: tokensOf(theme).error.text, fontWeight: font.medium, borderRadius: '2px' })}>
          {lateness ?? t('En retard')}
        </Box>
      </Tooltip>
    );
  }
  return (
    <Box component="span" sx={(theme) => ({ color: tokensOf(theme).textSecondary })}>
      {a.currentDueAt ? formatDateTime(a.currentDueAt) : '—'}
    </Box>
  );
}

/**
 * Alertes : titre en texte principal, catégorie en gris ; le numéro (D-2026-…) n'apparaît qu'au
 * survol de la ligne ou au focus du lien (toujours visible sur écran tactile). Séparateurs fins,
 * sans cadre autour du tableau. Le statut n'est écrit que s'il diffère de « Envoyée ».
 */
function AlertTable({ alerts }: { alerts: DashboardAlert[] }) {
  return (
    <TableContainer sx={stickyArea} {...scrollRegion(t('Demandes à traiter en priorité'))}>
      <Table
        size="small"
        stickyHeader
        aria-label={t('Demandes à traiter en priorité')}
        sx={(theme) => {
          const t = tokensOf(theme);
          return {
            minWidth: 600,
            '& th': { bgcolor: t.surface, color: t.textSecondary, fontWeight: font.medium, borderBottom: `1px solid ${t.border}` },
            '& td': { borderBottom: `1px solid ${t.border}`, py: 1.25, verticalAlign: 'middle' },
            '& tbody tr:last-of-type td': { borderBottom: 0 },
            '& th:first-of-type, & td:first-of-type': { pl: 0 },
            '& .tdb-ref': { opacity: 0, transition: 'opacity 150ms' },
            '& tbody tr:hover .tdb-ref, & tbody tr:focus-within .tdb-ref': { opacity: 1 },
            '@media (hover: none)': { '& .tdb-ref': { opacity: 1 } },
          };
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell>{t('Demande')}</TableCell>
            <TableCell>{t('Priorité')}</TableCell>
            <TableCell>{t('Échéance')}</TableCell>
            <TableCell>{t('Affectée à')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {alerts.map((a) => (
            <TableRow key={a.id}>
              <TableCell sx={{ minWidth: 220 }}>
                <Box
                  component={RouterLink}
                  to={`/demandes/${a.id}`}
                  sx={{ color: 'text.primary', fontWeight: font.medium, textDecoration: 'none', overflowWrap: 'anywhere', '&:hover, &:focus-visible': { textDecoration: 'underline' } }}
                >
                  {a.title}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {a.category.name}
                  {a.status !== 'SENT' && ` · ${STATUS_LABELS[a.status]}`}
                  <Box component="span" className="tdb-ref" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {' '}
                    · {a.reference}
                  </Box>
                </Typography>
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <PriorityLabel priority={a.priority} />
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <DueText alert={a} />
              </TableCell>
              <TableCell>
                {a.assignee ? (
                  <Person name={a.assignee.displayName} id={a.assignee.id} size={24} neutral />
                ) : (
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    {t('Personne')}
                  </Box>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

type CategoryStats = DashboardSummary['byCategory'][number];

/**
 * Une catégorie (service) : nom, mini-barre (rouge : hors délai, accent : terminées, gris : le
 * reste) et « hors délai / total ». Détail complet, sans les zéros, en infobulle (survol et focus).
 */
function CategoryRow({ row: c }: { row: CategoryStats }) {
  const detail = [
    t('{count} au total', { count: c.total }),
    c.active > 0 && t('{count} à traiter', { count: c.active }),
    c.done > 0 && t(isPlural(c.done) ? '{count} terminées' : '{count} terminée', { count: c.done }),
    c.overdue > 0 && t('{count} hors délai', { count: c.overdue }),
  ]
    .filter(Boolean)
    .join(' · ');
  // Une demande hors délai peut aussi être terminée : la barre ne dépasse jamais le total.
  const overdueShare = c.total > 0 ? Math.min(c.overdue, c.total) / c.total : 0;
  const doneShare = c.total > 0 ? Math.min(c.done, c.total - Math.min(c.overdue, c.total)) / c.total : 0;
  return (
    <Tooltip title={detail} describeChild placement="top-start">
      <Box
        component="li"
        tabIndex={0}
        sx={{
          display: 'grid',
          // Petit écran : nom et indicateur sur une ligne, barre pleine largeur dessous.
          gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', sm: 'minmax(0, 1fr) minmax(56px, 160px) auto' },
          gridTemplateAreas: { xs: '"name count" "bar bar"', sm: '"name bar count"' },
          alignItems: 'center',
          columnGap: { xs: 1.5, sm: 2 },
          rowGap: 1,
          px: { xs: 2, sm: 3 },
          py: 1.5,
          '&:focus-visible': { outlineOffset: -2 },
        }}
      >
        <Typography sx={{ gridArea: 'name', fontWeight: font.medium, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.category.name}</Typography>
        <Box
          aria-hidden="true"
          sx={(theme) => ({ gridArea: 'bar', display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', bgcolor: tokensOf(theme).surfaceMuted })}
        >
          {overdueShare > 0 && <Box sx={(theme) => ({ width: `${overdueShare * 100}%`, bgcolor: tokensOf(theme).error.main })} />}
          {doneShare > 0 && <Box sx={(theme) => ({ width: `${doneShare * 100}%`, bgcolor: tokensOf(theme).accent.main })} />}
        </Box>
        <Box component="span" sx={(theme) => ({ gridArea: 'count', fontVariantNumeric: 'tabular-nums', fontSize: fontSize.sm, color: tokensOf(theme).textSecondary, whiteSpace: 'nowrap' })}>
          {c.overdue > 0 ? (
            <>
              <Box component="span" sx={(theme) => ({ color: tokensOf(theme).error.text, fontWeight: font.semibold })}>
                {c.overdue}
              </Box>
              <Box component="span" sx={visuallyHidden}>
                {' '}
                {t('hors délai sur')}
              </Box>
              <span aria-hidden="true"> / </span>
              {c.total}
            </>
          ) : (
            <>
              {c.total}
              <Box component="span" sx={visuallyHidden}>
                {' '}
                {t('au total')}
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Tooltip>
  );
}

/** « D-2026-000004 » → « #004 » : numéro court de la liste (le numéro complet est au survol). */
function shortNumber(reference: string): string {
  const digits = /(\d+)$/.exec(reference)?.[1];
  return digits ? `#${String(Number(digits)).padStart(3, '0')}` : reference;
}

/** Date et heure sans l'année (« 13 oct., 14:12 ») : la liste couvre une période récente. */
const shortDateTime = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Une seule couleur d'alerte : rouge pour l'urgence (et le retard), gris sinon. */
function priorityColor(theme: Theme, priority: Priority): string {
  const t = tokensOf(theme);
  return priority === 'URGENT' ? t.error.text : t.textSecondary;
}

/** Détails au survol (ou au focus) d'une ligne : numéro complet, statut entier, catégorie, échéance. */
function RequestRowDetails({ r }: { r: DashboardRequestRow }) {
  const due = r.overdueStage
    ? t('dépassée ({stage})', { stage: STAGE_LABELS[r.overdueStage] })
    : r.currentDueAt
      ? formatDateTime(r.currentDueAt)
      : t('aucune');
  return (
    <Box sx={{ display: 'grid', gap: 0.25 }}>
      <span>{r.reference}</span>
      <span>{t('Statut : {status}', { status: STATUS_LABELS[r.status] })}</span>
      <span>{t('Catégorie : {category}', { category: r.category.name })}</span>
      <span>{t('Échéance : {due}', { due })}</span>
      <span>{t('Historique complet : ouvrir la demande')}</span>
    </Box>
  );
}

interface RequestsTableProps {
  items: DashboardRequestRow[];
  /** Nom du tableau et de sa zone de défilement. */
  label: string;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onMore: () => void;
}

/** « En retard » : pastille rouge pleine, la seule de la liste, pour qu'elle se repère avant les autres statuts. */
function OverdueBadge() {
  return (
    <Box
      component="span"
      sx={(theme) => {
        const k = tokensOf(theme);
        return {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          height: 24,
          px: 1.25,
          borderRadius: `${radius.round}px`,
          bgcolor: k.error.main,
          color: theme.palette.getContrastText(k.error.main),
          fontSize: fontSize.xs,
          fontWeight: font.medium,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        };
      }}
    >
      <AlarmClock size={icon.sm - 2} strokeWidth={2} aria-hidden="true" />
      <span>{t('En retard')}</span>
    </Box>
  );
}

/** Priorité : un point (rouge pour l'urgence, gris sinon) devant le libellé écrit, jamais seul. */
function PriorityCell({ priority }: { priority: Priority }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      <Box
        component="span"
        aria-hidden="true"
        data-priority-dot={priority}
        sx={(theme) => ({ width: 8, height: 8, borderRadius: '50%', flex: 'none', bgcolor: priority === 'URGENT' ? tokensOf(theme).error.main : tokensOf(theme).textMuted })}
      />
      {PRIORITY_LABELS[priority]}
    </Box>
  );
}

/** Demandeur → affecté : deux avatars et le nom de l'affecté ; les deux noms sont écrits pour les lecteurs d'écran. */
function PeopleCell({ r }: { r: DashboardRequestRow }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
      <UserAvatar name={r.requester.displayName} id={r.requester.id} size={24} />
      <Box component="span" aria-hidden="true" sx={{ color: 'text.secondary' }}>
        →
      </Box>
      {r.assignee ? (
        <>
          <UserAvatar name={r.assignee.displayName} id={r.assignee.id} size={24} />
          <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {r.assignee.displayName}
          </Box>
        </>
      ) : (
        <Box
          component="span"
          aria-hidden="true"
          data-unassigned=""
          sx={(theme) => ({ width: 24, height: 24, flex: 'none', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px dashed ${tokensOf(theme).borderStrong}`, color: tokensOf(theme).textSecondary })}
        >
          –
        </Box>
      )}
      <Box component="span" sx={visuallyHidden}>
        {t('Demandeur : {requester}, affectée à : {assignee}', { requester: r.requester.displayName, assignee: r.assignee?.displayName ?? '—' })}
      </Box>
    </Box>
  );
}

function RequestsTable({ items, label, hasNextPage, isFetchingNextPage, onMore }: RequestsTableProps) {
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <TableContainer component={Paper} variant="elevated" sx={stickyArea} {...scrollRegion(label)}>
        <Table
          size="small"
          stickyHeader
          aria-label={label}
          sx={(theme) => ({
            tableLayout: 'fixed',
            minWidth: 840,
            '& th': {
              bgcolor: tokensOf(theme).surface,
              color: tokensOf(theme).textSecondary,
              fontWeight: font.medium,
              fontSize: fontSize.xs,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            },
            '& td, & th': { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
            '& tbody td': { height: 52, py: 0 },
          })}
        >
          <colgroup>
            <col />
            <col style={{ width: 112 }} />
            <col style={{ width: 216 }} />
            <col style={{ width: 232 }} />
            <col style={{ width: 128 }} />
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell>{t('Demande')}</TableCell>
              <TableCell>{t('Priorité')}</TableCell>
              <TableCell>{t('Statut')}</TableCell>
              <TableCell>
                {t('Demandeur')}{' '}
                <span aria-hidden="true">→</span>
                <Box component="span" sx={visuallyHidden}>
                  {t('et')}
                </Box>{' '}
                {t('Affecté')}
              </TableCell>
              <TableCell>{t('Créée')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((r) => (
              <Tooltip key={r.id} title={<RequestRowDetails r={r} />} placement="bottom-start" describeChild enterDelay={400}>
                <TableRow hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
                      <Box
                        component={RouterLink}
                        to={`/demandes/${r.id}`}
                        sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', color: 'text.primary', fontWeight: font.semibold, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                      >
                        {r.title}
                      </Box>
                      <Box component="span" sx={{ flex: 'none', color: 'text.secondary', fontSize: fontSize.xs, fontVariantNumeric: 'tabular-nums' }}>
                        {shortNumber(r.reference)}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={(theme) => ({ color: priorityColor(theme, r.priority), fontWeight: r.priority === 'URGENT' ? font.medium : font.regular })}>
                    <PriorityCell priority={r.priority} />
                  </TableCell>
                  {/* « En retard » remplace le statut quand une étape a dépassé son échéance. */}
                  <TableCell>{r.overdueStage ? <OverdueBadge /> : <StatusBadge status={r.status} compact />}</TableCell>
                  <TableCell>
                    <PeopleCell r={r} />
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{shortDateTime.format(new Date(r.createdAt))}</TableCell>
                </TableRow>
              </Tooltip>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {/* Pied de tableau : l'aide à gauche, « Afficher plus » à droite. */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          {t('Survol d’une ligne : numéro complet, catégorie et échéance. Historique complet : ouvrir la demande.')}
        </Typography>
        {hasNextPage && (
          <Button variant="outlined" loading={isFetchingNextPage} onClick={onMore}>
            {t('Afficher plus de demandes')}
          </Button>
        )}
      </Box>
    </Box>
  );
}

/** Pastilles de l'onglet Demandes : chacune est un chiffre du tableau de bord ; « Toutes » est la liste de la période. */
const REQUEST_FILTERS: Array<{ key: string; label: string; indicator: DashboardIndicator | null; tone?: 'error' | 'warning' }> = [
  { key: 'all', label: t('Toutes'), indicator: null },
  { key: 'overdue', label: t('En retard'), indicator: 'overdueNow', tone: 'error' },
  { key: 'urgent', label: t('Urgentes'), indicator: 'urgentActive', tone: 'warning' },
  { key: 'waiting', label: t('En attente'), indicator: 'waiting' },
  { key: 'toCorrect', label: t('À corriger'), indicator: 'toCorrect' },
  { key: 'done', label: t('Terminées'), indicator: 'done' },
];

/** Pastille d'un chiffre ; « Total » est la liste habituelle, donc « Toutes » ; un chiffre sans pastille n'en choisit aucune. */
function filterKeyOf(indicator: DashboardIndicator | null): string | null {
  if (indicator === null || indicator === 'total') return 'all';
  return REQUEST_FILTERS.find((f) => f.indicator === indicator)?.key ?? null;
}

/**
 * Onglet Demandes : pastilles de filtre, puis la liste. Sans pastille choisie : les demandes de la carte Total (mêmes
 * filtres, employé demandeur ou affecté, sans brouillon). Chaque pastille est un chiffre de la vue générale, et la liste
 * vient du serveur avec la même définition que ce chiffre. Un chiffre qui n'a pas de pastille garde son bandeau.
 */
function RequestsView({ qs, indicator, onSelect }: { qs: string; indicator: DashboardIndicator | null; onSelect: (indicator: DashboardIndicator | null) => void }) {
  const list = useDashboardRequests(qs, indicator ?? 'total');
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const filterKey = filterKeyOf(indicator);
  const hasChip = filterKey !== null;
  const current = indicator !== null && CURRENT_INDICATORS.includes(indicator);
  let content;
  if (list.isPending) content = <DashboardSkeleton label={t('Chargement des demandes')} shape="table" />;
  else if (list.error) content = <ErrorState message={loadErrorMessage(list.error, t('les demandes'))} actionLabel={t('Réessayer')} onAction={() => void list.refetch()} />;
  else if (items.length === 0) {
    content = (
      <Paper variant="elevated">
        <EmptyState
          icon={SearchX}
          title={t('Aucune demande')}
          description={!indicator || indicator === 'total' ? t('Aucune demande ne correspond à ces filtres.') : hasChip ? t('Aucune demande ne correspond à ce filtre.') : t('Aucune demande ne correspond à ce chiffre.')}
        />
      </Paper>
    );
  } else {
    content = (
      <RequestsTable
        items={items}
        label={indicator ? t('Demandes : {label}', { label: INDICATOR_LABELS[indicator] }) : t('Demandes de la période')}
        hasNextPage={list.hasNextPage}
        isFetchingNextPage={list.isFetchingNextPage}
        onMore={() => void list.fetchNextPage()}
      />
    );
  }
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <FilterChips
        label={t('Filtrer les demandes')}
        items={REQUEST_FILTERS.map((f) => ({ key: f.key, label: f.label, tone: f.tone }))}
        value={filterKey}
        onChange={(key) => onSelect(REQUEST_FILTERS.find((f) => f.key === key)?.indicator ?? null)}
      />
      {indicator && !hasChip && (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={() => onSelect(null)}>
              {t('Voir toutes les demandes')}
            </Button>
          }
        >
          {current ? t('« {label} » : situation actuelle, toutes périodes confondues.', { label: INDICATOR_LABELS[indicator] }) : t('« {label} » : demandes créées sur la période.', { label: INDICATOR_LABELS[indicator] })}
        </Alert>
      )}
      {current && hasChip && (
        <Typography variant="body2" color="text.secondary">
          {t('Situation actuelle, toutes périodes confondues.')}
        </Typography>
      )}
      {content}
    </Box>
  );
}

function ActivityView({ qs }: { qs: string }) {
  const activity = useDashboardActivity(qs);
  const items = activity.data?.pages.flatMap((p) => p.items) ?? [];
  if (activity.isPending) return <DashboardSkeleton label={t('Chargement de l’activité')} shape="timeline" />;
  if (activity.error) return <ErrorState message={loadErrorMessage(activity.error, t('l’activité'))} actionLabel={t('Réessayer')} onAction={() => void activity.refetch()} />;
  if (items.length === 0) {
    return (
      <Paper variant="elevated">
        <EmptyState icon={SearchX} title={t('Aucune activité')} description={t('Aucune action sur cette période.')} />
      </Paper>
    );
  }
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Paper variant="elevated" sx={{ px: { xs: 2, md: 2.5 }, py: { xs: 2, md: 2.5 } }}>
        <ActivityFeed items={items} />
      </Paper>
      {activity.hasNextPage && (
        <Box sx={{ textAlign: 'center' }}>
          <Button variant="outlined" loading={activity.isFetchingNextPage} onClick={() => void activity.fetchNextPage()}>
            {t('Afficher plus d’actions')}
          </Button>
        </Box>
      )}
    </Box>
  );
}

/** Tableau de bord de supervision des demandes de travail (super administrateur). */
export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  // Filtres et chiffre ouvert dans l'adresse : une liste filtrée se garde et se partage.
  const filters = filtersFromParams(params);
  const indicator = indicatorFromParams(params);
  // Onglet par défaut (accueil du super administrateur après connexion) : « Vue générale ».
  const view: ViewKey = VIEWS.find((v) => v.key === params.get('vue'))?.key ?? 'general';
  const customIncomplete = filters.preset === 'custom' && (!filters.from || !filters.to);
  const qs = toDashboardQuery(filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Période personnalisée : ses dates sont dans le panneau, qui s'ouvre alors de lui-même.
  const showFilters = filtersOpen || filters.preset === 'custom';
  const activeCount = activeFilterCount(filters);
  const change = (patch: Partial<DashboardFilters>) => setParams(withFilters(params, { ...filters, ...patch }), { replace: true });

  return (
    <Box>
      {/* En-tête allégé : période visible, autres filtres derrière « Filtres », export. */}
      <PageHeader
        title={t('Tableau de bord')}
        description={periodLabel(filters) ?? undefined}
        breadcrumb={false}
        actions={
          <>
            <PeriodSelect value={filters} onChange={change} />
            <Button
              variant="outlined"
              aria-expanded={showFilters}
              aria-controls="tdb-filtres"
              startIcon={<SlidersHorizontal size={icon.sm} aria-hidden="true" />}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              {activeCount > 0 ? t('Filtres ({count})', { count: activeCount }) : t('Filtres')}
            </Button>
            <Button
              variant="outlined"
              component="a"
              href={`/api/admin/dashboard/export.csv?${qs}`}
              download
              disabled={customIncomplete}
              startIcon={<Download size={icon.sm} aria-hidden="true" />}
            >
              {t('Exporter en CSV')}
            </Button>
          </>
        }
      />
      {showFilters && <FiltersPanel value={filters} onChange={change} />}

      <Box sx={{ mb: 3 }}>
        <Tabs
          value={view}
          onChange={(_, key: ViewKey) => {
            // Un onglet choisi à la main montre sa liste habituelle, pas celle d'un chiffre.
            const next = withoutIndicator(params);
            next.set('vue', key);
            setParams(next, { replace: true });
          }}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label={t('Vues du tableau de bord')}
          sx={segmentedTabs}
        >
          {VIEWS.map((v) => (
            <Tab key={v.key} value={v.key} label={v.label} id={`tdb-onglet-${v.key}`} aria-controls="tdb-contenu" />
          ))}
        </Tabs>
      </Box>

      <Box id="tdb-contenu" role="tabpanel" aria-labelledby={`tdb-onglet-${view}`}>
        {customIncomplete ? (
          <Paper variant="elevated">
            <EmptyState icon={CalendarRange} title={t('Période incomplète')} description={t('Choisissez une date de début et une date de fin.')} />
          </Paper>
        ) : view === 'general' ? (
          <GeneralView qs={qs} linkTo={(i) => indicatorLink(params, i)} priorityTo={(p) => priorityLink(params, p)} />
        ) : view === 'delais' ? (
          <DelaysView qs={qs} />
        ) : view === 'employes' ? (
          <EmployeesView qs={qs} />
        ) : view === 'demandes' ? (
          <RequestsView qs={qs} indicator={indicator} onSelect={(i) => setParams(i ? new URLSearchParams(indicatorLink(params, i)) : withoutIndicator(params), { replace: true })} />
        ) : (
          <ActivityView qs={qs} />
        )}
      </Box>
    </Box>
  );
}
