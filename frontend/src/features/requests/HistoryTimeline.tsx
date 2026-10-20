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
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { apiFetch } from '../../api/client';
import type { Priority, RequestStatus } from '../../api/types';
import { STAGE_LABELS, type DeadlineStage } from '../../components/Countdown';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { SectionCard } from '../../components/SectionCard';
import { font, icon, tokensOf } from '../../design/tokens';
import { PRIORITY_LABELS } from '../../components/PriorityBadge';
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

const FILE_LABELS: Record<string, string> = { PHOTO: 'Photo jointe', DOCUMENT: 'Document joint', VOICE: 'Message vocal joint' };

/** Origine de l'employé affecté à l'approbation (FR-008) ; absente des événements antérieurs. */
const ASSIGNEE_SOURCE_LABELS: Record<string, string> = {
  SNAPSHOT: 'personne prévue à la soumission',
  CATEGORY_CURRENT: 'selon la catégorie actuelle, demande antérieure',
  MANAGER_CHOICE: 'choix d’un admin',
};

/** Description d'un événement d'historique en langage courant. */
export function describeEvent(e: HistoryEvent): string {
  const from = e.fromValue ?? {};
  const to = e.toValue ?? {};
  switch (e.type) {
    case 'CREATED':
      return 'Demande créée';
    case 'STATUS_CHANGED':
      return `Statut : ${STATUS_LABELS[from.status as RequestStatus] ?? '—'} → ${STATUS_LABELS[to.status as RequestStatus]}`;
    case 'PRIORITY_CHANGED':
      return `Priorité : ${PRIORITY_LABELS[from.priority as Priority]} → ${PRIORITY_LABELS[to.priority as Priority]}`;
    case 'ASSIGNED': {
      const source = ASSIGNEE_SOURCE_LABELS[String(to.assigneeSource)];
      return `Affectée à ${String(to.assigneeName ?? 'un employé')}${source ? ` (${source})` : ''}`;
    }
    case 'REASSIGNED':
      return `Réaffectée à ${String(to.assigneeName ?? 'un employé')}${from.assigneeName ? ` (auparavant ${String(from.assigneeName)})` : ''}`;
    case 'MESSAGE_ADDED':
      return to.kind === 'VOICE' ? 'Message vocal ajouté' : 'Message ajouté';
    case 'FILE_ADDED':
      return FILE_LABELS[String(to.kind)] ?? 'Fichier joint';
    case 'OVERDUE':
      return `En retard (${STAGE_LABELS[to.stage as DeadlineStage]})`;
    default:
      return e.type;
  }
}

const EVENT_ICONS: Record<string, LucideIcon> = {
  CREATED: FilePlus,
  STATUS_CHANGED: RefreshCw,
  PRIORITY_CHANGED: Flag,
  ASSIGNED: UserRound,
  REASSIGNED: UserRound,
  MESSAGE_ADDED: MessageSquare,
  FILE_ADDED: Paperclip,
  OVERDUE: AlarmClock,
};

/** Historique complet d'une demande (FR-029), du plus ancien au plus récent. */
export function HistoryTimeline({ requestId }: { requestId: string }) {
  const history = useQuery({
    queryKey: ['requests', 'detail', requestId, 'history'],
    queryFn: () => apiFetch<HistoryEvent[]>(`/api/requests/${requestId}/history`),
  });

  return (
    <SectionCard title="Historique" icon={History} titleId="titre-historique">
      {history.isPending ? (
        <LoadingState label="Chargement de l’historique" rows={2} />
      ) : history.error ? (
        <ErrorState message="Impossible de charger l’historique." actionLabel="Réessayer" onAction={() => void history.refetch()} />
      ) : (
        <Box component="ol" aria-label="Historique" sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {history.data.map((event, index) => {
            const Icon = EVENT_ICONS[event.type] ?? RefreshCw;
            const late = event.type === 'OVERDUE';
            const last = index === history.data.length - 1;
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
                  {event.comment && (
                    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere', mt: 0.25 }}>
                      « {event.comment} »
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {event.actor ? `par ${event.actor.displayName}` : 'par le système'} ·{' '}
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
