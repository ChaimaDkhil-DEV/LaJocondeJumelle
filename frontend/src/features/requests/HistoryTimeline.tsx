import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import type { Priority, RequestStatus } from '../../api/types';
import { STAGE_LABELS, type DeadlineStage } from '../../components/Countdown';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { PRIORITY_LABELS } from '../../components/PriorityChip';
import { STATUS_LABELS } from '../../components/StatusChip';

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
    case 'ASSIGNED':
      return `Affectée à ${String(to.assigneeName ?? 'un employé')}`;
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

/** Historique complet d'une demande (FR-029), du plus ancien au plus récent. */
export function HistoryTimeline({ requestId }: { requestId: string }) {
  const history = useQuery({
    queryKey: ['requests', 'detail', requestId, 'history'],
    queryFn: () => apiFetch<HistoryEvent[]>(`/api/requests/${requestId}/history`),
  });

  return (
    <Box component="section" aria-labelledby="titre-historique">
      <Typography id="titre-historique" component="h2" variant="h6" gutterBottom>
        Historique
      </Typography>
      {history.isPending ? (
        <LoadingState label="Chargement de l’historique" />
      ) : history.error ? (
        <ErrorState message="Impossible de charger l’historique." actionLabel="Réessayer" onAction={() => void history.refetch()} />
      ) : (
        <Box component="ol" aria-label="Historique" sx={{ m: 0, pl: 0, listStyle: 'none', borderLeft: 2, borderColor: 'divider' }}>
          {history.data.map((event) => (
            <Box component="li" key={event.id} sx={{ pl: 2, pb: 1.5, position: 'relative' }}>
              <Typography sx={{ fontWeight: 600 }}>{describeEvent(event)}</Typography>
              {event.comment && <Typography sx={{ overflowWrap: 'anywhere' }}>« {event.comment} »</Typography>}
              <Typography variant="body2" color="text.secondary">
                {event.actor ? `par ${event.actor.displayName}` : 'par le système'} ·{' '}
                <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
