import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import { useId, useState } from 'react';
import type { Priority } from '../../api/types';
import { PRIORITY_LABELS } from '../../components/PriorityChip';

interface PriorityDialogProps {
  open: boolean;
  current: Priority;
  pending?: boolean;
  onConfirm: (priority: Priority) => void;
  onClose: () => void;
}

/** Changement de priorité (tracé dans l'historique ; les échéances en cours ne changent pas). */
export function PriorityDialog({ open, current, pending, onConfirm, onClose }: PriorityDialogProps) {
  const titleId = useId();
  const [priority, setPriority] = useState<Priority>(current);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={titleId}
      slotProps={{ transition: { onEnter: () => setPriority(current) } }}
    >
      <DialogTitle id={titleId}>Changer la priorité</DialogTitle>
      <DialogContent>
        <FormControl component="fieldset">
          <FormLabel component="legend">Priorité</FormLabel>
          <RadioGroup value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
              <FormControlLabel key={p} value={p} control={<Radio />} label={PRIORITY_LABELS[p]} />
            ))}
          </RadioGroup>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Retour</Button>
        <Button variant="contained" disabled={priority === current} loading={pending} onClick={() => onConfirm(priority)}>
          Enregistrer la priorité
        </Button>
      </DialogActions>
    </Dialog>
  );
}
