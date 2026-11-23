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
import { ChevronDown, Info, SearchX } from 'lucide-react';
import { useId, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { loadErrorMessage } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Badge } from '../../components/Badge';
import { PRIORITY_LABELS, PRIORITY_STYLE } from '../../components/PriorityBadge';
import { SectionCard } from '../../components/SectionCard';
import { font, fontSize, icon, radius, tokensOf } from '../../design/tokens';
import { isPlural, t } from '../../i18n';
import { DashboardSkeleton } from './DashboardSkeleton';
import { formatDurationMs, useDashboardPerformance, type Compliance, type DashboardPerformance, type DurationStats } from './dashboardApi';
import { COMPLIANCE_TARGET, LOW_SAMPLE_THRESHOLD, percent } from './delayThresholds';
import { ComplianceBar, ComplianceGauge, ComplianceLevelBadge, LowSampleBadge, MetricHelp, NoData } from './DelayMetrics';

/**
 * Définitions des indicateurs, reprises des règles de calcul du serveur
 * (backend/src/dashboard/domain/dashboard-metrics.ts) : infobulles et bloc d'aide.
 */
const DEFINITIONS = {
  firstReply: t(
    'De la soumission au premier message, texte ou vocal, d’une autre personne que le demandeur (messages système exclus). Distincte de la prise en charge.',
  ),
  takeover: t('Du premier passage à « Envoyée » à la première acceptation.'),
  resolution: t(
    'Du premier « Envoyée » au dernier « Terminée », en ne comptant que le temps passé « Envoyée », « Acceptée » et « En cours ».',
  ),
  grossResolution: t('Même intervalle que le traitement net, suspensions (« À corriger », attentes de validation) comprises.'),
  compliance: t('Part des demandes terminées, avec au moins une étape soumise à délai, qui n’ont jamais été en retard. Objectif : {target}.', {
    target: percent(COMPLIANCE_TARGET),
  }),
} as const;

/** Tableau défilant (mobile) : atteignable au clavier et nommé pour les lecteurs d'écran. */
const scrollRegion = (label: string) => ({ tabIndex: 0, role: 'region', 'aria-label': label }) as const;

/** Petit libellé de carte : capitales discrètes, comme les titres des cartes de chiffres. */
const cardLabel = (theme: Parameters<typeof tokensOf>[0]) => ({
  fontSize: fontSize.xs,
  fontWeight: font.semibold,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: tokensOf(theme).textSecondary,
});

/** Caractère de remplacement du nombre en gras : la phrase reste une seule chaîne traduisible. */
const COUNT_MARK = '⁣';

/** « Moyenne sur 9 demandes », le nombre en gras. */
function BoldCount({ text, count }: { text: string; count: number }) {
  const [before, after = ''] = text.replace('{count}', COUNT_MARK).split(COUNT_MARK);
  return (
    <>
      {before}
      <Box component="strong" sx={{ fontWeight: font.semibold, color: 'text.primary' }}>
        {count}
      </Box>
      {after}
    </>
  );
}

const averageOver = (count: number) => t(isPlural(count) ? 'Moyenne sur {count} demandes' : 'Moyenne sur {count} demande');
const overRequests = (count: number) => t(isPlural(count) ? 'sur {count} demandes' : 'sur {count} demande', { count });

/** Respect des délais, indicateur clé : anneau avec son taux, niveau écrit avec la cible, et la fraction. */
function ComplianceHero({ compliance: c }: { compliance: Compliance }) {
  const size = 120;
  return (
    <Paper variant="elevated" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0, display: 'flex', alignItems: 'center', gap: { xs: 2, sm: 3 }, flexWrap: 'wrap' }}>
      <Box sx={{ position: 'relative', width: size, height: size, flex: 'none' }}>
        <ComplianceGauge rate={c.rate} size={size} />
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', px: 2 }}>
          <Typography
            component="p"
            sx={{
              fontSize: c.rate === null ? fontSize.sm : fontSize.xl,
              fontWeight: c.rate === null ? font.regular : font.semibold,
              color: c.rate === null ? 'text.secondary' : 'text.primary',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {c.rate === null ? t('Aucune donnée') : percent(c.rate)}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gap: 1, minWidth: 0, justifyItems: 'start' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={cardLabel}>{t('Respect des délais')}</Box>
          <MetricHelp label={t('Respect des délais')} text={DEFINITIONS.compliance} />
        </Box>
        <ComplianceLevelBadge rate={c.rate} />
        <Typography component="span" variant="body2" color="text.secondary">
          {c.evaluated === 0
            ? t('Aucune demande terminée avec délai sur la période.')
            : t(isPlural(c.evaluated) ? '{onTime} sur {evaluated} demandes terminées sans retard' : '{onTime} sur {evaluated} demande terminée sans retard', {
                onTime: c.onTime,
                evaluated: c.evaluated,
              })}
        </Typography>
        <LowSampleBadge count={c.evaluated} />
      </Box>
    </Paper>
  );
}

/** Respect des délais de chaque priorité : une barre pleine largeur, avec le taux et la fraction. */
function PriorityCompliance({ rows }: { rows: DashboardPerformance['byPriority'] }) {
  const titleId = useId();
  return (
    <Paper component="section" aria-labelledby={titleId} variant="elevated" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0, display: 'grid', gap: 2, alignContent: 'start' }}>
      <Box id={titleId} sx={cardLabel}>
        {t('Par priorité · respect des délais')}
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2 }}>
        {rows.map((p) => {
          const c = p.compliance;
          return (
            <Box component="li" key={p.priority} sx={{ display: 'grid', gap: 0.75 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                <Box component="span" sx={{ fontWeight: font.semibold }}>
                  {PRIORITY_LABELS[p.priority]}
                </Box>
                {c.rate === null ? (
                  <NoData reason={t('Aucune demande terminée avec délai sur la période.')} />
                ) : (
                  <Box component="span" sx={(theme) => ({ color: tokensOf(theme).textSecondary, fontVariantNumeric: 'tabular-nums' })}>
                    <Box component="strong" sx={{ fontWeight: font.semibold, color: 'text.primary' }}>
                      {percent(c.rate)}
                    </Box>
                    {' · '}
                    {c.onTime}/{c.evaluated}
                  </Box>
                )}
              </Box>
              {c.rate !== null && <ComplianceBar rate={c.rate} width="100%" height={8} />}
            </Box>
          );
        })}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {t('Seuil de l’objectif : {target}', { target: percent(COMPLIANCE_TARGET) })}
      </Typography>
    </Paper>
  );
}

interface Step {
  label: string;
  stats: DurationStats;
  hint: string;
  help: string;
}

/** Les quatre étapes du cycle de vie d'une demande, dans l'ordre : une durée moyenne et le nombre de demandes mesurées. */
function Lifecycle({ steps }: { steps: Step[] }) {
  const titleId = useId();
  return (
    <SectionCard
      elevated
      title={t('Cycle de vie d’une demande')}
      titleId={titleId}
      description={t('Durée moyenne à chaque étape, avec le nombre de demandes mesurées.')}
      contentGap={2}
    >
      <Box
        component="ol"
        aria-labelledby={titleId}
        sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' } }}
      >
        {steps.map((step, index) => {
          const none = step.stats.count === 0;
          return (
            <Box
              component="li"
              key={step.label}
              sx={(theme) => ({
                minWidth: 0,
                display: 'grid',
                gap: 1,
                alignContent: 'start',
                p: 2,
                border: `1px solid ${tokensOf(theme).border}`,
                borderRadius: `${radius.card - 4}px`,
              })}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Box sx={(theme) => ({ ...cardLabel(theme), color: tokensOf(theme).accent.text })}>{`${index + 1} · ${step.label}`}</Box>
                <MetricHelp label={step.label} text={step.help} />
              </Box>
              <Typography
                component="p"
                sx={{
                  fontSize: none ? fontSize.md : fontSize.xl,
                  fontWeight: none ? font.regular : font.semibold,
                  color: none ? 'text.secondary' : 'text.primary',
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {none ? t('Aucune donnée') : formatDurationMs(step.stats.avgMs)}
              </Typography>
              <Typography component="span" variant="body2" color="text.secondary">
                {step.hint}
              </Typography>
              <Box sx={(theme) => ({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, pt: 1, borderTop: `1px solid ${tokensOf(theme).border}`, fontSize: fontSize.sm, color: tokensOf(theme).textSecondary })}>
                <span>{none ? t('Aucune demande mesurée') : <BoldCount text={averageOver(step.stats.count)} count={step.stats.count} />}</span>
                <LowSampleBadge count={step.stats.count} />
              </Box>
            </Box>
          );
        })}
      </Box>
    </SectionCard>
  );
}

/** Durée moyenne d'une cellule : valeur en texte principal, « sur n demandes » en petit gris dessous. */
function DurationCell({ stats }: { stats: DurationStats }) {
  if (stats.count === 0) return <NoData />;
  return (
    <>
      <Box component="span" sx={{ display: 'block', fontWeight: font.semibold, color: 'text.primary' }}>
        {formatDurationMs(stats.avgMs)}
      </Box>
      <Box component="span" sx={(theme) => ({ display: 'block', fontSize: fontSize.xs, color: tokensOf(theme).textSecondary, whiteSpace: 'nowrap' })}>
        {overRequests(stats.count)}
      </Box>
    </>
  );
}

const COLUMNS = [t('Demandes'), t('Validation'), t('Première réponse'), t('Prise en charge'), t('Traitement net')] as const;

/**
 * Détail par priorité : colonnes alignées à gauche avec leurs en-têtes, chiffres tabulaires, « sur n demandes » sous
 * chaque durée, « Aucune donnée » distinct de zéro. Première colonne figée lors du défilement horizontal (mobile),
 * en-tête collant. Le respect des délais de chaque priorité est dans la carte « Par priorité · respect des délais ».
 */
function DelaysByPriorityTable({ rows }: { rows: DashboardPerformance['byPriority'] }) {
  return (
    // position: relative : les textes masqués (position absolue) des cellules restent dans la zone
    // défilante au lieu d'élargir la page sur mobile.
    <TableContainer sx={{ position: 'relative', maxHeight: { md: 560 } }} {...scrollRegion(t('Délais par priorité'))}>
      <Table
        size="small"
        stickyHeader
        aria-label={t('Délais par priorité')}
        sx={(theme) => {
          const t = tokensOf(theme);
          return {
            minWidth: 720,
            '& th': { bgcolor: t.surface, color: t.textSecondary, fontWeight: font.medium, borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap', fontSize: fontSize.sm },
            '& td': { borderBottom: `1px solid ${t.border}`, py: 1.75, fontVariantNumeric: 'tabular-nums', bgcolor: t.surface },
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
            <TableCell>{t('Priorité')}</TableCell>
            {COLUMNS.map((name) => (
              <TableCell key={name}>{name}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((p) => {
            const empty = p.total === 0;
            return (
              <TableRow key={p.priority} hover>
                <TableCell>
                  <Badge tone={PRIORITY_STYLE[p.priority].tone}>{PRIORITY_LABELS[p.priority]}</Badge>
                </TableCell>
                <TableCell sx={{ fontWeight: font.semibold, color: empty ? 'text.secondary' : 'text.primary' }}>{p.total}</TableCell>
                <TableCell>
                  <DurationCell stats={p.validation} />
                </TableCell>
                <TableCell>
                  <DurationCell stats={p.firstReply} />
                </TableCell>
                <TableCell>
                  <DurationCell stats={p.takeover} />
                </TableCell>
                <TableCell>
                  <DurationCell stats={p.resolution} />
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
    [
      t('Moyennes'),
      t('Seules les demandes mesurables comptent ; leur nombre est indiqué (n). Sous {threshold} mesures, l’échantillon est signalé faible.', {
        threshold: LOW_SAMPLE_THRESHOLD,
      }),
    ],
    [t('Première réponse'), DEFINITIONS.firstReply],
    [t('Prise en charge'), t('Du premier passage à « Envoyée » à la première acceptation. À ne pas confondre avec la première réponse.')],
    [t('Validation'), t('De l’entrée en « À valider » au statut suivant (catégories à validation administrative).')],
    [
      t('Traitement net'),
      t(
        'Du premier « Envoyée » au dernier « Terminée », en ne comptant que le temps passé « Envoyée », « Acceptée » et « En cours ». Les périodes « À corriger » et d’attente de validation sont exclues.',
      ),
    ],
    [t('Traitement brut'), DEFINITIONS.grossResolution],
    [
      t('Respect des délais'),
      t(
        'Part des demandes terminées, avec au moins une étape soumise à délai, qui n’ont jamais été en retard. Objectif : {target}. Une demande encore en cours n’entre pas dans le taux.',
        { target: percent(COMPLIANCE_TARGET) },
      ),
    ],
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
        {t('Comment sont calculés ces indicateurs ?')}
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
  if (perf.isPending) return <DashboardSkeleton label={t('Chargement des délais')} shape="performance" />;
  if (perf.error) return <ErrorState message={loadErrorMessage(perf.error, t('les délais'))} actionLabel={t('Réessayer')} onAction={() => void perf.refetch()} />;
  if (isEmpty(perf.data)) {
    return (
      <Paper variant="elevated">
        <EmptyState
          icon={SearchX}
          title={t('Aucun délai à mesurer')}
          description={t('Aucune demande prise en charge ni terminée sur cette période et avec ces filtres. Élargissez la période pour voir les délais.')}
        />
      </Paper>
    );
  }
  const o = perf.data.overall;
  const steps: Step[] = [
    { label: t('Première réponse'), stats: o.firstReply, hint: t('Soumission → premier message'), help: DEFINITIONS.firstReply },
    { label: t('Prise en charge'), stats: o.takeover, hint: t('Envoi → acceptation'), help: DEFINITIONS.takeover },
    { label: t('Traitement net'), stats: o.resolution, hint: t('Hors suspensions'), help: DEFINITIONS.resolution },
    { label: t('Traitement brut'), stats: o.grossResolution, hint: t('Suspensions comprises'), help: DEFINITIONS.grossResolution },
  ];
  // Colonne en minmax(0, 1fr) : le tableau large défile dans son conteneur, jamais la page.
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 3 }}>
      {/* En tête : le respect des délais (anneau) et ce même respect par priorité, côte à côte puis empilés. */}
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' } }}>
        <ComplianceHero compliance={o.compliance} />
        <PriorityCompliance rows={perf.data.byPriority} />
      </Box>

      <Lifecycle steps={steps} />

      <SectionCard
        elevated
        flush
        title={t('Détail par priorité')}
        description={
          <>
            {t('Délais attendus : règles de chaque catégorie (')}
            <Link component={RouterLink} to="/admin/categories">
              {t('Administration › Catégories')}
            </Link>
            {t(').')}
          </>
        }
      >
        <DelaysByPriorityTable rows={perf.data.byPriority} />
      </SectionCard>

      <DelaysHelp />
    </Box>
  );
}
