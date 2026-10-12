import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import ScheduleIcon from '@mui/icons-material/Schedule';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { serverNow } from '../api/client';

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
      <Typography component="span" variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'error.main', fontWeight: 700 }}>
        <ErrorOutlineIcon fontSize="small" aria-hidden="true" />
        En retard ({STAGE_LABELS[lateStage]})
      </Typography>
    );
  }
  if (!stage || !dueAt) return null;

  const remaining = formatRemaining(Date.parse(dueAt) - now);
  const near = warnAt !== null && now >= Date.parse(warnAt);
  return (
    <Typography
      component="span"
      variant="body2"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: near ? 'warning.main' : 'text.secondary', fontWeight: near ? 700 : 400 }}
    >
      {near ? <HourglassBottomIcon fontSize="small" aria-hidden="true" /> : <ScheduleIcon fontSize="small" aria-hidden="true" />}
      {near ? 'Bientôt en retard : reste' : 'Reste'} {remaining} pour la {STAGE_LABELS[stage]}
    </Typography>
  );
}
