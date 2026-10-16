import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Info, Lock, MessagesSquare } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { RelativeTime } from '../../components/RelativeTime';
import { SectionCard } from '../../components/SectionCard';
import { UserAvatar } from '../../components/UserAvatar';
import { font, icon, tokensOf } from '../../design/tokens';
import { useCurrentUser } from '../auth/useCurrentUser';
import { VoicePlayer } from '../voice/VoicePlayer';
import { useMessages, type ThreadMessage } from './api';
import { AttachmentList } from './AttachmentList';
import { MessageComposer } from './MessageComposer';

interface ThreadPanelProps {
  requestId: string;
  requestTitle: string;
  canWrite: boolean;
  /** Demande terminée : formulaire de réponse affiché désactivé (consultation uniquement). */
  readOnly?: boolean;
}

/** Message système (changement de statut…) : ligne centrée, discrète. */
function SystemMessage({ message }: { message: ThreadMessage }) {
  return (
    <Box
      component="li"
      sx={(theme) => ({
        listStyle: 'none',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        px: 1.5,
        py: 1,
        borderRadius: 1,
        bgcolor: tokensOf(theme).surfaceMuted,
        color: tokensOf(theme).textSecondary,
      })}
    >
      <Box component="span" sx={{ display: 'flex', pt: 0.25 }}>
        <Info size={icon.sm} aria-hidden="true" />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ color: 'inherit', overflowWrap: 'anywhere' }}>
          <Box component="span" sx={{ fontWeight: font.medium }}>
            Information
          </Box>{' '}
          · {message.author?.displayName ?? 'Système'} ·{' '}
          <time dateTime={message.createdAt} title={formatDateTime(message.createdAt)}>
            {formatDateTime(message.createdAt)}
          </time>
        </Typography>
        {message.text && (
          <Typography variant="body2" sx={{ color: 'text.primary', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', mt: 0.25 }}>
            {message.text}
          </Typography>
        )}
        <AttachmentList attachments={message.attachments} />
      </Box>
    </Box>
  );
}

/** Message d'une personne : avatar, nom, heure, puis bulle sobre (à droite pour ses propres messages). */
function MessageItem({ message, own }: { message: ThreadMessage; own: boolean }) {
  if (message.kind === 'SYSTEM') return <SystemMessage message={message} />;
  const name = message.author?.displayName ?? 'Système';
  return (
    <Box
      component="li"
      sx={{ listStyle: 'none', display: 'flex', gap: 1.25, flexDirection: own ? 'row-reverse' : 'row', alignItems: 'flex-start' }}
    >
      <UserAvatar name={name} id={message.author?.id} size={32} />
      <Box sx={{ minWidth: 0, maxWidth: { xs: 'calc(100% - 44px)', sm: '80%' }, display: 'flex', flexDirection: 'column', alignItems: own ? 'flex-end' : 'flex-start' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
          <Typography component="span" variant="body2" sx={{ fontWeight: font.medium }}>
            {name}
          </Typography>
          <Typography component="span" variant="caption" color="text.secondary">
            <RelativeTime value={message.createdAt} />
          </Typography>
        </Box>
        <Box
          sx={(theme) => ({
            px: 1.75,
            py: 1.25,
            borderRadius: 1.5,
            ...(own ? { borderTopRightRadius: 4 } : { borderTopLeftRadius: 4 }),
            bgcolor: own ? tokensOf(theme).accent.soft : tokensOf(theme).surfaceMuted,
            border: `1px solid ${own ? tokensOf(theme).accent.border : tokensOf(theme).border}`,
            minWidth: 0,
            maxWidth: '100%',
            display: 'grid',
            gap: 1,
          })}
        >
          {message.text && (
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {message.text}
            </Typography>
          )}
          {message.voice && (
            <VoicePlayer key={message.voice.fileId} src={`/api/files/${message.voice.fileId}`} durationSeconds={message.voice.durationSeconds} />
          )}
          <AttachmentList attachments={message.attachments} />
        </Box>
      </Box>
    </Box>
  );
}

/** Fil de discussion d'une demande, du plus ancien au plus récent, avec le formulaire de réponse. */
export function ThreadPanel({ requestId, requestTitle, canWrite, readOnly = false }: ThreadPanelProps) {
  const thread = useMessages(requestId);
  const me = useCurrentUser();
  // L'API renvoie les pages du plus récent au plus ancien : on remet le fil dans l'ordre chronologique.
  const messages = (thread.data?.pages.flatMap((p) => p.items) ?? []).slice().reverse();

  return (
    <SectionCard title="Discussion" icon={MessagesSquare} titleId="titre-discussion">
      {thread.isPending ? (
        <LoadingState label="Chargement des messages" rows={2} />
      ) : thread.error ? (
        <ErrorState message="Impossible de charger la discussion." actionLabel="Réessayer" onAction={() => void thread.refetch()} />
      ) : (
        <>
          {thread.hasNextPage && (
            <Box sx={{ textAlign: 'center', mb: 2 }}>
              <Button size="small" onClick={() => void thread.fetchNextPage()} loading={thread.isFetchingNextPage}>
                Afficher les messages précédents
              </Button>
            </Box>
          )}
          {messages.length === 0 ? (
            <EmptyState
              compact
              icon={MessagesSquare}
              title="Aucun message"
              description={canWrite ? 'Posez une question ou apportez une précision.' : 'Aucun message n’a été échangé sur cette demande.'}
            />
          ) : (
            <Box component="ol" aria-label="Messages" sx={{ p: 0, m: 0, display: 'grid', gap: 2 }}>
              {messages.map((m) => (
                <MessageItem key={m.id} message={m} own={Boolean(me.data && m.author?.id === me.data.id)} />
              ))}
            </Box>
          )}
        </>
      )}

      <Box sx={{ mt: 3, pt: 3, borderTop: 1, borderColor: 'divider' }}>
        {canWrite || readOnly ? (
          <MessageComposer requestId={requestId} requestTitle={requestTitle} disabled={!canWrite} />
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Lock size={icon.sm} aria-hidden="true" />
            Vous consultez cette demande : seuls le demandeur et la personne affectée y échangent.
          </Typography>
        )}
      </Box>
    </SectionCard>
  );
}
