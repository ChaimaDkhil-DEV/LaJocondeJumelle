import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Check, CornerUpLeft, X } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { UserAvatar } from '../../components/UserAvatar';
import { icon } from '../../design/tokens';
import { t } from '../../i18n';
import {
  fullName,
  useDecision,
  useOwnMessageActions,
  useToValidate,
  useValidationDetail,
  type ValidationDetail,
} from './api';
import { ChatHeader, ChatShell, ConversationLink, MessageComposer } from './ChatParts';
import {
  CommunicationHistory,
  CommunicationStatusBadge,
  DeliveryList,
  RemarkAndVoice,
} from './CommunicationParts';

const BASE = '/communications/a-valider';

/** Décision sur la version examinée : approuver, renvoyer (motif obligatoire), rejeter (motif obligatoire). */
function DecisionPanel({ m }: { m: ValidationDetail }) {
  const decide = useDecision(m.id);
  const [pending, setPending] = useState<'RETURN' | 'REJECT' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const base = { revision: m.validation.revision, version: m.validation.version };

  async function send(action: 'APPROVE' | 'RETURN' | 'REJECT') {
    if (action !== 'APPROVE' && !reason.trim()) {
      setError(t('Indiquez le motif.'));
      return;
    }
    setError(null);
    try {
      await decide.mutateAsync(
        action === 'APPROVE' ? { action, ...base } : { action, ...base, reason: reason.trim() },
      );
      setPending(null);
      setReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('La décision n’a pas pu être enregistrée.'));
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      {pending === null ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<Check size={icon.sm} aria-hidden="true" />}
            onClick={() => void send('APPROVE')}
            loading={decide.isPending}
          >
            {t('Approuver')}
          </Button>
          <Button
            variant="outlined"
            startIcon={<CornerUpLeft size={icon.sm} aria-hidden="true" />}
            onClick={() => setPending('RETURN')}
          >
            {t('Renvoyer pour correction')}
          </Button>
          <Button
            color="error"
            startIcon={<X size={icon.sm} aria-hidden="true" />}
            onClick={() => setPending('REJECT')}
          >
            {t('Rejeter')}
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gap: 1, maxWidth: 560 }}>
          <TextField
            label={t('Motif')}
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            helperText={t('Le motif est transmis à l’auteur du message.')}
            slotProps={{ htmlInput: { maxLength: 1000 } }}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              color={pending === 'REJECT' ? 'error' : 'primary'}
              onClick={() => void send(pending)}
              loading={decide.isPending}
            >
              {pending === 'RETURN' ? t('Confirmer le renvoi') : t('Confirmer le rejet')}
            </Button>
            <Button color="inherit" onClick={() => setPending(null)}>
              {t('Annuler')}
            </Button>
          </Box>
        </Box>
      )}
      {error && (
        <Typography role="alert" color="error">
          {error}
        </Typography>
      )}
    </Box>
  );
}

/** Message renvoyé : son auteur le corrige puis le soumet de nouveau, ou l'annule. */
function OwnReturned({ m }: { m: ValidationDetail }) {
  const own = useOwnMessageActions(m.id);
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <MessageComposer
        initialText={m.text ?? ''}
        submitLabel={t('Corriger et soumettre')}
        hint={t('La nouvelle version sera validée par un autre membre de l’administration.')}
        onSend={async (input) => {
          const edited = await own.edit.mutateAsync({ ...input, version: m.validation.version });
          await own.submit.mutateAsync(edited.validation.version);
        }}
      />
      <Button
        color="inherit"
        sx={{ justifySelf: 'start' }}
        onClick={() => own.cancel.mutate(m.validation.version)}
        loading={own.cancel.isPending}
      >
        {t('Annuler ce message')}
      </Button>
    </Box>
  );
}

function Detail({ id }: { id: string }) {
  const detail = useValidationDetail(id);
  if (detail.isPending) return <LoadingState variant="detail" />;
  if (detail.isError) return <ErrorState message={t('Ce message est introuvable.')} />;
  const m = detail.data;
  return (
    <>
      <ChatHeader
        backTo={BASE}
        avatar={
          <UserAvatar
            name={fullName(m.conversation.student)}
            id={m.conversation.student.id}
            size="md"
          />
        }
        title={fullName(m.conversation.student)}
        subtitle={`${m.conversation.student.class.name} · ${m.conversation.guardian ? fullName(m.conversation.guardian) : ''}`}
        aside={<CommunicationStatusBadge status={m.status} />}
      />
      <Box sx={{ display: 'grid', gap: 2, p: { xs: 1.5, sm: 2 }, overflowY: 'auto' }}>
        <Typography variant="body2" color="text.secondary">
          {t('Par {author}', { author: m.author?.displayName ?? '' })}
          {m.submittedAt ? ` · ${formatDateTime(m.submittedAt)}` : ''} ·{' '}
          {t('version {number}', { number: m.validation.revision })}
        </Typography>
        <RemarkAndVoice
          text={m.text}
          voiceFileId={m.voice?.fileId ?? null}
          durationSeconds={m.voice?.durationSeconds}
        />
        {m.validation.decisionReason && (
          <Alert severity="info">
            {t('Motif : {reason}', { reason: m.validation.decisionReason })}
          </Alert>
        )}
        {m.status === 'PENDING_ADMIN_VALIDATION' &&
          (m.decidable ? (
            <DecisionPanel m={m} />
          ) : (
            <Alert severity="info">{t('Un autre validateur décide de votre message.')}</Alert>
          ))}
        {m.status === 'RETURNED_FOR_CORRECTION' && m.mine && <OwnReturned m={m} />}
        <Divider />
        <Typography variant="subtitle2" component="h2">
          {t('Historique')}
        </Typography>
        <CommunicationHistory events={m.events} />
        {m.deliveries.length > 0 && (
          <>
            <Typography variant="subtitle2" component="h2">
              {t('Notifications externes')}
            </Typography>
            <DeliveryList deliveries={m.deliveries} />
          </>
        )}
      </Box>
    </>
  );
}

/** « À valider » (017) : messages de l'administration aux parents soumis à un autre validateur. */
export function ValidationView() {
  const { id } = useParams();
  const list = useToValidate();
  const listNode = list.isPending ? (
    <LoadingState />
  ) : list.isError ? (
    <ErrorState
      message={t('Les messages à valider n’ont pas pu être chargés.')}
      onAction={() => void list.refetch()}
    />
  ) : list.data.length === 0 ? (
    <EmptyState compact title={t('Aucun message à valider')} />
  ) : (
    <Box
      component="ul"
      aria-label={t('Messages à valider')}
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0.75,
        display: 'grid',
        gap: 0.25,
        alignContent: 'start',
        overflowY: 'auto',
      }}
    >
      {list.data.map((m) => (
        <ConversationLink
          key={m.id}
          to={`${BASE}/${m.id}`}
          avatar={
            <UserAvatar
              name={fullName(m.conversation.student)}
              id={m.conversation.student.id}
              size="lg"
            />
          }
          title={fullName(m.conversation.student)}
          subtitle={`${m.mine ? t('Votre message') : (m.author?.displayName ?? '')} → ${m.conversation.guardian ? fullName(m.conversation.guardian) : ''}`}
          preview={m.excerpt ?? (m.hasVoice ? t('Message vocal') : '')}
          when={m.submittedAt}
          unread={0}
          selected={m.id === id}
        />
      ))}
    </Box>
  );
  return (
    <ChatShell
      list={listNode}
      detailOpen={Boolean(id)}
      detail={
        id ? <Detail id={id} /> : <EmptyState title={t('Choisissez un message à examiner')} />
      }
    />
  );
}
