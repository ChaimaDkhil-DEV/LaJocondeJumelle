import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { useId } from 'react';
import { ApiError } from '../../api/client';
import { t } from '../../i18n';
import { useClaimRequest } from './api';

interface ClaimDialogProps {
  /** Demande à prendre en charge ; null : dialogue fermé. */
  request: { id: string; title: string; version: number } | null;
  onClose: () => void;
  /** Appelé après la prise en charge réussie. */
  onClaimed: (id: string) => void;
}

/**
 * Confirmation avant « Prendre en charge » (FR-025). Ce n'est pas une action destructive : bouton
 * principal ordinaire, sans le rouge de ConfirmDialog. Si un collègue a été plus rapide, le message du
 * serveur est affiché et il ne reste qu'à fermer.
 */
export function ClaimDialog({ request, onClose, onClaimed }: ClaimDialogProps) {
  const titleId = useId();
  const claim = useClaimRequest();
  const failed = claim.isError;
  const message = claim.error instanceof ApiError ? claim.error.message : t('La prise en charge a échoué. Réessayez.');

  const close = () => {
    claim.reset();
    onClose();
  };

  return (
    <Dialog open={request !== null} onClose={close} aria-labelledby={titleId} fullWidth maxWidth="xs">
      <DialogTitle id={titleId}>{t('Prendre en charge cette demande ?')}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">
          <strong>{request?.title}</strong>
          <br />
          {t('Elle sera à votre charge : elle quittera la file commune et vos collègues la verront en lecture seule.')}
        </DialogContentText>
        {failed && (
          <Alert severity="error" role="alert" sx={{ mt: 2 }}>
            {message}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{failed ? t('Fermer') : t('Annuler')}</Button>
        {!failed && (
          <Button
            variant="contained"
            loading={claim.isPending}
            onClick={() => {
              if (!request) return;
              claim.mutate({ id: request.id, version: request.version }, { onSuccess: () => onClaimed(request.id) });
            }}
          >
            {t('Prendre en charge')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
