import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import { useId, useState, type FormEvent } from 'react';
import { ApiError, fieldErrors } from '../../api/client';
import { useToast } from '../../components/Toast';
import { t } from '../../i18n';
import { useCancelSeriesRange, useCancelSession } from './api';
import { dateLabel } from './labels';
import type { TimetableSession } from './types';

/**
 * Annulation d'une séance, ou des séances de sa série entre deux dates (vacances, sortie). Le motif est obligatoire ;
 * une séance annulée n'est jamais comptée absente, et elle reste visible comme annulée.
 */
export function CancelDialog({ session, onClose }: { session: TimetableSession; onClose: () => void }) {
  const titleId = useId();
  const toast = useToast();
  const one = useCancelSession();
  const range = useCancelSeriesRange();
  const [scope, setScope] = useState<'one' | 'range'>('one');
  const [reason, setReason] = useState('');
  const [from, setFrom] = useState(session.date);
  const [to, setTo] = useState(session.date);
  const [missing, setMissing] = useState(false);
  const mutation = scope === 'one' ? one : range;
  const errors = fieldErrors(mutation.error);
  const otherError = mutation.error instanceof ApiError && mutation.error.code !== 'VALIDATION_ERROR' ? mutation.error.message : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setMissing(true);
      return;
    }
    setMissing(false);
    if (scope === 'one') {
      one.mutate({ id: session.id, reason: reason.trim() }, { onSuccess: () => (toast.success(t('Séance annulée.')), onClose()) });
    } else if (session.seriesId) {
      range.mutate(
        { id: session.seriesId, from, to, reason: reason.trim() },
        { onSuccess: (r) => (toast.success(t('{count} séances annulées.', { count: r.cancelled })), onClose()) },
      );
    }
  }

  const reasonError = missing ? t('Indiquez le motif de l’annulation.') : errors.reason;
  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={submit} noValidate>
        <DialogTitle id={titleId}>{t('Annuler une séance')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2 }}>
          <DialogContentText>
            {t('{class}, {date}, {start} – {end}. Une séance annulée n’est jamais comptée comme une absence.', {
              class: session.class.name,
              date: dateLabel(session.date),
              start: session.startTime,
              end: session.endTime,
            })}
          </DialogContentText>
          {otherError && (
            <Box role="alert" sx={{ color: 'error.main' }}>
              {otherError}
            </Box>
          )}
          {session.seriesId && (
            <FormControl>
              <FormLabel id={`${titleId}-scope`}>{t('Annuler')}</FormLabel>
              <RadioGroup aria-labelledby={`${titleId}-scope`} value={scope} onChange={(e) => setScope(e.target.value as 'one' | 'range')}>
                <FormControlLabel value="one" control={<Radio />} label={t('Cette séance seulement')} />
                <FormControlLabel value="range" control={<Radio />} label={t('Les séances de la série entre deux dates')} />
              </RadioGroup>
            </FormControl>
          )}
          {scope === 'range' && (
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField type="date" label={t('Du')} value={from} onChange={(e) => setFrom(e.target.value)} required slotProps={{ inputLabel: { shrink: true } }} error={Boolean(errors.from)} helperText={errors.from} />
              <TextField type="date" label={t('Au')} value={to} onChange={(e) => setTo(e.target.value)} required slotProps={{ inputLabel: { shrink: true } }} error={Boolean(errors.to)} helperText={errors.to} />
            </Box>
          )}
          <TextField
            label={t('Motif de l’annulation')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            error={Boolean(reasonError)}
            helperText={reasonError}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('Fermer')}</Button>
          <Button type="submit" variant="contained" color="error" loading={mutation.isPending}>
            {t('Confirmer l’annulation')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
