import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import { useTheme, type Theme } from '@mui/material/styles';
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
import {
  AlarmClock,
  Ban,
  CalendarRange,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Download,
  Hourglass,
  Inbox,
  Play,
  RefreshCw,
  SearchX,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { loadErrorMessage } from '../../api/client';
import type { Priority } from '../../api/types';
import { STAGE_LABELS } from '../../components/Countdown';
import { visuallyHidden } from '../../components/a11y';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime, formatLateness, formatRelative } from '../../components/format';
import { PageHeader } from '../../components/PageHeader';
import { PRIORITY_LABELS, PriorityLabel } from '../../components/PriorityBadge';
import { SectionCard } from '../../components/SectionCard';
import { STATUS_LABELS } from '../../components/StatusBadge';
import { Person } from '../../components/UserAvatar';
import { cardShadow, font, fontSize, icon, radius, tokensOf, type AccentName } from '../../design/tokens';
import { useRequestList } from '../requests/api';
import type { RequestSummary } from '../requests/types';
import { describeEvent, EVENT_ICONS } from '../requests/HistoryTimeline';
import { useAdminCategories, useAdminUsers } from './api';
import { DailyChart, Sparkline, StatusDonut } from './DashboardCharts';
import { DashboardSkeleton } from './DashboardSkeleton';
import { DelaysView } from './DelaysView';
import { KpiCard } from './KpiCard';
import {
  DEFAULT_FILTERS,
  formatDurationMs,
  periodOf,
  toDashboardQuery,
  toRequestListFilters,
  useDashboardActivity,
  useDashboardEmployees,
  useDashboardSummary,
  type ActivityItem,
  type DashboardAlert,
  type DashboardFilters,
  type DashboardSummary,
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

/**
 * Longs tableaux : hauteur bornée à partir de md pour que l'en-tête collant reste visible ; sur
 * mobile, la page défile normalement (pas de zone défilante imbriquée).
 */
const stickyArea = { maxHeight: { md: 560 } } as const;

const SUBJECT = 'le tableau de bord';

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

const kpiGrid ={ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } } as const;

/** Période : toujours visible dans l'en-tête (libellé masqué visuellement, nom accessible « Période »). */
function PeriodSelect({ value, onChange }: { value: DashboardFilters; onChange: (patch: Partial<DashboardFilters>) => void }) {
  return (
    <TextField
      select
      id="tdb-periode"
      label="Période"
      size="small"
      fullWidth={false}
      value={value.preset}
      onChange={(e) => onChange({ preset: e.target.value as DashboardFilters['preset'] })}
      slotProps={{ inputLabel: { sx: visuallyHidden } }}
      sx={{ minWidth: 176 }}
    >
      <MenuItem value="7">7 derniers jours</MenuItem>
      <MenuItem value="30">30 derniers jours</MenuItem>
      <MenuItem value="90">90 derniers jours</MenuItem>
      <MenuItem value="custom">Personnalisée</MenuItem>
    </TextField>
  );
}

const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

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
      aria-label="Filtres du tableau de bord"
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
          <TextField id="tdb-du" label="Du" type="date" size="small" sx={wide} value={value.from} onChange={(e) => onChange({ from: e.target.value })} />
          <TextField id="tdb-au" label="Au" type="date" size="small" sx={{ ...wide, gridColumn: { xs: '1 / -1', sm: 'auto', md: 'span 2' } }} value={value.to} onChange={(e) => onChange({ to: e.target.value })} />
        </>
      )}
      <TextField select id="tdb-categorie" label="Catégorie (service)" size="small" sx={wide} value={value.categoryId} onChange={(e) => onChange({ categoryId: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
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
    </Paper>
  );
}

/** Accent décoratif de chaque état (les états clos restent neutres). */
const GROUP_ACCENTS: Partial<Record<StatusGroup, AccentName>> = {
  pendingValidation: 'cyan',
  pendingTakeover: 'orange',
  inProgress: 'indigo',
  done: 'green',
};

function GeneralView({ qs }: { qs: string }) {
  const theme = useTheme();
  const t = tokensOf(theme);
  const summary = useDashboardSummary(qs);
  if (summary.isPending) return <DashboardSkeleton label="Chargement des indicateurs" shape="general" />;
  if (summary.error) return <ErrorState message={loadErrorMessage(summary.error, SUBJECT)} actionLabel="Réessayer" onAction={() => void summary.refetch()} />;
  const s = summary.data;
  const groups = Object.keys(GROUP_LABELS) as StatusGroup[];
  const empty = s.counts.total === 0 && s.daily.every((d) => d.completed === 0);

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      {/* Rangée d'indicateurs : tuile colorée, valeur et mini-graphique de la période. */}
      <Box component="section" aria-labelledby="tdb-periode-titre" sx={{ display: 'grid', gap: 1.5 }}>
        <Typography id="tdb-periode-titre" component="h2" variant="h6">
          Demandes créées sur la période
        </Typography>
        <Box sx={kpiGrid}>
          <KpiCard
            label="Total"
            value={s.counts.total}
            icon={Inbox}
            accent="indigo"
            hint="Hors brouillons"
            trend={<Sparkline values={s.daily.map((d) => d.created)} color={t.accents.indigo.main} />}
          />
          {groups.map((g) => (
            <KpiCard
              key={g}
              label={GROUP_LABELS[g]}
              value={s.counts[g]}
              icon={GROUP_ICONS[g]}
              accent={GROUP_ACCENTS[g]}
              tone="neutral"
              hint={GROUP_HINTS[g]}
              trend={g === 'done' ? <Sparkline kind="bars" values={s.daily.map((d) => d.completed)} color={t.accents.green.main} /> : undefined}
            />
          ))}
          <KpiCard
            label="Hors délai"
            value={s.counts.overdueInPeriod}
            tone={s.counts.overdueInPeriod > 0 ? 'error' : 'neutral'}
            accent={s.counts.overdueInPeriod > 0 ? undefined : 'orange'}
            icon={AlarmClock}
            hint="Au moins une étape en retard"
            trend={s.byCategory.length > 1 ? <Sparkline kind="bars" values={s.byCategory.map((c) => c.overdue)} color={t.accents.orange.main} /> : undefined}
          />
        </Box>
      </Box>

      {empty ? (
        <Paper variant="elevated">
          <EmptyState icon={SearchX} title="Aucune demande" description="Aucune demande ne correspond à cette période et à ces filtres." />
        </Paper>
      ) : (
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) minmax(0, 1fr)' } }}>
          <SectionCard
            elevated
            title="Évolution quotidienne"
            description="Créées : jour de création. Terminées : jour de la première fin de traitement, même pour une demande créée avant la période."
          >
            <DailyChart data={s.daily} />
          </SectionCard>
          <SectionCard elevated title="Répartition par état">
            <StatusDonut data={groups.map((g) => ({ label: GROUP_LABELS[g], count: s.counts[g] }))} />
          </SectionCard>
        </Box>
      )}

      <SectionCard elevated title="À traiter maintenant" description="Situation actuelle, toutes périodes confondues (les autres filtres s’appliquent)." contentGap={3}>
        <Figures
          label="Situation actuelle"
          items={[
            { label: 'En retard', value: s.current.overdueNow, hint: 'Échéance de l’étape en cours dépassée', alert: 'error' },
            { label: 'Urgentes en cours', value: s.current.urgentActive, hint: 'Priorité urgente, non terminées', alert: 'warning' },
            { label: 'Sans employé affecté', value: s.current.unassigned, hint: 'Envoyées ou en cours sans employé affecté' },
          ]}
        />
        {s.alerts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Aucune alerte : aucune demande en retard ni urgente en cours.
          </Typography>
        ) : (
          <AlertTable alerts={s.alerts} />
        )}
      </SectionCard>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) minmax(0, 1fr)' } }}>
        <SectionCard elevated title="Par catégorie (service)" flush>
          {s.byCategory.length === 0 ? (
            <EmptyState compact title="Aucune donnée" description="Aucune demande sur la période." />
          ) : (
            <Box
              component="ul"
              aria-label="Demandes par catégorie"
              sx={(theme) => ({ listStyle: 'none', m: 0, p: 0, pb: 1, '& > li + li': { borderTop: `1px solid ${tokensOf(theme).border}` } })}
            >
              {s.byCategory.map((c) => (
                <CategoryRow key={c.category.id} row={c} />
              ))}
            </Box>
          )}
        </SectionCard>
        <SectionCard elevated title="Échanges" description="Messages sur les demandes de la période (nombre seulement, jamais le contenu).">
          <Figures
            label="Échanges"
            items={[
              { label: 'Écrits', value: s.messages.text },
              { label: 'Vocaux', value: s.messages.voice },
            ]}
            stackOnMobile={false}
          />
        </SectionCard>
      </Box>
    </Box>
  );
}

/** Libellé gris avec infobulle (survol et focus clavier) : la description n'encombre plus la carte. */
function HintLabel({ label, hint }: { label: string; hint?: string }) {
  if (!hint) return <>{label}</>;
  return (
    <Tooltip title={hint} describeChild placement="bottom-start">
      <Box
        component="span"
        tabIndex={0}
        sx={(theme) => ({
          cursor: 'help',
          textDecoration: 'underline dotted',
          textUnderlineOffset: '3px',
          textDecorationColor: tokensOf(theme).borderStrong,
          borderRadius: '2px',
        })}
      >
        {label}
      </Box>
    </Tooltip>
  );
}

interface Figure {
  label: string;
  value: number;
  hint?: string;
  /** Couleur du chiffre quand il dépasse 0 : rouge (retard) ou ambre (urgence) ; absent : neutre. */
  alert?: 'error' | 'warning';
}

/**
 * Chiffres clés sans cadre : grand chiffre, libellé gris dessous. Seul le chiffre prend de la
 * couleur, et seulement s'il signale un problème (> 0) ; le libellé reste écrit. Liste de
 * définitions : le libellé (dt) est lu avant la valeur (dd), même affichée au-dessus.
 */
function Figures({ items, label, stackOnMobile = true }: { items: Figure[]; label: string; stackOnMobile?: boolean }) {
  return (
    <Box
      component="dl"
      aria-label={label}
      sx={(theme) => {
        const t = tokensOf(theme);
        return {
          m: 0,
          display: 'grid',
          gridTemplateColumns: stackOnMobile ? { xs: '1fr', sm: `repeat(${items.length}, minmax(0, 1fr))` } : `repeat(${items.length}, minmax(0, 1fr))`,
          '& > div': { minWidth: 0, display: 'flex', flexDirection: 'column-reverse', justifyContent: 'flex-end', gap: 0.5 },
          // Filets fins entre les chiffres : verticaux en ligne, horizontaux une fois empilés.
          '& > div + div': stackOnMobile
            ? { [theme.breakpoints.down('sm')]: { borderTop: `1px solid ${t.border}`, pt: 1.5, mt: 1.5 }, [theme.breakpoints.up('sm')]: { borderLeft: `1px solid ${t.border}`, pl: 3 } }
            : { borderLeft: `1px solid ${t.border}`, pl: 3 },
        };
      }}
    >
      {items.map((f) => (
        <div key={f.label}>
          <Box component="dt" sx={(theme) => ({ fontSize: fontSize.sm, color: tokensOf(theme).textSecondary })}>
            <HintLabel label={f.label} hint={f.hint} />
          </Box>
          <Box
            component="dd"
            sx={(theme) => {
              const t = tokensOf(theme);
              return {
                m: 0,
                fontSize: fontSize.xxl,
                fontWeight: font.semibold,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                // Teinte franche (rouge, orange) : contraste ≥ 4,5:1 sur blanc, chiffre en grand corps.
                color: f.alert && f.value > 0 ? t[f.alert].main : t.text,
              };
            }}
          >
            {f.value}
          </Box>
        </div>
      ))}
    </Box>
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
    const detail = `En retard (${STAGE_LABELS[a.overdueStage]})${dueAt ? `, échéance le ${formatDateTime(dueAt)}` : ''}`;
    return (
      <Tooltip title={detail} describeChild placement="bottom-start">
        <Box component="span" tabIndex={0} sx={(theme) => ({ color: tokensOf(theme).error.text, fontWeight: font.medium, borderRadius: '2px' })}>
          {lateness ?? 'En retard'}
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
    <TableContainer sx={stickyArea} {...scrollRegion('Demandes à traiter en priorité')}>
      <Table
        size="small"
        stickyHeader
        aria-label="Demandes à traiter en priorité"
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
            <TableCell>Demande</TableCell>
            <TableCell>Priorité</TableCell>
            <TableCell>Échéance</TableCell>
            <TableCell>Affectée à</TableCell>
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
                    Personne
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
    `${c.total} au total`,
    c.active > 0 && `${c.active} à traiter`,
    c.done > 0 && `${c.done} ${c.done > 1 ? 'terminées' : 'terminée'}`,
    c.overdue > 0 && `${c.overdue} hors délai`,
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
                hors délai sur
              </Box>
              <span aria-hidden="true"> / </span>
              {c.total}
            </>
          ) : (
            <>
              {c.total}
              <Box component="span" sx={visuallyHidden}>
                {' '}
                au total
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Tooltip>
  );
}

function EmployeesView({ qs }: { qs: string }) {
  const employees = useDashboardEmployees(qs);
  if (employees.isPending) return <DashboardSkeleton label="Chargement des employés" shape="table" />;
  if (employees.error) return <ErrorState message={loadErrorMessage(employees.error, 'l’activité des employés')} actionLabel="Réessayer" onAction={() => void employees.refetch()} />;
  const items = employees.data.items;
  if (items.length === 0) {
    return (
      <Paper variant="elevated">
        <EmptyState icon={SearchX} title="Aucune activité" description="Aucun compte actif et aucune demande sur cette période." />
      </Paper>
    );
  }
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <TableContainer component={Paper} variant="elevated" sx={stickyArea} {...scrollRegion('Activité des employés')}>
        <Table size="small" stickyHeader aria-label="Activité des employés">
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
                <TableCell align="right">
                  {e.overdueNow > 0 ? (
                    <Badge tone="error" icon={AlarmClock}>
                      {e.overdueNow}
                    </Badge>
                  ) : (
                    0
                  )}
                </TableCell>
                <TableCell align="right">{formatDurationMs(e.takeover.avgMs)}</TableCell>
                <TableCell align="right">{formatDurationMs(e.resolution.avgMs)}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{e.lastActionAt ? formatRelative(e.lastActionAt) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="body2" color="text.secondary">
        « Reçues » : demandes de la période actuellement affectées à l’employé. Les comptes actifs sans demande sur la période (destinataires de la
        catégorie si elle est filtrée) figurent à zéro. « Dernière action » : dernière action enregistrée sur une demande ; elle
        n’indique ni la présence ni la disponibilité de la personne.
      </Typography>
    </Box>
  );
}

/** « D-2026-000004 » → « #004 » : numéro court de la liste (le numéro complet est au survol). */
function shortNumber(reference: string): string {
  const digits = /(\d+)$/.exec(reference)?.[1];
  return digits ? `#${String(Number(digits)).padStart(3, '0')}` : reference;
}

/** Date et heure sans l'année (« 13 oct., 14:12 ») : la liste couvre une période récente. */
const shortDateTime = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Une seule couleur d'alerte : rouge pour l'urgence (et le retard), ambre pour « Haute », gris sinon. */
function priorityColor(theme: Theme, priority: Priority): string {
  const t = tokensOf(theme);
  return priority === 'URGENT' ? t.error.text : priority === 'HIGH' ? t.warning.text : t.textSecondary;
}

/** Détails au survol (ou au focus) d'une ligne : numéro complet, statut entier, catégorie, échéance. */
function RequestRowDetails({ r }: { r: RequestSummary }) {
  const due = r.overdueStage
    ? `dépassée (${STAGE_LABELS[r.overdueStage]})`
    : r.currentDueAt
      ? formatDateTime(r.currentDueAt)
      : 'aucune';
  return (
    <Box sx={{ display: 'grid', gap: 0.25 }}>
      <span>{r.reference}</span>
      <span>Statut : {STATUS_LABELS[r.status]}</span>
      <span>Catégorie : {r.category.name}</span>
      <span>Échéance : {due}</span>
      <span>Historique complet : ouvrir la demande</span>
    </Box>
  );
}

function RequestsView({ filters }: { filters: string }) {
  const list = useRequestList('all', [], filters);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  if (list.isPending) return <DashboardSkeleton label="Chargement des demandes" shape="table" />;
  if (list.error) return <ErrorState message={loadErrorMessage(list.error, 'les demandes')} actionLabel="Réessayer" onAction={() => void list.refetch()} />;
  if (items.length === 0) {
    return (
      <Paper variant="elevated">
        <EmptyState icon={SearchX} title="Aucune demande" description="Aucune demande ne correspond à ces filtres." />
      </Paper>
    );
  }
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <TableContainer component={Paper} variant="elevated" sx={stickyArea} {...scrollRegion('Demandes de la période')}>
        {/* Version allégée : 5 colonnes, lignes de hauteur fixe, texte simple (sans pilule). */}
        <Table
          size="small"
          stickyHeader
          aria-label="Demandes de la période"
          sx={(theme) => ({
            tableLayout: 'fixed',
            minWidth: 760,
            '& th': { bgcolor: tokensOf(theme).surface, color: tokensOf(theme).textSecondary, fontWeight: font.medium },
            '& td, & th': { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
            '& tbody td': { height: 48, py: 0 },
          })}
        >
          <colgroup>
            <col />
            <col style={{ width: 104 }} />
            <col style={{ width: 144 }} />
            <col style={{ width: 232 }} />
            <col style={{ width: 132 }} />
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell>Demande</TableCell>
              <TableCell>Priorité</TableCell>
              <TableCell>Statut</TableCell>
              <TableCell>
                Demandeur{' '}
                <span aria-hidden="true">→</span>
                <Box component="span" sx={visuallyHidden}>
                  et
                </Box>{' '}
                Affecté
              </TableCell>
              <TableCell>Créée</TableCell>
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
                        sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', color: 'text.primary', fontWeight: font.medium, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                      >
                        {r.title}
                      </Box>
                      <Box component="span" sx={{ flex: 'none', color: 'text.secondary', fontSize: fontSize.xs, fontVariantNumeric: 'tabular-nums' }}>
                        {shortNumber(r.reference)}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={(theme) => ({ color: priorityColor(theme, r.priority), fontWeight: r.priority === 'URGENT' || r.priority === 'HIGH' ? font.medium : font.regular })}>
                    {PRIORITY_LABELS[r.priority]}
                  </TableCell>
                  {/* « En retard » remplace le statut quand une étape a dépassé son échéance. */}
                  <TableCell sx={(theme) => (r.overdueStage ? { color: tokensOf(theme).error.text, fontWeight: font.medium } : { color: tokensOf(theme).textSecondary })}>
                    {r.overdueStage ? 'En retard' : STATUS_LABELS[r.status]}
                  </TableCell>
                  <TableCell>
                    {r.requester.displayName}
                    <span aria-hidden="true"> → </span>
                    <Box component="span" sx={visuallyHidden}>
                      , affectée à{' '}
                    </Box>
                    {r.assignee?.displayName ?? '—'}
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{shortDateTime.format(new Date(r.createdAt))}</TableCell>
                </TableRow>
              </Tooltip>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="body2" color="text.secondary">
        Survol d’une ligne : numéro complet, catégorie et échéance. Historique complet : ouvrir la demande.
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
  if (activity.isPending) return <DashboardSkeleton label="Chargement de l’activité" shape="timeline" />;
  if (activity.error) return <ErrorState message={loadErrorMessage(activity.error, 'l’activité')} actionLabel="Réessayer" onAction={() => void activity.refetch()} />;
  if (items.length === 0) {
    return (
      <Paper variant="elevated">
        <EmptyState icon={SearchX} title="Aucune activité" description="Aucune action sur cette période." />
      </Paper>
    );
  }
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Paper variant="elevated" sx={{ px: { xs: 2, md: 2.5 }, py: { xs: 2, md: 2.5 } }}>
        {/* Chronologie : pastille d'icône par type d'action, reliée à la suivante par un filet. */}
        <Box component="ul" aria-label="Dernières actions" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {items.map((item, index) => {
            const Icon = EVENT_ICONS[item.type] ?? RefreshCw;
            const late = item.type === 'OVERDUE';
            const last = index === items.length - 1;
            return (
              <Box
                component="li"
                key={item.id}
                sx={{ position: 'relative', display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', columnGap: 1.5, pb: last ? 0 : 2.5 }}
              >
                {!last && <Box aria-hidden="true" sx={{ position: 'absolute', left: 15.5, top: 36, bottom: 4, width: '1px', bgcolor: 'divider' }} />}
                <Box
                  aria-hidden="true"
                  sx={(theme) => {
                    const t = tokensOf(theme);
                    return {
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: `1px solid ${late ? t.error.border : t.accent.border}`,
                      bgcolor: late ? t.error.soft : t.accent.soft,
                      color: late ? t.error.main : t.accent.text,
                    };
                  }}
                >
                  <Icon size={icon.sm} strokeWidth={icon.stroke} />
                </Box>
                <Box sx={{ minWidth: 0, pt: 0.5, display: 'grid', gap: 0.25 }}>
                  <Typography variant="body2" sx={{ fontWeight: font.medium, overflowWrap: 'anywhere' }}>
                    {describeActivity(item)}
                  </Typography>
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                    <Box component={RouterLink} to={`/demandes/${item.request.id}`} sx={{ color: 'inherit' }}>
                      {item.request.reference} — {item.request.title}
                    </Box>
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.actor ? item.actor.displayName : 'Système'} · <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                  </Typography>
                </Box>
              </Box>
            );
          })}
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
  // Onglet par défaut (accueil du super administrateur après connexion) : « Vue générale ».
  const view: ViewKey = VIEWS.find((v) => v.key === params.get('vue'))?.key ?? 'general';
  const customIncomplete = filters.preset === 'custom' && (!filters.from || !filters.to);
  const qs = toDashboardQuery(filters);
  const listFilters = toRequestListFilters(filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Période personnalisée : ses dates sont dans le panneau, qui s'ouvre alors de lui-même.
  const showFilters = filtersOpen || filters.preset === 'custom';
  const activeCount = activeFilterCount(filters);
  const change = (patch: Partial<DashboardFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <Box>
      {/* En-tête allégé : période visible, autres filtres derrière « Filtres », export. */}
      <PageHeader
        title="Tableau de bord"
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
              {activeCount > 0 ? `Filtres (${activeCount})` : 'Filtres'}
            </Button>
            <Button
              variant="outlined"
              component="a"
              href={`/api/admin/dashboard/export.csv?${qs}`}
              download
              disabled={customIncomplete}
              startIcon={<Download size={icon.sm} aria-hidden="true" />}
            >
              Exporter en CSV
            </Button>
          </>
        }
      />
      {showFilters && <FiltersPanel value={filters} onChange={change} />}

      <Box sx={{ mb: 3 }}>
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
            <EmptyState icon={CalendarRange} title="Période incomplète" description="Choisissez une date de début et une date de fin." />
          </Paper>
        ) : view === 'general' ? (
          <GeneralView qs={qs} />
        ) : view === 'delais' ? (
          <DelaysView qs={qs} />
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
