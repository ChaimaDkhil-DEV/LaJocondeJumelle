import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { ChevronDown, Hourglass, Info, MessageSquare, Play, SearchX, Timer, type LucideIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { loadErrorMessage } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PriorityBadge } from '../../components/PriorityBadge';
import { SectionCard } from '../../components/SectionCard';
import { font, fontSize, icon, tokensOf } from '../../design/tokens';
import { DashboardSkeleton } from './DashboardSkeleton';
import { formatDurationMs, useDashboardPerformance, type Compliance, type DashboardPerformance, type DurationStats } from './dashboardApi';
import { COMPLIANCE_TARGET, LOW_SAMPLE_THRESHOLD, percent } from './delayThresholds';
import { ComplianceBar, ComplianceGauge, ComplianceIcon, ComplianceStatus, MetricHelp, NoData, SampleSizeBadge } from './DelayMetrics';
import { KpiCard } from './KpiCard';

/**
 * Définitions des indicateurs, reprises des règles de calcul du serveur
 * (backend/src/dashboard/domain/dashboard-metrics.ts) : infobulles et bloc d'aide.
 */
const DEFINITIONS = {
  firstReply:
    'De la soumission au premier message, texte ou vocal, d’une autre personne que le demandeur (messages système exclus). Distincte de la prise en charge.',
  takeover: 'Du premier passage à « Envoyée » à la première acceptation.',
  resolution:
    'Du premier « Envoyée » au dernier « Terminée », en ne comptant que le temps passé « Envoyée », « Acceptée » et « En cours ».',
  grossResolution: 'Même intervalle que le traitement net, suspensions (« À corriger », attentes de validation) comprises.',
  compliance: `Part des demandes terminées, avec au moins une étape soumise à délai, qui n’ont jamais été en retard. Objectif : ${percent(COMPLIANCE_TARGET)}.`,
} as const;

/** Tableau défilant (mobile) : atteignable au clavier et nommé pour les lecteurs d'écran. */
const scrollRegion = (label: string) => ({ tabIndex: 0, role: 'region', 'aria-label': label }) as const;

/** Respect des délais, indicateur clé : anneau, taux, niveau écrit et fraction. */
function ComplianceHero({ compliance: c }: { compliance: Compliance }) {
  return (
    <Paper
      variant="elevated"
      sx={{
        p: { xs: 2, sm: 2.5 },
        minWidth: 0,
        display: 'grid',
        gap: 1.5,
        alignContent: 'start',
        // Tablette : pleine largeur au-dessus des 4 cartes ; grand écran : colonne de gauche, sur 2 rangées.
        gridColumn: { sm: '1 / -1', md: 'auto' },
        gridRow: { md: 'span 2' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ fontSize: fontSize.sm, fontWeight: font.semibold, lineHeight: 1.35 }}>Respect des délais</Box>
        <MetricHelp label="Respect des délais" text={DEFINITIONS.compliance} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
        <ComplianceGauge rate={c.rate} size={104} />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="p"
            sx={{
              fontSize: c.rate === null ? fontSize.md : fontSize.xxl + 4,
              fontWeight: c.rate === null ? font.regular : font.semibold,
              color: c.rate === null ? 'text.secondary' : 'text.primary',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {c.rate === null ? 'Aucune donnée' : percent(c.rate)}
          </Typography>
        </Box>
      </Box>
      <ComplianceStatus rate={c.rate} />
      <Typography variant="caption" color="text.secondary">
        {c.evaluated === 0
          ? 'Aucune demande terminée avec délai sur la période.'
          : `${c.onTime} sur ${c.evaluated} demande${c.evaluated > 1 ? 's' : ''} terminée${c.evaluated > 1 ? 's' : ''} sans retard`}
      </Typography>
      <Box>
        <SampleSizeBadge count={c.evaluated} />
      </Box>
    </Paper>
  );
}

function DurationCard({ label, stats, hint, help, icon: Icon }: { label: string; stats: DurationStats; hint: string; help: string; icon: LucideIcon }) {
  const none = stats.count === 0;
  return (
    <KpiCard
      label={label}
      value={none ? 'Aucune donnée' : formatDurationMs(stats.avgMs)}
      muted={none}
      icon={Icon}
      tone="neutral"
      hint={hint}
      singleLineHint
      labelExtra={<MetricHelp label={label} text={help} />}
      meta={<SampleSizeBadge count={stats.count} />}
    />
  );
}

/** Durée moyenne d'une cellule : valeur en texte principal, « n » en petit gris dessous. */
function DurationCell({ stats }: { stats: DurationStats }) {
  if (stats.count === 0) return <NoData />;
  return (
    <>
      <Box component="span" sx={{ display: 'block', fontWeight: font.medium, color: 'text.primary' }}>
        {formatDurationMs(stats.avgMs)}
      </Box>
      <Box component="span" sx={(theme) => ({ display: 'block', fontSize: fontSize.xs, color: tokensOf(theme).textSecondary })}>
        n = {stats.count}
      </Box>
    </>
  );
}

function ComplianceCell({ compliance: c }: { compliance: Compliance }) {
  if (c.evaluated === 0 || c.rate === null) return <NoData reason="Aucune demande terminée avec délai sur la période." />;
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
      <ComplianceBar rate={c.rate} />
      <ComplianceIcon rate={c.rate} />
      <Box component="span" sx={{ fontWeight: font.medium, minWidth: 40, textAlign: 'right', color: 'text.primary' }}>
        {percent(c.rate)}
      </Box>
      <Box component="span" sx={(theme) => ({ fontSize: fontSize.xs, color: tokensOf(theme).textSecondary, minWidth: 36, textAlign: 'left' })}>
        ({c.onTime}/{c.evaluated})
      </Box>
    </Box>
  );
}

const NUMERIC_COLUMNS = ['Demandes', 'Validation', 'Première réponse', 'Prise en charge', 'Traitement net', 'Respect des délais'] as const;

/**
 * Délais par priorité : colonnes chiffrées alignées à droite (en-têtes compris), chiffres
 * tabulaires, « n » sous la valeur, « Aucune donnée » distinct de zéro, ligne sans demande
 * atténuée. Première colonne figée lors du défilement horizontal (mobile), en-tête collant.
 */
function DelaysByPriorityTable({ rows }: { rows: DashboardPerformance['byPriority'] }) {
  return (
    // position: relative : les textes masqués (position absolue) des cellules restent dans la zone
    // défilante au lieu d'élargir la page sur mobile.
    <TableContainer sx={{ position: 'relative', maxHeight: { md: 560 } }} {...scrollRegion('Délais par priorité')}>
      <Table
        size="small"
        stickyHeader
        aria-label="Délais par priorité"
        sx={(theme) => {
          const t = tokensOf(theme);
          return {
            minWidth: 820,
            '& th': { bgcolor: t.surface, color: t.textSecondary, fontWeight: font.medium, borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap' },
            '& td': { borderBottom: `1px solid ${t.border}`, py: 1.25, fontVariantNumeric: 'tabular-nums', bgcolor: t.surface },
            '& tbody tr:last-of-type td': { borderBottom: 0 },
            '& tbody tr:hover td': { bgcolor: t.surfaceMuted },
            // Première colonne figée : la priorité reste visible pendant le défilement.
            '& th:first-of-type, & td:first-of-type': { position: 'sticky', left: 0, zIndex: 1, pl: { xs: 2, sm: 3 } },
            '& thead th:first-of-type': { zIndex: 3 },
            '& th:last-of-type, & td:last-of-type': { pr: { xs: 2, sm: 3 } },
          };
        }}
      >
        <colgroup>
          <col style={{ width: 136 }} />
        </colgroup>
        <TableHead>
          <TableRow>
            <TableCell>Priorité</TableCell>
            {NUMERIC_COLUMNS.map((name) => (
              <TableCell key={name} align="right">
                {name}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((p) => {
            const empty = p.total === 0;
            return (
              <TableRow key={p.priority} hover>
                <TableCell>
                  <PriorityBadge priority={p.priority} />
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: font.medium, color: empty ? 'text.secondary' : 'text.primary' }}>
                  {p.total}
                </TableCell>
                <TableCell align="right">
                  <DurationCell stats={p.validation} />
                </TableCell>
                <TableCell align="right">
                  <DurationCell stats={p.firstReply} />
                </TableCell>
                <TableCell align="right">
                  <DurationCell stats={p.takeover} />
                </TableCell>
                <TableCell align="right">
                  <DurationCell stats={p.resolution} />
                </TableCell>
                <TableCell align="right">
                  <ComplianceCell compliance={p.compliance} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** « Comment sont calculés ces indicateurs ? » : définitions en liste courte, repliée par défaut. */
function DelaysHelp() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const items: Array<[string, string]> = [
    ['Moyennes', `Seules les demandes mesurables comptent ; leur nombre est indiqué (n). Sous ${LOW_SAMPLE_THRESHOLD} mesures, l’échantillon est signalé faible.`],
    ['Première réponse', DEFINITIONS.firstReply],
    ['Prise en charge', `${DEFINITIONS.takeover} À ne pas confondre avec la première réponse.`],
    ['Validation', 'De l’entrée en « À valider » au statut suivant (catégories à validation administrative).'],
    ['Traitement net', `${DEFINITIONS.resolution} Les périodes « À corriger » et d’attente de validation sont exclues.`],
    ['Traitement brut', DEFINITIONS.grossResolution],
    ['Respect des délais', `${DEFINITIONS.compliance} Une demande encore en cours n’entre pas dans le taux.`],
  ];
  return (
    <Paper variant="elevated" sx={{ px: { xs: 2, sm: 3 }, py: 0.5 }}>
      <Button
        fullWidth
        color="inherit"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        startIcon={<Info size={icon.sm} aria-hidden="true" />}
        endIcon={<ChevronDown size={icon.sm} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} />}
        sx={{ justifyContent: 'flex-start', textAlign: 'left', minHeight: 44, px: 0, fontWeight: font.medium, '& .MuiButton-endIcon': { ml: 'auto', pl: 1 } }}
      >
        Comment sont calculés ces indicateurs ?
      </Button>
      <Collapse in={open} id={id}>
        <Box component="dl" sx={{ m: 0, pb: 2, display: 'grid', gap: 1.25 }}>
          {items.map(([term, text]) => (
            <div key={term}>
              <Box component="dt" sx={{ fontSize: fontSize.sm, fontWeight: font.semibold }}>
                {term}
              </Box>
              <Box component="dd" sx={(theme) => ({ m: 0, fontSize: fontSize.sm, color: tokensOf(theme).textSecondary })}>
                {text}
              </Box>
            </div>
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
}

/** Rien de mesurable sur la période : ni durée, ni demande évaluée, ni demande par priorité. */
function isEmpty(perf: DashboardPerformance): boolean {
  const o = perf.overall;
  return (
    [o.validation, o.firstReply, o.takeover, o.resolution, o.grossResolution].every((d) => d.count === 0) &&
    o.compliance.evaluated === 0 &&
    perf.byPriority.every((p) => p.total === 0)
  );
}

/** Onglet « Délais » du tableau de bord : respect des délais en tête, durées moyennes, détail par priorité. */
export function DelaysView({ qs }: { qs: string }) {
  const perf = useDashboardPerformance(qs);
  if (perf.isPending) return <DashboardSkeleton label="Chargement des délais" shape="performance" />;
  if (perf.error) return <ErrorState message={loadErrorMessage(perf.error, 'les délais')} actionLabel="Réessayer" onAction={() => void perf.refetch()} />;
  if (isEmpty(perf.data)) {
    return (
      <Paper variant="elevated">
        <EmptyState
          icon={SearchX}
          title="Aucun délai à mesurer"
          description="Aucune demande prise en charge ni terminée sur cette période et avec ces filtres. Élargissez la période pour voir les délais."
        />
      </Paper>
    );
  }
  const o = perf.data.overall;
  // Colonne en minmax(0, 1fr) : le tableau large défile dans son conteneur, jamais la page.
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 3 }}>
      {/* Respect des délais en tête : carte principale à gauche (2 rangées) et 4 cartes en 2 × 2 sur
        grand écran ; pleine largeur puis 2 colonnes en tablette ; 1 colonne en mobile. */}
      <Box
        sx={{
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', md: 'minmax(0, 1.15fr) repeat(2, minmax(0, 1fr))' },
        }}
      >
        <ComplianceHero compliance={o.compliance} />
        <DurationCard label="Première réponse moyenne" stats={o.firstReply} hint="Soumission → premier message" help={DEFINITIONS.firstReply} icon={MessageSquare} />
        <DurationCard label="Prise en charge moyenne" stats={o.takeover} hint="Envoi → acceptation" help={DEFINITIONS.takeover} icon={Timer} />
        <DurationCard label="Traitement net moyen" stats={o.resolution} hint="Hors suspensions" help={DEFINITIONS.resolution} icon={Play} />
        <DurationCard label="Traitement brut moyen" stats={o.grossResolution} hint="Suspensions comprises" help={DEFINITIONS.grossResolution} icon={Hourglass} />
      </Box>

      <SectionCard
        elevated
        flush
        title="Par priorité"
        description={
          <>
            Délais attendus : règles de chaque catégorie (
            <Link component={RouterLink} to="/admin/categories">
              Administration › Catégories
            </Link>
            ).
          </>
        }
      >
        <DelaysByPriorityTable rows={perf.data.byPriority} />
      </SectionCard>

      <DelaysHelp />
    </Box>
  );
}
