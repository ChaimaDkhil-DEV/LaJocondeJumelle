import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useEffect, useId, useRef, useState } from 'react';
import { LoadingState } from '../../components/LoadingState';
import { t } from '../../i18n';
import { useAssignees } from './api';

const TEXTS = {
  approve: {
    title: t('Approuver la demande'),
    selectLabel: t('Employé chargé de la demande'),
    required: t('Choisissez l’employé qui réalisera la demande.'),
    confirm: t('Approuver et affecter'),
  },
  reassign: {
    title: t('Réaffecter la demande'),
    selectLabel: t('Nouvel employé'),
    required: t('Choisissez le nouvel employé.'),
    confirm: t('Réaffecter'),
  },
} as const;

interface AssigneeDialogProps {
  open: boolean;
  requestId: string;
  /** Approbation en circuit B, ou réaffectation (US6). */
  mode?: keyof typeof TEXTS;
  /** Affectation automatique (approbation) : l'employé désigné par la catégorie, sans choix. */
  automatic?: boolean;
  /** Message du serveur à afficher (personne prévue indisponible) ; le choix reçoit alors le focus. */
  alert?: string;
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
  alert,
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
  const selectRef = useRef<HTMLDivElement>(null);

  // Personne prévue indisponible : le choix de l'employé devient l'étape suivante, il reçoit le focus.
  useEffect(() => {
    if (alert && !automatic && !assignees.isPending) {
      selectRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus();
    }
  }, [alert, automatic, assignees.isPending]);

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
        {alert && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {alert}
          </Alert>
        )}
        {automatic ? (
          <DialogContentText>
            {t('La demande sera affectée automatiquement à l’employé désigné pour cette catégorie, qui en sera notifié.')}
          </DialogContentText>
        ) : assignees.isPending ? (
          <LoadingState label={t('Chargement des employés')} variant="inline" />
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
            helperText={error ?? t('L’employé choisi sera notifié.')}
            ref={selectRef}
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
        <Button onClick={onClose}>{t('Retour')}</Button>
        <Button variant="contained" onClick={confirm} loading={pending}>
          {automatic ? t('Approuver') : texts.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
