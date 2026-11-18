import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import { useId, useState, type FormEvent } from 'react';
import { fieldErrors } from '../../api/client';
import { useToast } from '../../components/Toast';
import { t } from '../../i18n';
import { conflictsOf, useCreateSeries, useCreateSession, useUpdateSeries, useUpdateSession } from './api';
import { ConflictList } from './ConflictList';
import { addDays, isoWeekday, WEEKDAY_LABELS } from './labels';
import type { Person, TimetableSession } from './types';

export type FormMode = { kind: 'series' } | { kind: 'session' } | { kind: 'edit'; session: TimetableSession };

interface Props {
  mode: FormMode;
  teachers: Person[];
  classes: Array<{ id: string; name: string }>;
  /** Valeurs proposées à la création (enseignant ou classe affichés, jour sélectionné). */
  defaults: { teacherId?: string; classId?: string; date: string };
  onClose: () => void;
}

interface Values {
  teacherId: string;
  classId: string;
  date: string;
  weekday: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  subject: string;
  room: string;
}

/**
 * Création d'une série hebdomadaire ou d'une séance, et modification d'une séance (seule, ou avec les suivantes de
 * sa série). Le serveur vérifie tout : droits, enseignant du groupe Enseignants, conflits ; ses erreurs s'affichent
 * sous chaque champ, et les conflits sont listés.
 */
export function TimetableFormDialog({ mode, teachers, classes, defaults, onClose }: Props) {
  const titleId = useId();
  const toast = useToast();
  const createSeries = useCreateSeries();
  const createSession = useCreateSession();
  const updateSession = useUpdateSession();
  const updateSeries = useUpdateSeries();
  const editing = mode.kind === 'edit' ? mode.session : null;
  const canFollow = Boolean(editing?.seriesId && !editing.detached);
  const [scope, setScope] = useState<'one' | 'following'>('one');
  const [values, setValues] = useState<Values>(() => ({
    teacherId: editing?.teacher.id ?? defaults.teacherId ?? '',
    classId: editing?.class.id ?? defaults.classId ?? '',
    date: editing?.date ?? defaults.date,
    weekday: String(isoWeekday(defaults.date)),
    startDate: defaults.date,
    endDate: addDays(defaults.date, 7 * 12),
    startTime: editing?.startTime ?? '08:00',
    endTime: editing?.endTime ?? '09:00',
    subject: editing?.subject ?? '',
    room: editing && editing.room !== editing.class.room ? (editing.room ?? '') : '',
  }));
  const [localError, setLocalError] = useState<string | null>(null);
  const mutation = mode.kind === 'series' ? createSeries : mode.kind === 'session' ? createSession : scope === 'following' ? updateSeries : updateSession;
  const errors = fieldErrors(mutation.error);
  const conflicts = conflictsOf(mutation.error);
  const set = (key: keyof Values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const title =
    mode.kind === 'series' ? t('Nouvelle série hebdomadaire') : mode.kind === 'session' ? t('Nouvelle séance') : t('Modifier la séance');

  function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (!values.teacherId || !values.classId) {
      setLocalError(t('Choisissez l’enseignant et la classe.'));
      return;
    }
    const common = {
      teacherId: values.teacherId,
      classId: values.classId,
      startTime: values.startTime,
      endTime: values.endTime,
      subject: values.subject.trim() || null,
      room: values.room.trim() || null,
    };
    const done = (message: string) => () => {
      toast.success(message);
      onClose();
    };
    if (mode.kind === 'series') {
      createSeries.mutate(
        { ...common, weekday: Number(values.weekday), startDate: values.startDate, endDate: values.endDate },
        { onSuccess: (r) => done(t('Série enregistrée : {count} séances.', { count: r.sessionCount }))() },
      );
    } else if (mode.kind === 'session') {
      createSession.mutate({ ...common, date: values.date }, { onSuccess: done(t('Séance enregistrée.')) });
    } else if (scope === 'following' && editing?.seriesId) {
      updateSeries.mutate({ id: editing.seriesId, from: editing.date, ...common }, { onSuccess: done(t('Séances de la série modifiées.')) });
    } else if (editing) {
      updateSession.mutate({ id: editing.id, ...common, date: values.date }, { onSuccess: done(t('Séance modifiée.')) });
    }
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={submit} noValidate>
        <DialogTitle id={titleId}>{title}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          {conflicts && <ConflictList conflicts={conflicts} />}
          {localError && (
            <Box role="alert" sx={{ color: 'error.main' }}>
              {localError}
            </Box>
          )}
          {canFollow && (
            <FormControl>
              <FormLabel id={`${titleId}-scope`}>{t('Appliquer à')}</FormLabel>
              <RadioGroup aria-labelledby={`${titleId}-scope`} value={scope} onChange={(e) => setScope(e.target.value as 'one' | 'following')}>
                <FormControlLabel value="one" control={<Radio />} label={t('Cette séance seulement')} />
                <FormControlLabel value="following" control={<Radio />} label={t('Cette séance et les suivantes de la série')} />
              </RadioGroup>
            </FormControl>
          )}
          <TextField select label={t('Enseignant')} value={values.teacherId} onChange={set('teacherId')} required error={Boolean(errors.teacherId)} helperText={errors.teacherId}>
            {teachers.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.displayName}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label={t('Classe')} value={values.classId} onChange={set('classId')} required error={Boolean(errors.classId)} helperText={errors.classId}>
            {classes.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          {mode.kind === 'series' ? (
            <>
              <TextField select label={t('Jour de la semaine')} value={values.weekday} onChange={set('weekday')} required error={Boolean(errors.weekday)} helperText={errors.weekday}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <MenuItem key={d} value={String(d)}>
                    {WEEKDAY_LABELS[d]}
                  </MenuItem>
                ))}
              </TextField>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                <TextField type="date" label={t('Du')} value={values.startDate} onChange={set('startDate')} required slotProps={{ inputLabel: { shrink: true } }} error={Boolean(errors.startDate)} helperText={errors.startDate} />
                <TextField type="date" label={t('Au')} value={values.endDate} onChange={set('endDate')} required slotProps={{ inputLabel: { shrink: true } }} error={Boolean(errors.endDate)} helperText={errors.endDate} />
              </Box>
            </>
          ) : (
            <TextField
              type="date"
              label={t('Date')}
              value={values.date}
              onChange={set('date')}
              required
              disabled={scope === 'following'}
              slotProps={{ inputLabel: { shrink: true } }}
              error={Boolean(errors.date)}
              helperText={errors.date ?? (scope === 'following' ? t('Les séances de la série gardent leur jour.') : undefined)}
            />
          )}
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <TextField type="time" label={t('Début')} value={values.startTime} onChange={set('startTime')} required slotProps={{ inputLabel: { shrink: true } }} error={Boolean(errors.startTime)} helperText={errors.startTime} />
            <TextField type="time" label={t('Fin')} value={values.endTime} onChange={set('endTime')} required slotProps={{ inputLabel: { shrink: true } }} error={Boolean(errors.endTime)} helperText={errors.endTime} />
          </Box>
          <TextField label={t('Matière (facultatif)')} value={values.subject} onChange={set('subject')} slotProps={{ htmlInput: { maxLength: 100 } }} error={Boolean(errors.subject)} helperText={errors.subject} />
          <TextField
            label={t('Salle (facultatif)')}
            value={values.room}
            onChange={set('room')}
            slotProps={{ htmlInput: { maxLength: 80 } }}
            error={Boolean(errors.room)}
            helperText={errors.room ?? t('Sans salle, la séance a lieu dans la salle de la classe.')}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('Annuler')}</Button>
          <Button type="submit" variant="contained" loading={mutation.isPending}>
            {t('Enregistrer')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
