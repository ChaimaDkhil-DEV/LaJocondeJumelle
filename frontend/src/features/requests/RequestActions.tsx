import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Check,
  CircleCheck,
  CirclePlay,
  CircleX,
  ClipboardCheck,
  Flag,
  Lock,
  RotateCcw,
  RotateCw,
  Send,
  ThumbsUp,
  UserRoundCog,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState } from 'react';
import { ApiError, apiFetch } from '../../api/client';
import { visuallyHidden } from '../../components/a11y';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { STATUS_LABELS } from '../../components/StatusBadge';
import { icon } from '../../design/tokens';
import { t } from '../../i18n';
import { PhotoCapture, type UploadedPhoto } from '../thread/PhotoCapture';
import { useCurrentUser } from '../auth/useCurrentUser';
import { requestKeys } from './api';
import { ApprovalDialog } from './ApprovalDialog';
import { PriorityDialog } from './PriorityDialog';
import { isReadOnlyStatus } from './readOnly';
import { ReasonDialog } from './ReasonDialog';
import { ReassignDialog } from './ReassignDialog';
import type { RequestDetail } from './types';

/** Actions proposées (le changement de priorité arrive avec US7). */
const ACTION_LABELS: Record<string, string> = {
  SUBMIT: t('Envoyer la demande'),
  APPROVE: t('Approuver'),
  ACCEPT: t('Accepter la demande'),
  START: t('Commencer'),
  COMPLETE: t('Marquer comme terminée'),
  RESUME: t('Reprendre'),
  CLOSE: t('Clôturer'),
  VALIDATE_FINAL: t('Valider et clôturer'),
  REQUEST_CORRECTION: t('Renvoyer à corriger'),
  DECLINE: t('Refuser'),
  REJECT: t('Refuser'),
  CANCEL: t('Annuler la demande'),
  REASSIGN: t('Réaffecter'),
};

const ACTION_ICONS: Record<string, LucideIcon> = {
  SUBMIT: Send,
  APPROVE: Check,
  ACCEPT: ThumbsUp,
  START: CirclePlay,
  COMPLETE: CircleCheck,
  RESUME: RotateCw,
  CLOSE: Lock,
  VALIDATE_FINAL: ClipboardCheck,
  REQUEST_CORRECTION: RotateCcw,
  DECLINE: CircleX,
  REJECT: CircleX,
  CANCEL: Ban,
  REASSIGN: UserRoundCog,
};

const PRIMARY = new Set(['SUBMIT', 'APPROVE', 'ACCEPT', 'START', 'COMPLETE', 'RESUME', 'CLOSE', 'VALIDATE_FINAL']);
const DESTRUCTIVE = new Set(['CANCEL', 'DECLINE', 'REJECT']);

type Dialogs = 'priority' | 'approve' | 'reassign' | 'refuse' | 'correction' | 'cancel' | 'complete' | null;

/** Fenêtre qui porte chaque action : une réponse ne ferme que la sienne, jamais celle ouverte entre-temps. */
const ACTION_DIALOGS: Record<string, Dialogs> = {
  APPROVE: 'approve',
  REASSIGN: 'reassign',
  DECLINE: 'refuse',
  REJECT: 'refuse',
  REQUEST_CORRECTION: 'correction',
  CANCEL: 'cancel',
  COMPLETE: 'complete',
};

interface ActionBody {
  action: string;
  version: number;
  reason?: string;
  assigneeId?: string;
  proofFileIds?: string[];
}

/** Boutons d'action d'une demande : uniquement ceux de `allowedActions` (calculés par le serveur). */
export function RequestActions({ request }: { request: RequestDetail }) {
  const queryClient = useQueryClient();
  const me = useCurrentUser();
  const completeTitleId = useId();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [feedback, setFeedback] = useState('');
  /** Message du serveur quand la personne prévue n'est plus disponible : l'approbation passe en choix manuel (D8). */
  const [autoUnavailable, setAutoUnavailable] = useState<string | null>(null);

  const detailKey = requestKeys.detail(request.id);

  const priorityMutation = useMutation({
    mutationFn: (priority: string) =>
      apiFetch<RequestDetail>(`/api/requests/${request.id}/priority`, {
        method: 'PATCH',
        body: { priority, version: request.version },
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(detailKey, updated);
      setDialog(null);
      setFeedback(t('Priorité enregistrée.'));
      await queryClient.invalidateQueries({ queryKey: requestKeys.all, refetchType: 'active' });
    },
  });

  const mutation = useMutation({
    mutationFn: (body: ActionBody) =>
      apiFetch<RequestDetail>(`/api/requests/${request.id}/actions`, { method: 'POST', body }),
    onSuccess: async (updated, { action }) => {
      queryClient.setQueryData(detailKey, updated);
      // Le temps réel peut afficher le nouveau statut avant cette réponse : une autre fenêtre est alors peut-être ouverte.
      setDialog((current) => (current === ACTION_DIALOGS[action] ? null : current));
      if (action === 'COMPLETE') setPhotos([]);
      setFeedback(t('Action enregistrée. Statut : {status}.', { status: STATUS_LABELS[updated.status] }));
      await queryClient.invalidateQueries({ queryKey: requestKeys.all, refetchType: 'active' });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'AUTO_ASSIGNEE_UNAVAILABLE') setAutoUnavailable(error.message);
      if (error instanceof ApiError && (error.code === 'STATE_CHANGED' || error.code === 'INVALID_TRANSITION')) {
        setDialog(null);
        void queryClient.fetchQuery({
          queryKey: detailKey,
          queryFn: () => apiFetch<RequestDetail>(`/api/requests/${request.id}`),
          staleTime: 0,
        });
      }
    },
    onSettled: () => setPendingAction(null),
  });

  function send(action: string, extra: Partial<ActionBody> = {}): void {
    setFeedback('');
    setPendingAction(action);
    mutation.mutate({ action, version: request.version, ...extra });
  }

  function onClick(action: string): void {
    mutation.reset();
    if (action === 'APPROVE') {
      setAutoUnavailable(null);
      setDialog('approve');
    }
    else if (action === 'REASSIGN') setDialog('reassign');
    else if (action === 'DECLINE' || action === 'REJECT') setDialog('refuse');
    else if (action === 'REQUEST_CORRECTION') setDialog('correction');
    else if (action === 'CANCEL') setDialog('cancel');
    else if (action === 'COMPLETE' && request.rulesSnapshot.photoRequired) setDialog('complete');
    else send(action);
  }

  const actions = request.allowedActions.filter((a) => a in ACTION_LABELS);
  const canChangePriority = request.allowedActions.includes('CHANGE_PRIORITY');
  const refuseAction = actions.includes('REJECT') ? 'REJECT' : 'DECLINE';
  const anyError = mutation.error ?? priorityMutation.error;
  const error = anyError instanceof ApiError ? anyError.message : anyError ? t('Action impossible.') : null;
  // Un seul bouton principal : la première action « positive » permise ; les autres restent secondaires.
  const primaryAction = actions.find((a) => PRIMARY.has(a));
  // Demande en lecture seule : le demandeur voit ses actions d'édition, désactivées (le serveur les refuse).
  const frozenForRequester = isReadOnlyStatus(request.status) && me.data?.id === request.requester.id;

  return (
    <Box>
      <Typography role="status" aria-live="polite" sx={visuallyHidden}>
        {feedback}
      </Typography>
      {error && !dialog && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {(actions.length > 0 || canChangePriority || frozenForRequester) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {actions.map((action) => {
            const Icon = ACTION_ICONS[action];
            return (
              <Button
                key={action}
                variant={action === primaryAction ? 'contained' : 'outlined'}
                color={DESTRUCTIVE.has(action) ? 'error' : 'primary'}
                startIcon={Icon && <Icon size={icon.sm} aria-hidden="true" />}
                onClick={() => onClick(action)}
                loading={pendingAction === action && !dialog}
              >
                {ACTION_LABELS[action]}
              </Button>
            );
          })}
          {canChangePriority && (
            <Button variant="outlined" startIcon={<Flag size={icon.sm} aria-hidden="true" />} onClick={() => setDialog('priority')}>
              {t('Changer la priorité')}
            </Button>
          )}
          {frozenForRequester && (
            <>
              <Button variant="outlined" disabled startIcon={<Flag size={icon.sm} aria-hidden="true" />}>
                {t('Changer la priorité')}
              </Button>
              <Button variant="outlined" color="error" disabled startIcon={<Ban size={icon.sm} aria-hidden="true" />}>
                {t('Annuler la demande')}
              </Button>
            </>
          )}
        </Box>
      )}

      <PriorityDialog
        open={dialog === 'priority'}
        current={request.priority}
        pending={priorityMutation.isPending}
        onConfirm={(priority) => priorityMutation.mutate(priority)}
        onClose={() => setDialog(null)}
      />
      <ApprovalDialog
        open={dialog === 'approve'}
        requestId={request.id}
        automatic={request.rulesSnapshot.assignmentMode === 'AUTO' && !autoUnavailable}
        alert={autoUnavailable ?? undefined}
        pending={mutation.isPending}
        onConfirm={(assigneeId) => send('APPROVE', assigneeId ? { assigneeId } : {})}
        onClose={() => setDialog(null)}
      />
      <ReassignDialog
        open={dialog === 'reassign'}
        requestId={request.id}
        currentAssigneeId={request.assignee?.id}
        pending={mutation.isPending}
        onConfirm={(assigneeId) => send('REASSIGN', { assigneeId })}
        onClose={() => setDialog(null)}
      />
      <ReasonDialog
        open={dialog === 'refuse'}
        title={t('Refuser la demande')}
        label={t('Motif du refus')}
        requiredMessage={t('Indiquez le motif du refus.')}
        confirmLabel={t('Confirmer le refus')}
        pending={mutation.isPending}
        onConfirm={(reason) => send(refuseAction, { reason })}
        onClose={() => setDialog(null)}
      />
      <ReasonDialog
        open={dialog === 'correction'}
        title={t('Renvoyer à corriger')}
        label={t('Ce qu’il faut corriger')}
        requiredMessage={t('Indiquez ce qu’il faut corriger.')}
        confirmLabel={t('Renvoyer à corriger')}
        pending={mutation.isPending}
        onConfirm={(reason) => send('REQUEST_CORRECTION', { reason })}
        onClose={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog === 'cancel'}
        title={t('Annuler cette demande ?')}
        confirmLabel={t('Oui, annuler la demande')}
        cancelLabel={t('Retour')}
        pending={mutation.isPending}
        onConfirm={() => send('CANCEL')}
        onClose={() => setDialog(null)}
      >
        {t('La demande sera définitivement annulée et le destinataire en sera informé.')}
      </ConfirmDialog>

      <Dialog
        open={dialog === 'complete'}
        onClose={() => setDialog(null)}
        aria-labelledby={completeTitleId}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id={completeTitleId}>{t('Terminer la demande')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {t('Une photo de preuve est obligatoire pour cette catégorie : photographiez le travail réalisé.')}
          </DialogContentText>
          <PhotoCapture value={photos} onChange={setPhotos} />
          {error && dialog === 'complete' && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>{t('Retour')}</Button>
          <Button
            variant="contained"
            startIcon={<CircleCheck size={icon.sm} aria-hidden="true" />}
            disabled={photos.length === 0}
            loading={mutation.isPending}
            onClick={() => send('COMPLETE', { proofFileIds: photos.map((p) => p.id) })}
          >
            {t('Confirmer la fin')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
