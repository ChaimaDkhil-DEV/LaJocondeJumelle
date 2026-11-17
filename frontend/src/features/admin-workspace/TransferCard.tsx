import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Check, Hourglass, Undo2, X } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { ApiError, serverNow } from '../../api/client';
import { Badge } from '../../components/Badge';
import { formatRemaining } from '../../components/Countdown';
import { formatDateTime } from '../../components/format';
import { useToast } from '../../components/Toast';
import { font, icon, type Tone } from '../../design/tokens';
import { t } from '../../i18n';
import { useAnswerTransfer } from './api';
import { CANCEL_CAUSE_LABELS, TRANSFER_STATUS_LABELS, TRANSFER_TYPE_LABELS } from './labels';
import type { Transfer, TransferStatus } from './types';

const STATUS_TONE: Record<TransferStatus, Tone> = {
  PENDING: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'error',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
};

type Action = 'accept' | 'reject' | 'cancel';

const DIALOGS: Record<Action, { title: string; confirm: string; body: string; done: string }> = {
  accept: {
    title: t('Accepter cette proposition ?'),
    confirm: t('Accepter'),
    body: t('La demande changera de mains dès votre confirmation.'),
    done: t('Proposition acceptée.'),
  },
  reject: {
    title: t('Refuser cette proposition ?'),
    confirm: t('Confirmer le refus'),
    body: t('La demande restera à la charge de la même personne.'),
    done: t('Proposition refusée.'),
  },
  cancel: {
    title: t('Annuler cette proposition ?'),
    confirm: t('Annuler la proposition'),
    body: t('Votre collègue n’aura plus à y répondre. Rien d’autre ne change.'),
    done: t('Proposition annulée.'),
  },
};

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="dt" variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
        {children}
      </Typography>
    </Box>
  );
}

/** Temps restant pour répondre, rafraîchi chaque demi-minute ; rien une fois le délai atteint. */
function TimeLeft({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => serverNow().getTime());
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow().getTime()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const left = Date.parse(expiresAt) - now;
  return (
    <Badge tone="warning" icon={Hourglass}>
      {left > 0 ? t('Réponse attendue sous {delay}', { delay: formatRemaining(left) }) : t('Délai de réponse dépassé')}
    </Badge>
  );
}

/**
 * Une proposition de transfert (018, FR-019) : qui propose quoi à qui, pour quelle demande, pourquoi,
 * depuis quand et jusqu'à quand. Les actions proposées sont celles que le serveur autorise à
 * l'utilisateur ; chacune demande une confirmation. « Accepter » et « Refuser » se distinguent par leur
 * libellé et leur icône, pas seulement par la couleur.
 */
export function TransferCard({ transfer, headingLevel = 'h4' }: { transfer: Transfer; headingLevel?: 'h3' | 'h4' }) {
  const titleId = useId();
  const dialogTitleId = useId();
  const toast = useToast();
  const answer = useAnswerTransfer();
  const [action, setAction] = useState<Action | null>(null);
  const [responseReason, setResponseReason] = useState('');
  const title = transfer.request.title;
  const pending = transfer.status === 'PENDING';

  const close = () => {
    setAction(null);
    setResponseReason('');
    answer.reset();
  };

  const confirm = () => {
    if (!action) return;
    const done = DIALOGS[action].done;
    const reason = responseReason.trim();
    answer.mutate(action === 'reject' ? { id: transfer.id, action, ...(reason ? { responseReason: reason } : {}) } : { id: transfer.id, action }, {
      onSuccess: () => {
        toast.success(done);
        close();
      },
    });
  };

  const error = answer.isError ? (answer.error instanceof ApiError ? answer.error.message : t('L’action a échoué. Réessayez.')) : null;

  return (
    <Paper component="article" aria-labelledby={titleId} variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 1.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <Badge tone="info">{TRANSFER_TYPE_LABELS[transfer.type]}</Badge>
        <Badge tone={STATUS_TONE[transfer.status]}>{TRANSFER_STATUS_LABELS[transfer.status]}</Badge>
        {pending && <TimeLeft expiresAt={transfer.expiresAt} />}
      </Box>

      <Typography id={titleId} component={headingLevel} variant="subtitle1" sx={{ fontWeight: font.semibold, overflowWrap: 'anywhere' }}>
        <Link component={RouterLink} to={`/demandes/${transfer.request.id}`} color="inherit">
          {title}
        </Link>
      </Typography>

      <Box component="dl" sx={{ m: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(3, minmax(0, 1fr))' } }}>
        <Meta label={t('Proposée par')}>{transfer.initiator.displayName}</Meta>
        <Meta label={t('Adressée à')}>{transfer.recipient.displayName}</Meta>
        <Meta label={t('Envoyée le')}>
          <time dateTime={transfer.createdAt}>{formatDateTime(transfer.createdAt)}</time>
        </Meta>
      </Box>

      <Box component="dl" sx={{ m: 0, display: 'grid', gap: 1 }}>
        <Meta label={t('Motif')}>{transfer.reason}</Meta>
        {transfer.responseReason && <Meta label={t('Motif du refus')}>{transfer.responseReason}</Meta>}
      </Box>
      {transfer.status === 'CANCELLED' && transfer.cancelCause && (
        <Typography variant="body2" color="text.secondary">
          {CANCEL_CAUSE_LABELS[transfer.cancelCause]}
        </Typography>
      )}
      {transfer.status === 'EXPIRED' && (
        <Typography variant="body2" color="text.secondary">
          {t('Personne n’a répondu dans le délai : la demande n’a pas changé de mains.')}
        </Typography>
      )}

      {(transfer.canAccept || transfer.canReject || transfer.canCancel) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: { sm: 'flex-end' } }}>
          {transfer.canReject && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<X size={icon.sm} aria-hidden="true" />}
              onClick={() => setAction('reject')}
              aria-label={`${t('Refuser')} : ${title}`}
              sx={{ minHeight: 44, flex: { xs: '1 1 130px', sm: 'none' } }}
            >
              {t('Refuser')}
            </Button>
          )}
          {transfer.canAccept && (
            <Button
              variant="contained"
              startIcon={<Check size={icon.sm} aria-hidden="true" />}
              onClick={() => setAction('accept')}
              aria-label={`${t('Accepter')} : ${title}`}
              sx={{ minHeight: 44, flex: { xs: '1 1 130px', sm: 'none' } }}
            >
              {t('Accepter')}
            </Button>
          )}
          {transfer.canCancel && (
            <Button
              variant="outlined"
              startIcon={<Undo2 size={icon.sm} aria-hidden="true" />}
              onClick={() => setAction('cancel')}
              aria-label={`${t('Annuler la proposition')} : ${title}`}
              sx={{ minHeight: 44, flex: { xs: '1 1 200px', sm: 'none' } }}
            >
              {t('Annuler la proposition')}
            </Button>
          )}
        </Box>
      )}

      <Dialog open={action !== null} onClose={close} aria-labelledby={dialogTitleId} fullWidth maxWidth="xs">
        {action && (
          <>
            <DialogTitle id={dialogTitleId}>{DIALOGS[action].title}</DialogTitle>
            <DialogContent>
              <DialogContentText component="div">
                <strong>
                  {TRANSFER_TYPE_LABELS[transfer.type]} — {title}
                </strong>
                <br />
                {DIALOGS[action].body}
              </DialogContentText>
              {action === 'reject' && (
                <TextField
                  label={t('Motif du refus (facultatif)')}
                  value={responseReason}
                  onChange={(e) => setResponseReason(e.target.value)}
                  multiline
                  minRows={2}
                  fullWidth
                  slotProps={{ htmlInput: { maxLength: 500 } }}
                  sx={{ mt: 2 }}
                />
              )}
              {error && (
                <Alert severity="error" role="alert" sx={{ mt: 2 }}>
                  {error}
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={close}>{error ? t('Fermer') : t('Retour')}</Button>
              {!error && (
                <Button variant="contained" color={action === 'accept' ? 'primary' : 'error'} loading={answer.isPending} onClick={confirm}>
                  {DIALOGS[action].confirm}
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Paper>
  );
}
