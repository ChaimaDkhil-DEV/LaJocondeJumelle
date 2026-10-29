import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import type { Theme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { visuallyHidden } from '../../components/a11y';
import { Badge } from '../../components/Badge';
import { font, fontSize, icon, tokensOf, type ToneColors } from '../../design/tokens';
import { COMPLIANCE_TARGET, complianceLevel, isLowSample, percent, type ComplianceLevel } from './delayThresholds';

/** Couleurs d'un niveau de respect des délais : vert, orange ou rouge ; gris sans donnée. */
function levelColors(theme: Theme, level: ComplianceLevel | null): ToneColors {
  const t = tokensOf(theme);
  if (level === 'met') return t.success;
  if (level === 'near') return t.warning;
  if (level === 'below') return t.error;
  return { main: t.borderStrong, soft: t.surfaceMuted, text: t.textSecondary, border: t.border };
}

const LEVEL_TEXT: Record<ComplianceLevel, { label: string; icon: LucideIcon }> = {
  met: { label: 'Objectif atteint', icon: CircleCheck },
  near: { label: 'Proche de l’objectif', icon: TriangleAlert },
  below: { label: 'Sous l’objectif', icon: CircleAlert },
};

/** Niveau écrit avec son icône : l'information ne passe jamais par la seule couleur. */
export function ComplianceStatus({ rate, compact = false }: { rate: number | null; compact?: boolean }) {
  const level = complianceLevel(rate);
  if (!level) return null;
  const { label, icon: Icon } = LEVEL_TEXT[level];
  return (
    <Box
      component="span"
      sx={(theme) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        color: levelColors(theme, level).text,
        fontSize: compact ? fontSize.xs : fontSize.sm,
        fontWeight: font.medium,
      })}
    >
      <Icon size={compact ? icon.sm - 2 : icon.sm} aria-hidden="true" />
      <span>
        {label}
        {!compact && (
          <Box component="span" sx={{ color: 'text.secondary', fontWeight: font.regular }}>
            {' '}
            (objectif {percent(COMPLIANCE_TARGET)})
          </Box>
        )}
      </span>
    </Box>
  );
}

/**
 * Anneau de progression du taux de respect des délais, avec le repère de l'objectif. Image
 * nommée (`role="img"`) : taux, objectif et niveau sont lus ensemble.
 */
export function ComplianceGauge({ rate, size = 96 }: { rate: number | null; size?: number }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const level = complianceLevel(rate);
  const value = rate ?? 0;
  // Repère de l'objectif, sur le cercle (départ en haut, sens horaire).
  const angle = 2 * Math.PI * COMPLIANCE_TARGET - Math.PI / 2;
  const tick = (offset: number) => ({ x: size / 2 + (r + offset) * Math.cos(angle), y: size / 2 + (r + offset) * Math.sin(angle) });
  const label =
    rate === null
      ? 'Respect des délais : aucune demande évaluée'
      : `Respect des délais : ${percent(rate)}, objectif ${percent(COMPLIANCE_TARGET)}, ${LEVEL_TEXT[level!].label.toLowerCase()}`;
  return (
    <Box
      component="svg"
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      sx={(theme) => {
        const c = levelColors(theme, level);
        return {
          width: size,
          height: size,
          flex: 'none',
          '& .track': { stroke: tokensOf(theme).surfaceMuted },
          '& .bar': { stroke: c.main, transition: 'stroke-dashoffset 300ms' },
          '& .target': { stroke: tokensOf(theme).textSecondary },
          '@media (prefers-reduced-motion: reduce)': { '& .bar': { transition: 'none' } },
        };
      }}
    >
      <circle className="track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
      {value > 0 && (
        <circle
          className="bar"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap={value >= 1 ? 'butt' : 'round'}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(value, 1))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      <line className="target" x1={tick(-stroke / 2 - 2).x} y1={tick(-stroke / 2 - 2).y} x2={tick(stroke / 2 + 2).x} y2={tick(stroke / 2 + 2).y} strokeWidth={2} strokeLinecap="round" />
    </Box>
  );
}

/** Barre fine de respect des délais (tableau), nommée pour les lecteurs d'écran. */
export function ComplianceBar({ rate, width = 64 }: { rate: number; width?: number }) {
  const level = complianceLevel(rate);
  return (
    <Box
      component="span"
      role="img"
      aria-label={`${percent(rate)} des demandes dans les délais`}
      sx={(theme) => ({ display: 'inline-flex', width, height: 6, borderRadius: 3, overflow: 'hidden', flex: 'none', bgcolor: tokensOf(theme).surfaceMuted })}
    >
      <Box component="span" sx={(theme) => ({ width: `${Math.min(rate, 1) * 100}%`, bgcolor: levelColors(theme, level).main })} />
    </Box>
  );
}

/**
 * Taille de l'échantillon (« n = 3 »). Sous le seuil, badge d'avertissement avec icône, texte et
 * infobulle (accessible au clavier) : « Échantillon faible : interpréter avec prudence ».
 */
export function SampleSizeBadge({ count, unit = 'demande' }: { count: number; unit?: string }) {
  const low = isLowSample(count);
  const title = `${count} ${unit}${count > 1 ? 's' : ''} mesurée${count > 1 ? 's' : ''}`;
  if (!low) {
    return (
      <Tooltip title={title} describeChild>
        <Box component="span" tabIndex={0} sx={{ display: 'inline-flex', borderRadius: 999 }}>
          <Badge>n = {count}</Badge>
        </Box>
      </Tooltip>
    );
  }
  return (
    <Tooltip title={`${title}. Échantillon faible : interpréter avec prudence.`} describeChild>
      <Box component="span" tabIndex={0} sx={{ display: 'inline-flex', borderRadius: 999 }}>
        <Badge tone="warning" icon={TriangleAlert}>
          n = {count}
          <Box component="span" sx={visuallyHidden}>
            , échantillon faible
          </Box>
        </Badge>
      </Box>
    </Tooltip>
  );
}

/** Bouton « i » d'aide d'un indicateur : définition en infobulle (survol, focus, toucher). */
export function MetricHelp({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip title={text} describeChild enterTouchDelay={0} leaveTouchDelay={6000}>
      <IconButton
        size="small"
        aria-label={`Définition : ${label}`}
        sx={(theme) => ({ p: 0.5, m: -0.5, color: tokensOf(theme).textSecondary, '@media (pointer: coarse)': { p: 1.25, m: -1.25 } })}
      >
        <Info size={icon.sm - 2} aria-hidden="true" />
      </IconButton>
    </Tooltip>
  );
}

/**
 * Absence de mesure, distincte de zéro : « Aucune donnée » en gris discret, explication au
 * survol (le texte suffit seul ; pas d'arrêt clavier supplémentaire dans les tableaux).
 */
export function NoData({ reason = 'Aucune demande mesurable sur la période.' }: { reason?: string }) {
  return (
    <Tooltip title={reason} placement="top">
      <Box component="span" sx={(theme) => ({ color: tokensOf(theme).textMuted, fontSize: fontSize.sm, whiteSpace: 'nowrap' })}>
        Aucune donnée
      </Box>
    </Tooltip>
  );
}

/** Icône de niveau (tableau) avec son libellé pour les lecteurs d'écran. */
export function ComplianceIcon({ rate }: { rate: number }) {
  const level = complianceLevel(rate)!;
  const { label, icon: Icon } = LEVEL_TEXT[level];
  return (
    <Box component="span" title={label} sx={(theme) => ({ display: 'inline-flex', color: levelColors(theme, level).text })}>
      <Icon size={icon.sm - 2} aria-hidden="true" />
      <Box component="span" sx={visuallyHidden}>
        {label}
      </Box>
    </Box>
  );
}
