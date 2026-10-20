import Box from '@mui/material/Box';
import {
  AlarmClock,
  Ban,
  CircleCheck,
  Footprints,
  Hourglass,
  LifeBuoy,
  Lock,
  Radio,
  ShieldCheck,
  ThumbsUp,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { serverNow } from '../../api/client';
import { Badge } from '../../components/Badge';
import { formatRemaining } from '../../components/Countdown';
import { font, fontSize, icon, tokensOf, type Tone } from '../../design/tokens';
import type { Availability, CoverageAction, CoverageStatus, CoverageSummary, ProofMode, UnavailableReason } from './types';

export const COVERAGE_STATUS_LABELS: Record<CoverageStatus, string> = {
  PENDING: 'En attente',
  BROADCAST: 'Diffusée',
  UNFILLED: 'Non pourvue',
  ACCEPTED: 'Acceptée',
  EN_ROUTE: 'En route',
  LATE: 'En retard',
  ON_DUTY: 'En garde',
  RELIEF_PENDING: 'Relève demandée',
  DONE: 'Relevée',
  CLOSED: 'Clôturée',
  CANCELLED: 'Annulée',
};

const STATUS_STYLE: Record<CoverageStatus, { tone: Tone; icon: LucideIcon }> = {
  PENDING: { tone: 'info', icon: Radio },
  BROADCAST: { tone: 'info', icon: Radio },
  UNFILLED: { tone: 'error', icon: AlarmClock },
  ACCEPTED: { tone: 'accent', icon: ThumbsUp },
  EN_ROUTE: { tone: 'accent', icon: Footprints },
  LATE: { tone: 'error', icon: AlarmClock },
  ON_DUTY: { tone: 'success', icon: ShieldCheck },
  RELIEF_PENDING: { tone: 'warning', icon: LifeBuoy },
  DONE: { tone: 'success', icon: CircleCheck },
  CLOSED: { tone: 'neutral', icon: Lock },
  CANCELLED: { tone: 'neutral', icon: Ban },
};

/** Statut d'une couverture : icône + libellé ; la couleur n'est qu'un complément. */
export function CoverageStatusBadge({ status }: { status: CoverageStatus }) {
  const { tone, icon: Icon } = STATUS_STYLE[status];
  return (
    <Badge tone={tone} icon={Icon}>
      {COVERAGE_STATUS_LABELS[status]}
    </Badge>
  );
}

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  AVAILABLE: 'Disponible',
  UNAVAILABLE: 'Indisponible',
  ABSENT: 'Absent',
};

export const UNAVAILABLE_REASONS: Record<UnavailableReason, string> = {
  INACTIVE: 'Compte désactivé',
  ABSENT: 'Absent',
  UNAVAILABLE: 'Indisponible',
  ON_GUARD: 'Déjà en garde',
};

export const PROOF_LABELS: Record<ProofMode, string> = {
  PHOTO: 'Photo de la classe',
  QR: 'QR code de la classe',
  BOTH: 'QR code et photo de la classe',
};

export const ACTION_LABELS: Record<CoverageAction, string> = {
  ACCEPT: 'Je prends',
  ASSIGN: 'Affecter',
  REASSIGN: 'Réaffecter',
  WIDEN: 'Élargir à un autre groupe',
  DEPART: 'Je suis en route',
  CONFIRM_PRESENCE: 'Confirmer ma présence',
  RELEASE: 'Me désister',
  REQUEST_RELIEF: 'Demander une relève',
  RELEASE_BY_MANAGER: 'Libérer l’employé',
  RELIEVE: 'Garde terminée',
  EXTEND: 'Prolonger',
  VALIDATE: 'Valider et clôturer',
  CANCEL: 'Annuler la demande',
};

/** « Jusqu'à l'arrivée de l'enseignant » ou « 1 h 30 ». */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return 'Jusqu’à l’arrivée de l’enseignant';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function formatTime(value: string | Date): string {
  return time.format(typeof value === 'string' ? new Date(value) : value);
}

/** « Maintenant » si la garde commence dans moins d'une minute, sinon l'heure. */
export function formatStart(startAt: string): string {
  const diff = Date.parse(startAt) - serverNow().getTime();
  return diff <= 60_000 ? 'Maintenant' : `À ${formatTime(startAt)}`;
}

/** Heure serveur actualisée chaque seconde (chronomètres, temps écoulé). */
export function useServerClock(): number {
  const [now, setNow] = useState(() => serverNow().getTime());
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow().getTime()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Temps écoulé depuis un instant, mis à jour chaque seconde, sans annonce répétée aux lecteurs d'écran. */
export function Elapsed({ since, prefix }: { since: string; prefix: string }) {
  const now = useServerClock();
  return (
    <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix} {formatRemaining(now - Date.parse(since))}
    </Box>
  );
}

/** Délai de l'étape en cours (prise en charge, arrivée en classe) ou retard. */
export function CoverageDeadline({ summary }: { summary: Pick<CoverageSummary, 'currentStage' | 'currentDueAt' | 'overdueStage' | 'status'> }) {
  const now = useServerClock();
  const stageLabel = (stage: string) => (stage === 'ARRIVAL' ? 'l’arrivée en classe' : 'la prise en charge');
  if (summary.overdueStage || summary.status === 'LATE' || summary.status === 'UNFILLED') {
    const stage = summary.overdueStage ?? (summary.status === 'UNFILLED' ? 'TAKEOVER' : 'ARRIVAL');
    return (
      <DeadlineText tone="error" icon={AlarmClock}>
        Délai dépassé pour {stageLabel(stage)}
      </DeadlineText>
    );
  }
  if (!summary.currentStage || !summary.currentDueAt) return null;
  const remaining = Date.parse(summary.currentDueAt) - now;
  if (remaining <= 0) {
    return (
      <DeadlineText tone="error" icon={AlarmClock}>
        Délai dépassé pour {stageLabel(summary.currentStage)}
      </DeadlineText>
    );
  }
  return (
    <DeadlineText tone={remaining < 60_000 ? 'warning' : 'neutral'} icon={Hourglass}>
      Reste {formatRemaining(remaining)} pour {stageLabel(summary.currentStage)}
    </DeadlineText>
  );
}

function DeadlineText({ tone, icon: Icon, children }: { tone: 'error' | 'warning' | 'neutral'; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <Box
      component="span"
      sx={(theme) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        fontSize: fontSize.xs,
        fontWeight: tone === 'neutral' ? font.regular : font.medium,
        fontVariantNumeric: 'tabular-nums',
        color: tone === 'neutral' ? tokensOf(theme).textSecondary : tokensOf(theme)[tone].text,
      })}
    >
      <Icon size={icon.sm - 2} strokeWidth={2} aria-hidden="true" />
      {children}
    </Box>
  );
}
