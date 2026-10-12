import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useId, useState } from 'react';
import { LoadingState } from '../../components/LoadingState';
import { useAssignees } from './api';

interface ApprovalDialogProps {
  open: boolean;
  requestId: string;
  /** Affectation automatique : l'employé désigné par la catégorie, sans choix. */
  automatic: boolean;
  pending?: boolean;
  onConfirm: (assigneeId?: string) => void;
  onClose: () => void;
}

/** Approbation d'une demande en circuit B, avec le choix de l'employé chargé de la réaliser. */
export function ApprovalDialog({ open, requestId, automatic, pending, onConfirm, onClose }: ApprovalDialogProps) {
  const titleId = useId();
  const assignees = useAssignees(requestId, open && !automatic);
  const [assigneeId, setAssigneeId] = useState('');
  const [error, setError] = useState<string | null>(null);

  function confirm(): void {
    if (automatic) {
      onConfirm();
      return;
    }
    if (!assigneeId) {
      setError('Choisissez l’employé qui réalisera la demande.');
      return;
    }
    onConfirm(assigneeId);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="sm"
      slotProps={{ transition: { onExited: () => (setAssigneeId(''), setError(null)) } }}
    >
      <DialogTitle id={titleId}>Approuver la demande</DialogTitle>
      <DialogContent>
        {automatic ? (
          <DialogContentText>
            La demande sera affectée automatiquement à l’employé désigné pour cette catégorie, qui en sera notifié.
          </DialogContentText>
        ) : assignees.isPending ? (
          <LoadingState label="Chargement des employés" />
        ) : (
          <TextField
            select
            id={`${titleId}-assignee`}
            label="Employé chargé de la demande"
            value={assigneeId}
            onChange={(e) => {
              setAssigneeId(e.target.value);
              setError(null);
            }}
            error={Boolean(error)}
            helperText={error ?? 'L’employé choisi sera notifié.'}
            sx={{ mt: 1 }}
          >
            {(assignees.data ?? []).map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {a.jobTitle ? `${a.displayName} — ${a.jobTitle}` : a.displayName}
              </MenuItem>
            ))}
          </TextField>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Retour</Button>
        <Button variant="contained" onClick={confirm} loading={pending}>
          {automatic ? 'Approuver' : 'Approuver et affecter'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
