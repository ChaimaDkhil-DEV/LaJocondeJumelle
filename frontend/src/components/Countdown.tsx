import Box from '@mui/material/Box';
import { AlarmClock, Clock, Hourglass } from 'lucide-react';
import { useEffect, useState } from 'react';
import { serverNow } from '../api/client';
import { font, fontSize, icon, tokensOf } from '../design/tokens';

export type DeadlineStage = 'VALIDATION' | 'TAKEOVER' | 'COMPLETION';

export const STAGE_LABELS: Record<DeadlineStage, string> = {
  VALIDATION: 'validation',
  TAKEOVER: 'prise en charge',
  COMPLETION: 'réalisation',
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** « 45 s », « 1 min 30 s », « 15 min », « 2 h 05 », « 1 j 3 h ». */
export function formatRemaining(ms: number): string {
  const value = Math.max(0, ms);
  if (value < MINUTE) return `${Math.floor(value / SECOND)} s`;
  if (value < 2 * MINUTE) return `1 min ${Math.floor((value - MINUTE) / SECOND)} s`;
  if (value < HOUR) return `${Math.floor(value / MINUTE)} min`;
  if (value < DAY) {
    const hours = Math.floor(value / HOUR);
    return `${hours} h ${String(Math.floor((value - hours * HOUR) / MINUTE)).padStart(2, '0')}`;
  }
  const days = Math.floor(value / DAY);
  return `${days} j ${Math.floor((value - days * DAY) / HOUR)} h`;
}

interface CountdownProps {
  stage: DeadlineStage | null;
  dueAt: string | null;
  warnAt: string | null;
  overdueStage: DeadlineStage | null;
}

/**
 * Temps restant pour l'étape suivie (FR-025, FR-026), calculé avec l'heure du serveur.
 * Discret tant que le délai est confortable ; orange à l'approche ; badge rouge en retard.
 * Mis à jour chaque seconde à l'écran, sans région aria-live : pas d'annonce répétée.
 */
export function Countdown({ stage, dueAt, warnAt, overdueStage }: CountdownProps) {
  const [now, setNow] = useState(() => serverNow().getTime());

  useEffect(() => {
    if (!dueAt) return undefined;
    const timer = setInterval(() => setNow(serverNow().getTime()), SECOND);
    return () => clearInterval(timer);
  }, [dueAt]);

  const lateStage = overdueStage ?? (stage && dueAt && now >= Date.parse(dueAt) ? stage : null);
  if (lateStage) {
    return (
      <Box
        component="span"
        sx={(theme) => ({
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          height: 24,
          px: 1,
          borderRadius: '6px',
          border: `1px solid ${tokensOf(theme).error.border}`,
          bgcolor: tokensOf(theme).error.soft,
          color: tokensOf(theme).error.text,
          fontSize: fontSize.xs,
          fontWeight: font.medium,
          whiteSpace: 'nowrap',
        })}
      >
        <AlarmClock size={icon.sm - 2} strokeWidth={2} aria-hidden="true" />
        En retard ({STAGE_LABELS[lateStage]})
      </Box>
    );
  }
  if (!stage || !dueAt) return null;

  const remaining = formatRemaining(Date.parse(dueAt) - now);
  const near = warnAt !== null && now >= Date.parse(warnAt);
  const Icon = near ? Hourglass : Clock;
  return (
    <Box
      component="span"
      sx={(theme) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        fontSize: fontSize.xs,
        fontWeight: near ? font.medium : font.regular,
        color: near ? tokensOf(theme).warning.text : tokensOf(theme).textSecondary,
        fontVariantNumeric: 'tabular-nums',
      })}
    >
      <Icon size={icon.sm - 2} strokeWidth={2} aria-hidden="true" />
      {near ? 'Bientôt en retard : reste' : 'Reste'} {remaining} pour la {STAGE_LABELS[stage]}
    </Box>
  );
}
