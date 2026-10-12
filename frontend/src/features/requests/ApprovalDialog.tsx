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

const TEXTS = {
  approve: {
    title: 'Approuver la demande',
    selectLabel: 'Employé chargé de la demande',
    required: 'Choisissez l’employé qui réalisera la demande.',
    confirm: 'Approuver et affecter',
  },
  reassign: {
    title: 'Réaffecter la demande',
    selectLabel: 'Nouvel employé',
    required: 'Choisissez le nouvel employé.',
    confirm: 'Réaffecter',
  },
} as const;

interface AssigneeDialogProps {
  open: boolean;
  requestId: string;
  /** Approbation en circuit B, ou réaffectation (US6). */
  mode?: keyof typeof TEXTS;
  /** Affectation automatique (approbation) : l'employé désigné par la catégorie, sans choix. */
  automatic?: boolean;
  /** Employé actuel, exclu de la liste lors d'une réaffectation. */
  excludeId?: string;
  pending?: boolean;
  onConfirm: (assigneeId?: string) => void;
  onClose: () => void;
}

/** Choix de l'employé chargé de la demande : approbation en circuit B ou réaffectation. */
export function ApprovalDialog({
  open,
  requestId,
  mode = 'approve',
  automatic = false,
  excludeId,
  pending,
  onConfirm,
  onClose,
}: AssigneeDialogProps) {
  const titleId = useId();
  const texts = TEXTS[mode];
  const assignees = useAssignees(requestId, open && !automatic);
  const [assigneeId, setAssigneeId] = useState('');
  const [error, setError] = useState<string | null>(null);

  function confirm(): void {
    if (automatic) {
      onConfirm();
      return;
    }
    if (!assigneeId) {
      setError(texts.required);
      return;
    }
    onConfirm(assigneeId);
  }

  const options = (assignees.data ?? []).filter((a) => a.id !== excludeId);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="sm"
      slotProps={{ transition: { onExited: () => (setAssigneeId(''), setError(null)) } }}
    >
      <DialogTitle id={titleId}>{texts.title}</DialogTitle>
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
            label={texts.selectLabel}
            value={assigneeId}
            onChange={(e) => {
              setAssigneeId(e.target.value);
              setError(null);
            }}
            error={Boolean(error)}
            helperText={error ?? 'L’employé choisi sera notifié.'}
            sx={{ mt: 1 }}
          >
            {options.map((a) => (
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
          {automatic ? 'Approuver' : texts.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
