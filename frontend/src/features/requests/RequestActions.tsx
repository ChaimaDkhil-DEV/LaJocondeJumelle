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
import { useId, useState } from 'react';
import { ApiError, apiFetch } from '../../api/client';
import { STATUS_LABELS } from '../../components/StatusChip';
import { PhotoCapture, type UploadedPhoto } from '../thread/PhotoCapture';
import { requestKeys } from './api';
import { ApprovalDialog } from './ApprovalDialog';
import { ReasonDialog } from './ReasonDialog';
import type { RequestDetail } from './types';

/** Actions proposées (réaffectation et priorité arrivent avec US6 et US7). */
const ACTION_LABELS: Record<string, string> = {
  SUBMIT: 'Envoyer la demande',
  APPROVE: 'Approuver',
  ACCEPT: 'Accepter la demande',
  START: 'Commencer',
  COMPLETE: 'Marquer comme terminée',
  RESUME: 'Reprendre',
  CLOSE: 'Clôturer',
  VALIDATE_FINAL: 'Valider et clôturer',
  REQUEST_CORRECTION: 'Renvoyer à corriger',
  DECLINE: 'Refuser',
  REJECT: 'Refuser',
  CANCEL: 'Annuler la demande',
};

const PRIMARY = new Set(['SUBMIT', 'APPROVE', 'ACCEPT', 'START', 'COMPLETE', 'RESUME', 'CLOSE', 'VALIDATE_FINAL']);

type Dialogs = 'approve' | 'refuse' | 'correction' | 'cancel' | 'complete' | null;

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
  const cancelTitleId = useId();
  const completeTitleId = useId();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [feedback, setFeedback] = useState('');

  const detailKey = requestKeys.detail(request.id);

  const mutation = useMutation({
    mutationFn: (body: ActionBody) =>
      apiFetch<RequestDetail>(`/api/requests/${request.id}/actions`, { method: 'POST', body }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(detailKey, updated);
      setDialog(null);
      setPhotos([]);
      setFeedback(`Action enregistrée. Statut : ${STATUS_LABELS[updated.status]}.`);
      await queryClient.invalidateQueries({ queryKey: requestKeys.all, refetchType: 'active' });
    },
    onError: (error) => {
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
    if (action === 'APPROVE') setDialog('approve');
    else if (action === 'DECLINE' || action === 'REJECT') setDialog('refuse');
    else if (action === 'REQUEST_CORRECTION') setDialog('correction');
    else if (action === 'CANCEL') setDialog('cancel');
    else if (action === 'COMPLETE' && request.rulesSnapshot.photoRequired) setDialog('complete');
    else send(action);
  }

  const actions = request.allowedActions.filter((a) => a in ACTION_LABELS);
  const refuseAction = actions.includes('REJECT') ? 'REJECT' : 'DECLINE';
  const error = mutation.error instanceof ApiError ? mutation.error.message : mutation.error ? 'Action impossible.' : null;

  return (
    <Box>
      <Typography role="status" aria-live="polite" sx={{ position: 'absolute', left: -10_000 }}>
        {feedback}
      </Typography>
      {error && !dialog && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {actions.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {actions.map((action) => (
            <Button
              key={action}
              variant={PRIMARY.has(action) ? 'contained' : 'outlined'}
              color={action === 'CANCEL' || action === 'DECLINE' || action === 'REJECT' ? 'error' : 'primary'}
              onClick={() => onClick(action)}
              loading={pendingAction === action && !dialog}
            >
              {ACTION_LABELS[action]}
            </Button>
          ))}
        </Box>
      )}

      <ApprovalDialog
        open={dialog === 'approve'}
        requestId={request.id}
        automatic={request.rulesSnapshot.assignmentMode === 'AUTO'}
        pending={mutation.isPending}
        onConfirm={(assigneeId) => send('APPROVE', assigneeId ? { assigneeId } : {})}
        onClose={() => setDialog(null)}
      />
      <ReasonDialog
        open={dialog === 'refuse'}
        title="Refuser la demande"
        label="Motif du refus"
        requiredMessage="Indiquez le motif du refus."
        confirmLabel="Confirmer le refus"
        pending={mutation.isPending}
        onConfirm={(reason) => send(refuseAction, { reason })}
        onClose={() => setDialog(null)}
      />
      <ReasonDialog
        open={dialog === 'correction'}
        title="Renvoyer à corriger"
        label="Ce qu’il faut corriger"
        requiredMessage="Indiquez ce qu’il faut corriger."
        confirmLabel="Renvoyer à corriger"
        pending={mutation.isPending}
        onConfirm={(reason) => send('REQUEST_CORRECTION', { reason })}
        onClose={() => setDialog(null)}
      />

      <Dialog open={dialog === 'cancel'} onClose={() => setDialog(null)} aria-labelledby={cancelTitleId}>
        <DialogTitle id={cancelTitleId}>Annuler cette demande ?</DialogTitle>
        <DialogContent>
          <DialogContentText>La demande sera définitivement annulée et le destinataire en sera informé.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Retour</Button>
          <Button color="error" variant="contained" onClick={() => send('CANCEL')} loading={mutation.isPending}>
            Oui, annuler la demande
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={dialog === 'complete'}
        onClose={() => setDialog(null)}
        aria-labelledby={completeTitleId}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id={completeTitleId}>Terminer la demande</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Une photo de preuve est obligatoire pour cette catégorie : photographiez le travail réalisé.
          </DialogContentText>
          <PhotoCapture value={photos} onChange={setPhotos} />
          {error && dialog === 'complete' && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Retour</Button>
          <Button
            variant="contained"
            disabled={photos.length === 0}
            loading={mutation.isPending}
            onClick={() => send('COMPLETE', { proofFileIds: photos.map((p) => p.id) })}
          >
            Confirmer la fin
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
