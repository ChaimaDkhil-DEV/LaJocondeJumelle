import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useId, useState } from 'react';
import { ApiError } from '../../api/client';
import { useToast } from '../../components/Toast';
import { t } from '../../i18n';
import { useReassignCandidates, useReassignOwner, type SupervisedRequest } from './supervisionApi';

/** Valeur du choix « personne » : la demande retourne dans la file commune. */
const RELEASE = '__release__';

interface ReassignOwnerDialogProps {
  request: SupervisedRequest;
  onClose: () => void;
}

/**
 * Réattribution administrative (018, FR-028) : le super administrateur confie la demande à un autre
 * administrateur, ou la remet dans la file commune, sans l'accord des intéressés mais avec un motif
 * obligatoire. Les administrateurs proposés sont ceux que le serveur déclare éligibles pour cette demande :
 * comptes actifs, admins de sa catégorie, sans la personne qui l'a déjà. C'est la règle que la réattribution
 * applique : un choix proposé ici n'est jamais refusé pour inéligibilité.
 */
export function ReassignOwnerDialog({ request, onClose }: ReassignOwnerDialogProps) {
  const titleId = useId();
  const toast = useToast();
  const eligible = useReassignCandidates(request.id);
  const reassign = useReassignOwner(request.id);
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ target?: string; reason?: string }>({});

  const candidates = eligible.data ?? [];
  // Demande libre sans aucun administrateur éligible : il n'y a rien à choisir (la libérer n'a pas de sens).
  const nothingToChoose = eligible.isSuccess && candidates.length === 0 && !request.adminOwner;

  const submit = () => {
    const found = {
      target: target ? undefined : t('Choisissez un administrateur, ou la remise dans la file commune.'),
      reason: reason.trim() ? undefined : t('Le motif est obligatoire.'),
    };
    setErrors(found);
    if (found.target || found.reason) return;
    reassign.mutate(
      { adminId: target === RELEASE ? null : target, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(target === RELEASE ? t('Demande remise dans la file commune.') : t('Demande réattribuée.'));
          onClose();
        },
      },
    );
  };

  const serverError = reassign.isError ? (reassign.error instanceof ApiError ? reassign.error.message : t('La réattribution a échoué. Réessayez.')) : null;

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <DialogTitle id={titleId}>{t('Réattribuer la demande')}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div" sx={{ mb: 2 }}>
          <strong>{request.title}</strong>
          <br />
          {request.adminOwner
            ? t('Actuellement prise en charge par {name}.', { name: request.adminOwner.displayName })
            : t('Actuellement dans la file commune, sans personne en charge.')}{' '}
          {t('Le changement s’applique tout de suite, sans l’accord des administrateurs concernés ; ils en sont prévenus et l’opération est tracée.')}
        </DialogContentText>
        {eligible.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {t('Impossible de charger les administrateurs de cette catégorie.')}
          </Alert>
        )}
        {nothingToChoose && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('Aucun administrateur actif ne s’occupe de la catégorie de cette demande.')}
          </Alert>
        )}
        <TextField
          select
          label={t('Nouvelle attribution')}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          error={Boolean(errors.target)}
          helperText={errors.target}
          disabled={eligible.isPending || nothingToChoose}
          fullWidth
          required
          sx={{ mt: 1, mb: 2 }}
        >
          {candidates.map((admin) => (
            <MenuItem key={admin.id} value={admin.id}>
              {admin.jobTitle ? `${admin.displayName} — ${admin.jobTitle}` : admin.displayName}
            </MenuItem>
          ))}
          {request.adminOwner && <MenuItem value={RELEASE}>{t('Remettre dans la file commune (personne)')}</MenuItem>}
        </TextField>
        <TextField
          label={t('Motif')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={Boolean(errors.reason)}
          helperText={errors.reason}
          multiline
          minRows={3}
          fullWidth
          required
          slotProps={{ htmlInput: { maxLength: 500 } }}
        />
        {serverError && (
          <Alert severity="error" role="alert" sx={{ mt: 2 }}>
            {serverError}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Annuler')}</Button>
        <Button variant="contained" loading={reassign.isPending} disabled={nothingToChoose} onClick={submit}>
          {t('Réattribuer')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
