import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Pencil } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { ApiError, fieldErrors } from '../../api/client';
import { useToast } from '../../components/Toast';
import { icon } from '../../design/tokens';
import { useCoverageProfile, useFormOptions, useUpdateCoverage, type UpdateCoverageInput } from './api';
import type { CoverageDetail, ModifiableField } from './types';

type Values = { classId: string; date: string; startTime: string; endTime: string };
type Errors = Partial<Record<ModifiableField, string>>;

/** Date (AAAA-MM-JJ) et heure (HH:MM) d'un instant dans le fuseau de l'école. */
function schoolValues(startAt: string, plannedEndAt: string | null, timeZone: string): Omit<Values, 'classId'> {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(startAt));
  const time = (value: string) =>
    new Intl.DateTimeFormat('fr-FR', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
      new Date(value),
    );
  return { date, startTime: time(startAt), endTime: plannedEndAt ? time(plannedEndAt) : '' };
}

/**
 * « Modifier » (spec 006) : admins, quand le serveur indique des champs modifiables. Les champs non
 * permis dans le statut (pendant la présence : tout sauf l'heure de fin) sont désactivés.
 */
export function EditCoverageButton({ detail }: { detail: CoverageDetail }) {
  const [open, setOpen] = useState(false);
  if (detail.modifiableFields.length === 0) return null;
  return (
    <>
      <Button variant="outlined" startIcon={<Pencil size={icon.sm} aria-hidden="true" />} onClick={() => setOpen(true)}>
        Modifier
      </Button>
      {open && <EditCoverageDialog detail={detail} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditCoverageDialog({ detail, onClose }: { detail: CoverageDetail; onClose: () => void }) {
  const titleId = useId();
  const toast = useToast();
  const timeZone = useCoverageProfile().data?.schoolDates.timezone ?? 'Europe/Paris';
  const classes = useFormOptions().data?.classes ?? [];
  const [initial] = useState<Values>(() => ({
    classId: detail.class.id,
    ...schoolValues(detail.startAt, detail.plannedEndAt, timeZone),
  }));
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [general, setGeneral] = useState<string | null>(null);
  const editable = (field: ModifiableField) => detail.modifiableFields.includes(field);
  const onSiteOnly = !editable('date') && editable('endTime');

  // Retours au niveau de la mutation : appelés même si le dialogue est démonté avant la réponse.
  const update = useUpdateCoverage(detail.id, {
    onSuccess: () => {
      toast.success('Affectation modifiée.');
      onClose();
    },
    onError: (error) => {
      const byField = fieldErrors(error) as Errors;
      if (Object.keys(byField).length > 0) setErrors(byField);
      else if (error instanceof ApiError && error.code === 'INVALID_RANGE') setErrors({ endTime: error.message });
      else setGeneral(error instanceof ApiError ? error.message : 'La modification n’a pas pu être enregistrée. Réessayez.');
    },
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setErrors({});
    setGeneral(null);
    const input: UpdateCoverageInput = { version: detail.version };
    for (const field of ['classId', 'date', 'startTime', 'endTime'] as const) {
      if (editable(field) && values[field] !== initial[field]) input[field] = values[field];
    }
    if (Object.keys(input).length === 1) {
      onClose();
      return;
    }
    update.mutate(input);
  }

  const field = (name: 'startTime' | 'endTime', label: string) => (
    <TextField
      label={label}
      value={values[name]}
      onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
      disabled={!editable(name)}
      error={Boolean(errors[name])}
      helperText={errors[name] ?? ' '}
      slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 5, autoComplete: 'off' } }}
    />
  );

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <Box component="form" noValidate onSubmit={submit}>
        <DialogTitle id={titleId}>Modifier l’affectation</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2 }}>
          {onSiteOnly && (
            <Typography variant="body2" color="text.secondary">
              Le surveillant est en classe : seule l’heure de fin peut changer.
            </Typography>
          )}
          {general && <Alert severity="error">{general}</Alert>}
          <TextField
            select
            label="Classe"
            value={classes.length > 0 ? values.classId : ''}
            onChange={(e) => setValues((v) => ({ ...v, classId: e.target.value }))}
            disabled={!editable('classId')}
            error={Boolean(errors.classId)}
            helperText={errors.classId ?? ' '}
          >
            {classes.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {[c.name, c.room, c.floor?.name].filter(Boolean).join(' · ')}
              </MenuItem>
            ))}
          </TextField>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' } }}>
            <TextField
              label="Date"
              type="date"
              value={values.date}
              onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))}
              disabled={!editable('date')}
              error={Boolean(errors.date)}
              helperText={errors.date ?? ' '}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            {field('startTime', 'Heure de début (HH:MM)')}
            {field('endTime', 'Heure de fin (HH:MM)')}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="contained" loading={update.isPending}>
            Enregistrer
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
