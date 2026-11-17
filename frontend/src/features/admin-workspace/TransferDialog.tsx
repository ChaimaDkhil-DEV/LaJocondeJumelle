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
import { useProposeTransfer, useTransferCandidates } from './api';
import type { TransferType } from './types';

interface TransferDialogProps {
  open: boolean;
  type: TransferType;
  request: { id: string; title: string };
  onClose: () => void;
}

const TEXTS: Record<TransferType, { title: string; intro: string; submit: string; done: string }> = {
  DELEGATION_REQUEST: {
    title: t('Proposer une délégation'),
    intro: t('Votre collègue devra accepter. En attendant, la demande reste à votre charge et vous pouvez continuer à la traiter.'),
    submit: t('Envoyer la proposition'),
    done: t('Délégation proposée.'),
  },
  TAKEOVER_REQUEST: {
    title: t('Demander la reprise'),
    intro: t('La personne qui a pris la demande en charge devra accepter. Tant qu’elle n’a pas répondu, rien ne change.'),
    submit: t('Envoyer la demande'),
    done: t('Demande de reprise envoyée.'),
  },
};

/**
 * Envoi d'une proposition de transfert (018, US2 et US3). Délégation : le destinataire se choisit parmi
 * les collègues que le serveur propose, le motif est obligatoire. Demande de reprise : motif seul — le
 * destinataire n'est jamais transmis, le serveur l'adresse à la personne qui a pris la demande en charge.
 */
export function TransferDialog({ open, type, request, onClose }: TransferDialogProps) {
  const titleId = useId();
  const toast = useToast();
  const delegation = type === 'DELEGATION_REQUEST';
  const candidates = useTransferCandidates(request.id, open && delegation);
  const propose = useProposeTransfer(request.id);
  const [recipientId, setRecipientId] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ recipient?: string; reason?: string }>({});
  const texts = TEXTS[type];

  const reset = () => {
    setRecipientId('');
    setReason('');
    setErrors({});
    propose.reset();
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = () => {
    const found = {
      recipient: delegation && !recipientId ? t('Choisissez l’administrateur à qui confier la demande.') : undefined,
      reason: reason.trim() ? undefined : t('Le motif est obligatoire.'),
    };
    setErrors(found);
    if (found.recipient || found.reason) return;
    propose.mutate(
      { type, reason: reason.trim(), ...(delegation ? { recipientId } : {}) },
      {
        onSuccess: () => {
          toast.success(texts.done);
          close();
        },
      },
    );
  };

  const serverError = propose.isError ? (propose.error instanceof ApiError ? propose.error.message : t('L’envoi a échoué. Réessayez.')) : null;
  const noCandidate = delegation && candidates.data?.length === 0;

  return (
    <Dialog open={open} onClose={close} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <DialogTitle id={titleId}>{texts.title}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div" sx={{ mb: 2 }}>
          <strong>{request.title}</strong>
          <br />
          {texts.intro}
        </DialogContentText>
        {delegation && candidates.isError && <Alert severity="error">{t('Impossible de charger la liste de vos collègues.')}</Alert>}
        {noCandidate && <Alert severity="info">{t('Aucun autre administrateur actif ne s’occupe de cette catégorie.')}</Alert>}
        {delegation && !noCandidate && (
          <TextField
            select
            label={t('Administrateur destinataire')}
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            error={Boolean(errors.recipient)}
            helperText={errors.recipient}
            disabled={candidates.isPending}
            fullWidth
            required
            sx={{ mt: 1, mb: 2 }}
          >
            {(candidates.data ?? []).map((candidate) => (
              <MenuItem key={candidate.id} value={candidate.id}>
                {candidate.jobTitle ? `${candidate.displayName} — ${candidate.jobTitle}` : candidate.displayName}
              </MenuItem>
            ))}
          </TextField>
        )}
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
          sx={{ mt: delegation ? 0 : 1 }}
        />
        {serverError && (
          <Alert severity="error" role="alert" sx={{ mt: 2 }}>
            {serverError}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{t('Annuler')}</Button>
        <Button variant="contained" loading={propose.isPending} disabled={noCandidate} onClick={submit}>
          {texts.submit}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
