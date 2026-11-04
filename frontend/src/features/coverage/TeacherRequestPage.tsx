import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Send } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiError, fieldErrors } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { SectionCard } from '../../components/SectionCard';
import { useToast } from '../../components/Toast';
import { icon } from '../../design/tokens';
import {
  useCoverage,
  useCoverageClasses,
  useCoverageProfile,
  useSaveTeacherRequest,
  type TeacherRequestInput,
} from './api';
import { CoverageActions } from './CoverageActions';
import { CoverageStatusBadge, TYPE_LABELS, formatTime } from './labels';
import type { CoverageDetail } from './types';
import { locale, t } from '../../i18n';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

interface Values {
  type: 'LATENESS' | 'ABSENCE';
  classId: string;
  date: string;
  startTime: string;
  endMode: 'END' | 'DURATION';
  endTime: string;
  duration: string;
  reason: string;
}

/** Date et heure locales de l'école d'un instant ISO. */
function schoolParts(iso: string, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** « mercredi 21 octobre » pour une date locale AAAA-MM-JJ. */
function longDate(date: string): string {
  return new Intl.DateTimeFormat(locale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

function validate(v: Values): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.classId) errors.classId = t('Choisissez la classe.');
  if (!TIME.test(v.startTime.trim())) errors.startTime = t('Indiquez l’heure de début.');
  if (v.endMode === 'END' && !TIME.test(v.endTime.trim()))
    errors.endTime = t('Indiquez l’heure de fin ou une durée.');
  if (v.endMode === 'DURATION' && !/^\d+$/.test(v.duration.trim()))
    errors.durationMinutes = t('Indiquez l’heure de fin ou une durée.');
  return errors;
}

function toInput(v: Values): TeacherRequestInput {
  return {
    type: v.type,
    classId: v.classId,
    date: v.date,
    startTime: v.startTime.trim(),
    ...(v.endMode === 'END'
      ? { endTime: v.endTime.trim() }
      : { durationMinutes: Number(v.duration) }),
  };
}

/**
 * Signaler un retard ou une absence (US1, FR-012) ; à l'adresse d'un signalement existant, le
 * modifier ou le retirer tant qu'il est « en attente » (FR-008g), sinon le consulter.
 */
export function TeacherRequestPage() {
  const { id } = useParams();
  const profile = useCoverageProfile();
  const existing = useCoverage(id ?? '', Boolean(id));
  const back = { to: '/gardes?onglet=mes-signalements', label: t('Mes signalements') };

  if (profile.isPending || (id && existing.isPending))
    return <LoadingState label={t('Chargement du signalement')} variant="detail" />;
  if (profile.error || (id && existing.error)) {
    return (
      <>
        <PageHeader title={t('Signalement')} back={back} />
        <ErrorState message={t('Ce signalement n’existe pas ou vous n’y avez pas accès.')} />
      </>
    );
  }
  const detail = id ? existing.data : undefined;
  return (
    <>
      {detail && !detail.allowedActions.includes('UPDATE') ? (
        <ReadOnlyRequest detail={detail} timeZone={profile.data.schoolDates.timezone} />
      ) : (
        <RequestForm detail={detail} schoolDates={profile.data.schoolDates} />
      )}
      {/* Hors du formulaire : après un retrait, la page passe en lecture seule et la confirmation doit s'afficher. */}
      {detail && (
        <Box sx={{ mt: 2 }}>
          <CoverageActions detail={detail} exclude={['UPDATE']} />
        </Box>
      )}
    </>
  );
}

function ReadOnlyRequest({ detail, timeZone }: { detail: CoverageDetail; timeZone: string }) {
  const start = schoolParts(detail.startAt, timeZone);
  return (
    <>
      <PageHeader
        title={t('Mon signalement')}
        eyebrow={detail.reference}
        back={{ to: '/gardes?onglet=mes-signalements', label: t('Mes signalements') }}
      />
      <SectionCard>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <Typography component="h2" variant="h6">
            {detail.type
              ? t('{type} — {name}', { type: TYPE_LABELS[detail.type], name: detail.class.name })
              : detail.class.name}
          </Typography>
          <CoverageStatusBadge mainStatus={detail.mainStatus} subState={detail.subState} />
        </Box>
        <Typography variant="body2" color="text.secondary">
          {detail.plannedEndAt
            ? t('{date}, de {start} à {end}', {
                date: longDate(start.date),
                start: start.time,
                end: schoolParts(detail.plannedEndAt, timeZone).time,
              })
            : t('{date}, de {start}', { date: longDate(start.date), start: start.time })}
        </Typography>
        {detail.assignee ? (
          <Typography variant="body2">
            {t('Surveillant assigné : {name}', { name: detail.assignee.displayName })}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t('Aucun surveillant assigné.')}
          </Typography>
        )}
        {detail.timestamps.relievedAt && (
          <Typography variant="body2" color="text.secondary">
            {t('Classe reprise à {time}.', { time: formatTime(detail.timestamps.relievedAt) })}
          </Typography>
        )}
        {detail.reason && <Typography variant="body2">{t('Motif : {reason}', { reason: detail.reason })}</Typography>}
      </SectionCard>
    </>
  );
}

function RequestForm({
  detail,
  schoolDates,
}: {
  detail?: CoverageDetail;
  schoolDates: { timezone: string; today: string; tomorrow: string };
}) {
  const ids = { type: useId(), date: useId(), end: useId() };
  const navigate = useNavigate();
  const toast = useToast();
  const classes = useCoverageClasses();
  const save = useSaveTeacherRequest(detail?.id);
  const clientId = useRef(crypto.randomUUID());
  const [values, setValues] = useState<Values>(() => {
    if (!detail) {
      return {
        type: 'LATENESS',
        classId: '',
        date: schoolDates.today,
        startTime: '',
        endMode: 'END',
        endTime: '',
        duration: '',
        reason: '',
      };
    }
    const start = schoolParts(detail.startAt, schoolDates.timezone);
    return {
      type: detail.type === 'ABSENCE' ? 'ABSENCE' : 'LATENESS',
      classId: detail.class.id,
      date: start.date,
      startTime: start.time,
      endMode: 'END',
      endTime: detail.plannedEndAt
        ? schoolParts(detail.plannedEndAt, schoolDates.timezone).time
        : '',
      duration: '',
      reason: detail.reason ?? '',
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const reason = values.reason.trim();
    const body = detail
      ? { ...toInput(values), version: detail.version, reason: reason || null }
      : { ...toInput(values), clientId: clientId.current, ...(reason ? { reason } : {}) };
    save.mutate(body, {
      onSuccess: () => {
        toast.success(
          detail ? t('Signalement modifié.') : t('Signalement envoyé : l’admin est prévenue.'),
        );
        navigate('/gardes?onglet=mes-signalements');
      },
      onError: (error) => setErrors(fieldErrors(error)),
    });
  }

  const generalError =
    save.error && !(save.error instanceof ApiError && save.error.code === 'VALIDATION_ERROR')
      ? save.error instanceof ApiError
        ? save.error.message
        : t('Envoi impossible. Réessayez.')
      : null;

  return (
    <>
      <PageHeader
        title={detail ? t('Modifier le signalement') : t('Signaler un retard ou une absence')}
        eyebrow={detail?.reference}
        description={t('Pour aujourd’hui ou demain, une classe et un créneau par signalement. L’admin assigne un surveillant.')}
        back={{ to: '/gardes?onglet=mes-signalements', label: t('Mes signalements') }}
      />
      <SectionCard component="form" noValidate onSubmit={submit} contentGap={2.5}>
        <FormControl component="fieldset">
          <FormLabel component="legend" id={ids.type}>
            {t('Type')}
          </FormLabel>
          <RadioGroup
            row
            aria-labelledby={ids.type}
            value={values.type}
            onChange={(e) => set({ type: e.target.value as Values['type'] })}
          >
            <FormControlLabel value="LATENESS" control={<Radio />} label={t('Retard')} />
            <FormControlLabel value="ABSENCE" control={<Radio />} label={t('Absence')} />
          </RadioGroup>
        </FormControl>

        <TextField
          select
          id="signalement-classe"
          label={t('Classe')}
          required
          value={values.classId}
          onChange={(e) => set({ classId: e.target.value })}
          error={Boolean(errors.classId)}
          helperText={errors.classId ?? ' '}
        >
          {(classes.data ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {[c.name, c.room, c.floor?.name].filter(Boolean).join(' · ')}
            </MenuItem>
          ))}
        </TextField>

        <FormControl component="fieldset" error={Boolean(errors.date)}>
          <FormLabel component="legend" id={ids.date}>
            {t('Date')}
          </FormLabel>
          <RadioGroup
            row
            aria-labelledby={ids.date}
            value={values.date}
            onChange={(e) => set({ date: e.target.value })}
          >
            <FormControlLabel
              value={schoolDates.today}
              control={<Radio />}
              label={t('Aujourd’hui ({date})', { date: longDate(schoolDates.today) })}
            />
            <FormControlLabel
              value={schoolDates.tomorrow}
              control={<Radio />}
              label={t('Demain ({date})', { date: longDate(schoolDates.tomorrow) })}
            />
          </RadioGroup>
          {errors.date && <FormHelperText>{errors.date}</FormHelperText>}
        </FormControl>

        <TextField
          id="signalement-debut"
          label={t('Heure de début (HH:MM)')}
          required
          value={values.startTime}
          onChange={(e) => set({ startTime: e.target.value })}
          error={Boolean(errors.startTime)}
          helperText={errors.startTime ?? t('Par exemple 08:30.')}
          slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 5, autoComplete: 'off' } }}
        />

        <FormControl component="fieldset">
          <FormLabel component="legend" id={ids.end}>
            {t('Fin du créneau')}
          </FormLabel>
          <RadioGroup
            row
            aria-labelledby={ids.end}
            value={values.endMode}
            onChange={(e) => set({ endMode: e.target.value as Values['endMode'] })}
          >
            <FormControlLabel value="END" control={<Radio />} label={t('Jusqu’à une heure précise')} />
            <FormControlLabel value="DURATION" control={<Radio />} label={t('Durée')} />
          </RadioGroup>
        </FormControl>
        {values.endMode === 'END' ? (
          <TextField
            id="signalement-fin"
            label={t('Heure de fin (HH:MM)')}
            required
            value={values.endTime}
            onChange={(e) => set({ endTime: e.target.value })}
            error={Boolean(errors.endTime)}
            helperText={errors.endTime ?? ' '}
            slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 5, autoComplete: 'off' } }}
          />
        ) : (
          <TextField
            id="signalement-duree"
            label={t('Durée en minutes')}
            required
            value={values.duration}
            onChange={(e) => set({ duration: e.target.value })}
            error={Boolean(errors.durationMinutes)}
            helperText={errors.durationMinutes ?? t('Par exemple 55.')}
            slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 3 } }}
          />
        )}

        <TextField
          id="signalement-motif"
          label={t('Motif (facultatif)')}
          multiline
          minRows={2}
          value={values.reason}
          onChange={(e) => set({ reason: e.target.value })}
          error={Boolean(errors.reason)}
          helperText={
            errors.reason ?? t('Visible seulement de l’admin. Le surveillant ne le voit pas.')
          }
          slotProps={{ htmlInput: { maxLength: 1000 } }}
        />

        {generalError && (
          <Alert severity="error" role="alert">
            {generalError}
          </Alert>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Button
            type="submit"
            variant="contained"
            size="large"
            loading={save.isPending}
            startIcon={<Send size={icon.md} aria-hidden="true" />}
          >
            {detail ? t('Enregistrer les modifications') : t('Envoyer le signalement')}
          </Button>
        </Box>
      </SectionCard>
    </>
  );
}
