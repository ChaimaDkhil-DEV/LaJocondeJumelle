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
import { useReassignOptions, useReassignOwner, type SupervisedRequest } from './supervisionApi';

/** Valeur du choix « personne » : la demande retourne dans la file commune. */
const RELEASE = '__release__';

interface ReassignOwnerDialogProps {
  request: SupervisedRequest;
  onClose: () => void;
}

/**
 * Réattribution administrative (018, FR-028) : le super administrateur confie la demande à un autre
 * administrateur, ou la remet dans la file commune, sans l'accord des intéressés mais avec un motif
 * obligatoire.
 *
 * Tout ce que le dialogue propose vient du serveur, lu à l'ouverture : qui a la demande à sa charge
 * maintenant (la ligne affichée peut dater), et à qui elle peut être confiée — comptes actifs, admins de sa
 * catégorie, sans la personne qui l'a déjà. Tant que cette réponse n'est pas arrivée, ou si elle a échoué,
 * rien n'est sélectionnable ni envoyable.
 */
export function ReassignOwnerDialog({ request, onClose }: ReassignOwnerDialogProps) {
  const titleId = useId();
  const toast = useToast();
  const options = useReassignOptions(request.id);
  const reassign = useReassignOwner(request.id);
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ target?: string; reason?: string }>({});

  // Réponse utilisable : arrivée, et pas en cours de rechargement (une liste périmée ne se choisit pas).
  const ready = options.isSuccess && !options.isFetching;
  const owner = options.data?.adminOwner ?? null;
  const candidates = options.data?.candidates ?? [];
  const finished = ready && !options.data.reassignable;
  // Demande libre sans aucun administrateur éligible : il n'y a rien à choisir (la libérer n'a pas de sens).
  const nothingToChoose = ready && !finished && candidates.length === 0 && owner === null;
  const blocked = !ready || finished || nothingToChoose;
  // Un choix qui n'existe plus dans la réponse du serveur (rechargée entre-temps) n'est jamais envoyé.
  const selected = target === RELEASE ? (owner ? RELEASE : '') : candidates.some((admin) => admin.id === target) ? target : '';

  const submit = () => {
    const found = {
      target: selected ? undefined : t('Choisissez un administrateur, ou la remise dans la file commune.'),
      reason: reason.trim() ? undefined : t('Le motif est obligatoire.'),
    };
    setErrors(found);
    if (found.target || found.reason) return;
    reassign.mutate(
      { adminId: selected === RELEASE ? null : selected, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(selected === RELEASE ? t('Demande remise dans la file commune.') : t('Demande réattribuée.'));
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
          {ready && (owner ? t('Actuellement prise en charge par {name}.', { name: owner.displayName }) : t('Actuellement dans la file commune, sans personne en charge.'))}{' '}
          {t('Le changement s’applique tout de suite, sans l’accord des administrateurs concernés ; ils en sont prévenus et l’opération est tracée.')}
        </DialogContentText>
        {options.isError && !options.isFetching && (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            action={
              <Button color="inherit" size="small" onClick={() => void options.refetch()}>
                {t('Réessayer')}
              </Button>
            }
          >
            {t('Impossible de charger les administrateurs de cette catégorie.')}
          </Alert>
        )}
        {finished && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('Cette demande est terminée : elle ne peut plus être réattribuée.')}
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
          value={selected}
          onChange={(e) => setTarget(e.target.value)}
          error={Boolean(errors.target) && !blocked}
          helperText={blocked ? undefined : errors.target}
          disabled={blocked}
          fullWidth
          required
          sx={{ mt: 1, mb: 2 }}
        >
          {candidates.map((admin) => (
            <MenuItem key={admin.id} value={admin.id}>
              {admin.jobTitle ? `${admin.displayName} — ${admin.jobTitle}` : admin.displayName}
            </MenuItem>
          ))}
          {owner && <MenuItem value={RELEASE}>{t('Remettre dans la file commune (personne)')}</MenuItem>}
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
        <Button variant="contained" loading={reassign.isPending} disabled={blocked} onClick={submit}>
          {t('Réattribuer')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
