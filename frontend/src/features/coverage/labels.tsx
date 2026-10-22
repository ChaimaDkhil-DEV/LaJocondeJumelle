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
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { serverNow } from '../../api/client';
import { Badge } from '../../components/Badge';
import { formatRemaining } from '../../components/Countdown';
import { font, fontSize, icon, tokensOf, type Tone } from '../../design/tokens';
import type {
  Availability,
  CoverageAction,
  CoverageSource,
  CoverageStatus,
  CoverageSummary,
  CoverageType,
  MainStatus,
  ProofMode,
  SubState,
  UnavailableReason,
} from './types';

/** Statut technique (historique) ; l'affichage courant passe par le statut principal et le sous-état. */
export const COVERAGE_STATUS_LABELS: Record<CoverageStatus, string> = {
  PENDING: 'En attente',
  BROADCAST: 'Diffusée',
  UNFILLED: 'Non pourvue',
  ACCEPTED: 'Assignée',
  EN_ROUTE: 'En route',
  LATE: 'En retard',
  ON_DUTY: 'En cours',
  RELIEF_PENDING: 'Relève demandée',
  DONE: 'Terminée',
  CLOSED: 'Clôturée après validation',
  CANCELLED: 'Annulée',
};

/** Six statuts principaux (FR-008). */
export const MAIN_STATUS_LABELS: Record<MainStatus, string> = {
  PENDING: 'En attente',
  ASSIGNED: 'Assignée',
  IN_PROGRESS: 'En cours',
  DONE: 'Terminée',
  CANCELLED: 'Annulée',
  UNFILLED: 'Non pourvue',
};

/** Sous-états affichés en badge, sans changer le statut principal (FR-008c). */
export const SUB_STATE_LABELS: Record<SubState, string> = {
  EN_ROUTE: 'En route',
  LATE: 'En retard',
  RELIEF_PENDING: 'Relève demandée',
  CLOSED: 'Clôturée après validation',
};

const MAIN_STYLE: Record<MainStatus, { tone: Tone; icon: LucideIcon }> = {
  PENDING: { tone: 'info', icon: Radio },
  ASSIGNED: { tone: 'accent', icon: UserCheck },
  IN_PROGRESS: { tone: 'success', icon: ShieldCheck },
  DONE: { tone: 'success', icon: CircleCheck },
  CANCELLED: { tone: 'neutral', icon: Ban },
  UNFILLED: { tone: 'error', icon: AlarmClock },
};

const SUB_STYLE: Record<SubState, { tone: Tone; icon: LucideIcon }> = {
  EN_ROUTE: { tone: 'accent', icon: Footprints },
  LATE: { tone: 'error', icon: AlarmClock },
  RELIEF_PENDING: { tone: 'warning', icon: LifeBuoy },
  CLOSED: { tone: 'neutral', icon: Lock },
};

/**
 * Statut principal et sous-état d'un statut technique : même table que le serveur (R1). Sert là où
 * seul le statut technique est connu (tableau de suivi) ; une garde non migrée est « en attente ».
 */
export function derivedStatus(status: CoverageStatus): { mainStatus: MainStatus; subState: SubState | null } {
  const table: Record<CoverageStatus, [MainStatus, SubState | null]> = {
    PENDING: ['PENDING', null],
    BROADCAST: ['PENDING', null],
    ACCEPTED: ['ASSIGNED', null],
    EN_ROUTE: ['ASSIGNED', 'EN_ROUTE'],
    LATE: ['ASSIGNED', 'LATE'],
    ON_DUTY: ['IN_PROGRESS', null],
    RELIEF_PENDING: ['IN_PROGRESS', 'RELIEF_PENDING'],
    DONE: ['DONE', null],
    CLOSED: ['DONE', 'CLOSED'],
    CANCELLED: ['CANCELLED', null],
    UNFILLED: ['UNFILLED', null],
  };
  const [mainStatus, subState] = table[status];
  return { mainStatus, subState };
}

/** Statut d'une affectation : statut principal, puis sous-état éventuel ; icône + libellé, la couleur n'est qu'un complément. */
export function CoverageStatusBadge({ mainStatus, subState }: { mainStatus: MainStatus; subState?: SubState | null }) {
  const main = MAIN_STYLE[mainStatus];
  const sub = subState ? SUB_STYLE[subState] : null;
  return (
    <Box component="span" sx={{ display: 'inline-flex', flexWrap: 'wrap', gap: 0.5 }}>
      <Badge tone={main.tone} icon={main.icon}>
        {MAIN_STATUS_LABELS[mainStatus]}
      </Badge>
      {subState && sub && (
        <Badge tone={sub.tone} icon={sub.icon}>
          {SUB_STATE_LABELS[subState]}
        </Badge>
      )}
    </Box>
  );
}

export const TYPE_LABELS: Record<CoverageType, string> = {
  LATENESS: 'Retard',
  ABSENCE: 'Absence',
  EMPTY_CLASS: 'Classe vide',
};

export const SOURCE_LABELS: Record<CoverageSource, string> = {
  TEACHER_REQUEST: 'Demande d’un enseignant',
  SUPERVISOR_REPORT: 'Déclarée par un surveillant',
  ADMIN_DIRECT: 'Affectation directe',
};

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  AVAILABLE: 'Disponible',
  UNAVAILABLE: 'Indisponible',
  ABSENT: 'Absent',
};

export const UNAVAILABLE_REASONS: Record<UnavailableReason, string> = {
  INACTIVE: 'Compte désactivé',
  ABSENT: 'Absent',
  UNAVAILABLE: 'Indisponible',
  ON_GUARD: 'Déjà affecté sur ce créneau',
  SUPPORT: 'En renfort dans une classe',
};

export const PROOF_LABELS: Record<ProofMode, string> = {
  PHOTO: 'Photo de la classe',
  QR: 'QR code de la classe',
  BOTH: 'QR code et photo de la classe',
};

export const ACTION_LABELS: Record<CoverageAction, string> = {
  ASSIGN: 'Assigner un surveillant',
  REASSIGN: 'Réassigner',
  UPDATE: 'Modifier la demande',
  WITHDRAW: 'Retirer la demande',
  DEPART: 'Je suis en route',
  CONFIRM_PRESENCE: 'Confirmer ma présence',
  REQUEST_RELIEF: 'Demander une relève',
  RELEASE_BY_MANAGER: 'Libérer le surveillant',
  RELIEVE: 'Terminer',
  EXTEND: 'Prolonger',
  VALIDATE: 'Valider et clôturer',
  CANCEL: 'Annuler l’affectation',
  SET_TEACHER: 'Corriger l’enseignant',
  RELEASE_SUPPORT: 'Libérer un renfort',
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

/** Jour (JJ/MM) et heure (HH:MM) dans le fuseau de l'école, quel que soit celui du navigateur. */
export function schoolClock(value: string, timeZone: string): { day: string; time: string } {
  const date = new Date(value);
  return {
    day: new Intl.DateTimeFormat('fr-FR', { timeZone, day: '2-digit', month: '2-digit' }).format(date),
    time: new Intl.DateTimeFormat('fr-FR', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date),
  };
}

const day = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * Début d'une affectation : « Maintenant » à une minute près ; sinon l'heure, précédée du jour
 * quand ce n'est pas aujourd'hui (demandes pour demain, affectations passées).
 */
export function formatStart(startAt: string): string {
  const start = new Date(startAt);
  const now = serverNow();
  if (Math.abs(start.getTime() - now.getTime()) <= 60_000) return 'Maintenant';
  if (start.toDateString() === now.toDateString()) return `À ${formatTime(start)}`;
  return `${day.format(start)} à ${formatTime(start)}`;
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
