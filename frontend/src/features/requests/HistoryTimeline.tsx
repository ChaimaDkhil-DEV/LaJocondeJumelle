import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  FilePlus,
  Flag,
  History,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Sparkles,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { apiFetch } from '../../api/client';
import type { RequestStatus } from '../../api/types';
import { STAGE_LABELS, type DeadlineStage } from '../../components/Countdown';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { SectionCard } from '../../components/SectionCard';
import { font, icon, tokensOf } from '../../design/tokens';
import { t } from '../../i18n';
import { historyPriorityLabel } from '../../components/PriorityBadge';
import { STATUS_LABELS } from '../../components/StatusBadge';

type EventValue = Record<string, unknown> | null;

export interface HistoryEvent {
  id: string;
  type: string;
  actor: { id: string; displayName: string } | null;
  fromValue: EventValue;
  toValue: EventValue;
  comment: string | null;
  createdAt: string;
}

const FILE_LABELS: Record<string, string> = {
  PHOTO: t('Photo jointe'),
  DOCUMENT: t('Document joint'),
  VOICE: t('Message vocal joint'),
};

/** Origine de l'employé affecté à l'approbation (FR-008) ; absente des événements antérieurs. */
const ASSIGNEE_SOURCE_LABELS: Record<string, string> = {
  SNAPSHOT: t('personne prévue à la soumission'),
  CATEGORY_CURRENT: t('selon la catégorie actuelle, demande antérieure'),
  MANAGER_CHOICE: t('choix d’un admin'),
};

/**
 * Propositions automatiques (spec 009) : chaque valeur proposée, et si elle a été retenue à l'envoi.
 * `from` : valeurs proposées ; `to` : valeurs enregistrées.
 */
function describeAssist(from: Record<string, unknown>, to: Record<string, unknown>): string {
  const parts: string[] = [];
  if (from.categoryId !== undefined) {
    const kept = from.categoryId === to.categoryId;
    const name = String(from.categoryName ?? t('inconnue'));
    parts.push(
      kept
        ? t('catégorie « {name} » (retenue)', { name })
        : t('catégorie « {name} » (retenue : « {kept} »)', { name, kept: String(to.categoryName) }),
    );
  }
  if (from.priority !== undefined) {
    const kept = from.priority === to.priority;
    const priority = historyPriorityLabel(from.priority);
    parts.push(
      kept
        ? t('priorité {priority} (retenue)', { priority })
        : t('priorité {priority} (retenue : {kept})', { priority, kept: historyPriorityLabel(to.priority) }),
    );
  }
  if (from.title !== undefined) parts.push(from.title === to.title ? t('titre proposé (retenu)') : t('titre proposé (modifié)'));
  return parts.length > 0
    ? t('Propositions automatiques : {parts}', { parts: parts.join(', ') })
    : t('Propositions automatiques');
}

/** Précision affichée sous l'événement (consignes utilisées par les propositions automatiques). */
export function eventDetail(e: HistoryEvent): string | null {
  if (e.type !== 'ASSIST_SUGGESTED') return null;
  const sources = Array.isArray(e.fromValue?.sources) ? (e.fromValue.sources as Array<{ title?: unknown }>) : [];
  const titles = sources.map((s) => s.title).filter((title): title is string => typeof title === 'string');
  return titles.length > 0 ? t('Consignes : {titles}', { titles: titles.join(', ') }) : null;
}

/** Description d'un événement d'historique en langage courant. */
export function describeEvent(e: HistoryEvent): string {
  const from = e.fromValue ?? {};
  const to = e.toValue ?? {};
  switch (e.type) {
    case 'CREATED':
      return t('Demande créée');
    case 'STATUS_CHANGED':
      return t('Statut : {from} → {to}', {
        from: STATUS_LABELS[from.status as RequestStatus] ?? '—',
        to: STATUS_LABELS[to.status as RequestStatus],
      });
    case 'PRIORITY_CHANGED':
      return t('Priorité : {from} → {to}', {
        from: historyPriorityLabel(from.priority),
        to: historyPriorityLabel(to.priority),
      });
    case 'ASSIGNED': {
      const source = ASSIGNEE_SOURCE_LABELS[String(to.assigneeSource)];
      const name = String(to.assigneeName ?? t('un employé'));
      return source ? t('Affectée à {name} ({source})', { name, source }) : t('Affectée à {name}', { name });
    }
    case 'REASSIGNED': {
      const name = String(to.assigneeName ?? t('un employé'));
      return from.assigneeName
        ? t('Réaffectée à {name} (auparavant {previous})', { name, previous: String(from.assigneeName) })
        : t('Réaffectée à {name}', { name });
    }
    case 'MESSAGE_ADDED':
      return to.kind === 'VOICE' ? t('Message vocal ajouté') : t('Message ajouté');
    case 'FILE_ADDED':
      return FILE_LABELS[String(to.kind)] ?? t('Fichier joint');
    case 'OVERDUE':
      return t('En retard ({stage})', { stage: STAGE_LABELS[to.stage as DeadlineStage] });
    case 'ASSIST_SUGGESTED':
      return describeAssist(from, to);
    default:
      return e.type;
  }
}

/** Icône de chaque type d'événement (historique d'une demande, activité du tableau de bord). */
export const EVENT_ICONS: Record<string, LucideIcon> = {
  CREATED: FilePlus,
  STATUS_CHANGED: RefreshCw,
  PRIORITY_CHANGED: Flag,
  ASSIGNED: UserRound,
  REASSIGNED: UserRound,
  MESSAGE_ADDED: MessageSquare,
  FILE_ADDED: Paperclip,
  OVERDUE: AlarmClock,
  ASSIST_SUGGESTED: Sparkles,
};

/** Historique complet d'une demande (FR-029), du plus ancien au plus récent. */
export function HistoryTimeline({ requestId }: { requestId: string }) {
  const history = useQuery({
    queryKey: ['requests', 'detail', requestId, 'history'],
    queryFn: () => apiFetch<HistoryEvent[]>(`/api/requests/${requestId}/history`),
  });

  return (
    <SectionCard title={t('Historique')} icon={History} titleId="titre-historique">
      {history.isPending ? (
        <LoadingState label={t('Chargement de l’historique')} rows={2} />
      ) : history.error ? (
        <ErrorState message={t('Impossible de charger l’historique.')} actionLabel={t('Réessayer')} onAction={() => void history.refetch()} />
      ) : (
        <Box component="ol" aria-label={t('Historique')} sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {history.data.map((event, index) => {
            const Icon = EVENT_ICONS[event.type] ?? RefreshCw;
            const late = event.type === 'OVERDUE';
            const last = index === history.data.length - 1;
            const detail = eventDetail(event);
            return (
              <Box
                component="li"
                key={event.id}
                sx={{ position: 'relative', display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', columnGap: 1.5, pb: last ? 0 : 2 }}
              >
                {/* Trait vertical reliant les étapes. */}
                {!last && (
                  <Box aria-hidden="true" sx={{ position: 'absolute', left: 13.5, top: 30, bottom: 2, width: '1px', bgcolor: 'divider' }} />
                )}
                <Box
                  aria-hidden="true"
                  sx={(theme) => ({
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${late ? tokensOf(theme).error.border : tokensOf(theme).border}`,
                    bgcolor: late ? tokensOf(theme).error.soft : tokensOf(theme).surface,
                    color: late ? tokensOf(theme).error.main : tokensOf(theme).textSecondary,
                  })}
                >
                  <Icon size={icon.sm - 2} />
                </Box>
                <Box sx={{ minWidth: 0, pt: 0.25 }}>
                  <Typography variant="body2" sx={{ fontWeight: font.medium, overflowWrap: 'anywhere' }}>
                    {describeEvent(event)}
                  </Typography>
                  {detail && (
                    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere', mt: 0.25 }}>
                      {detail}
                    </Typography>
                  )}
                  {event.comment && (
                    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere', mt: 0.25 }}>
                      {t('« {comment} »', { comment: event.comment })}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {event.actor ? t('par {name}', { name: event.actor.displayName }) : t('par le système')} ·{' '}
                    <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </SectionCard>
  );
}
