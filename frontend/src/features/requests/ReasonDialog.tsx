import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useId, useState } from 'react';

interface ReasonDialogProps {
  open: boolean;
  title: string;
  label: string;
  /** Message si le motif manque ; sans objet quand `optional` est vrai. */
  requiredMessage?: string;
  /** Motif facultatif : la confirmation est possible sans saisie. */
  optional?: boolean;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

/** Saisie d'un motif ou d'un commentaire, obligatoire (refus, renvoi à corriger) ou facultatif. */
export function ReasonDialog({
  open,
  title,
  label,
  requiredMessage = 'Le motif est obligatoire.',
  optional = false,
  confirmLabel,
  pending,
  onConfirm,
  onClose,
}: ReasonDialogProps) {
  const titleId = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function confirm(): void {
    if (!optional && !reason.trim()) {
      setError(requiredMessage);
      return;
    }
    onConfirm(reason.trim());
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="sm"
      slotProps={{ transition: { onExited: () => (setReason(''), setError(null)) } }}
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>
        <TextField
          id={`${titleId}-reason`}
          label={label}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={Boolean(error)}
          helperText={error}
          multiline
          minRows={3}
          slotProps={{ htmlInput: { maxLength: 1000 } }}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Retour</Button>
        <Button variant="contained" onClick={confirm} loading={pending}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
