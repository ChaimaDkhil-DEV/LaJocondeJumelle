import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Badge } from '../../components/Badge';
import { formatDateTime } from '../../components/format';
import type { Tone } from '../../design/tokens';
import { t } from '../../i18n';
import { VoicePlayer } from '../voice/VoicePlayer';
import {
  CHANNEL_LABELS,
  DELIVERY_LABELS,
  EVENT_LABELS,
  STATUS_LABELS,
  type ValidationDetail,
  type CommunicationStatus,
} from './api';

const STATUS_TONES: Record<CommunicationStatus, Tone> = {
  DRAFT: 'neutral',
  PENDING_ADMIN_VALIDATION: 'warning',
  RETURNED_FOR_CORRECTION: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELLED: 'neutral',
  SENT: 'success',
};

export function CommunicationStatusBadge({ status }: { status: CommunicationStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

/** Remarque et vocal d'une version (ou du brouillon), en lecture. */
export function RemarkAndVoice({
  text,
  voiceFileId,
  durationSeconds,
}: {
  text: string | null;
  voiceFileId: string | null;
  durationSeconds?: number | null;
}) {
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Box>
        <Typography variant="subtitle2" component="h3">
          {t('Message écrit')}
        </Typography>
        <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {text || '—'}
        </Typography>
      </Box>
      <Box>
        <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
          {t('Message vocal')}
        </Typography>
        {voiceFileId ? (
          <VoicePlayer
            key={voiceFileId}
            src={`/api/files/${voiceFileId}`}
            durationSeconds={durationSeconds ?? undefined}
          />
        ) : (
          <Typography color="text.secondary">{t('Aucun message vocal.')}</Typography>
        )}
      </Box>
    </Box>
  );
}

/** Historique des actions et décisions, motifs compris (US4). */
export function CommunicationHistory({ events }: { events: ValidationDetail['events'] }) {
  return (
    <Box
      component="ol"
      aria-label={t('Historique')}
      sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1 }}
    >
      {events.map((e, index) => (
        <li key={`${e.type}-${index}`}>
          <Typography variant="body2">
            {EVENT_LABELS[e.type]}
            {e.revision ? ` — ${t('version {number}', { number: e.revision })}` : ''}
            {e.actor ? ` — ${e.actor.displayName}` : ''} · {formatDateTime(e.createdAt)}
          </Typography>
          {e.reason && (
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
              {e.reason}
            </Typography>
          )}
        </li>
      ))}
    </Box>
  );
}

/** Notifications externes (n8n) : l'espace parent reste le canal principal. */
export function DeliveryList({ deliveries }: { deliveries: ValidationDetail['deliveries'] }) {
  if (deliveries.length === 0) {
    return (
      <Typography color="text.secondary">
        {t('Aucune notification externe : le message est disponible dans l’espace parent.')}
      </Typography>
    );
  }
  return (
    <Box component="ul" aria-label={t('Notifications externes')} sx={{ m: 0, pl: 2.5 }}>
      {deliveries.map((d) => (
        <li key={d.channel}>
          <Typography variant="body2">
            {CHANNEL_LABELS[d.channel]} : {DELIVERY_LABELS[d.status]}
            {d.attempts > 0 ? ` (${t('{count} tentative(s)', { count: d.attempts })})` : ''}
          </Typography>
        </li>
      ))}
    </Box>
  );
}
