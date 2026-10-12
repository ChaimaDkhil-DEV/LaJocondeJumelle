import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { VoicePlayer } from '../voice/VoicePlayer';
import { useMessages, type ThreadMessage } from './api';
import { AttachmentList } from './AttachmentList';
import { MessageComposer } from './MessageComposer';

interface ThreadPanelProps {
  requestId: string;
  requestTitle: string;
  canWrite: boolean;
}

function MessageItem({ message }: { message: ThreadMessage }) {
  const system = message.kind === 'SYSTEM';
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <Paper
        variant="outlined"
        sx={{ p: 1.5, bgcolor: system ? 'action.hover' : 'background.paper', borderLeft: system ? 4 : 1, borderLeftColor: system ? 'secondary.main' : 'divider' }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
          {system && (
            <Typography component="span" variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 600 }}>
              <InfoOutlinedIcon fontSize="small" aria-hidden="true" /> Information
            </Typography>
          )}
          <Typography component="span" sx={{ fontWeight: 600 }}>
            {message.author?.displayName ?? 'Système'}
          </Typography>
          <Typography component="time" variant="body2" color="text.secondary" dateTime={message.createdAt}>
            {formatDateTime(message.createdAt)}
          </Typography>
        </Box>
        {message.text && <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.text}</Typography>}
        {message.voice && (
          <VoicePlayer key={message.voice.fileId} src={`/api/files/${message.voice.fileId}`} durationSeconds={message.voice.durationSeconds} />
        )}
        <AttachmentList attachments={message.attachments} />
      </Paper>
    </Box>
  );
}

/** Fil de discussion d'une demande, du plus ancien au plus récent, avec le formulaire de réponse. */
export function ThreadPanel({ requestId, requestTitle, canWrite }: ThreadPanelProps) {
  const thread = useMessages(requestId);
  // L'API renvoie les pages du plus récent au plus ancien : on remet le fil dans l'ordre chronologique.
  const messages = (thread.data?.pages.flatMap((p) => p.items) ?? []).slice().reverse();

  return (
    <Box component="section" aria-labelledby="titre-discussion">
      <Typography id="titre-discussion" component="h2" variant="h6" gutterBottom>
        Discussion
      </Typography>

      {thread.isPending ? (
        <LoadingState label="Chargement des messages" />
      ) : thread.error ? (
        <ErrorState message="Impossible de charger la discussion." actionLabel="Réessayer" onAction={() => void thread.refetch()} />
      ) : (
        <>
          {thread.hasNextPage && (
            <Button onClick={() => void thread.fetchNextPage()} loading={thread.isFetchingNextPage} sx={{ mb: 1 }}>
              Afficher les messages précédents
            </Button>
          )}
          {messages.length === 0 ? (
            <EmptyState title="Aucun message" description="Posez une question ou apportez une précision." />
          ) : (
            <Stack component="ol" aria-label="Messages" spacing={1.5} sx={{ p: 0, m: 0 }}>
              {messages.map((m) => (
                <MessageItem key={m.id} message={m} />
              ))}
            </Stack>
          )}
        </>
      )}

      <Box sx={{ mt: 3 }}>
        {canWrite ? (
          <MessageComposer requestId={requestId} requestTitle={requestTitle} />
        ) : (
          <Typography color="text.secondary">Cette demande est terminée : la discussion est fermée.</Typography>
        )}
      </Box>
    </Box>
  );
}
