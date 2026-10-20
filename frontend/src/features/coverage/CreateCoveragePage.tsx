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
import { useQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, apiFetch, fieldErrors } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { SectionCard } from '../../components/SectionCard';
import { useToast } from '../../components/Toast';
import { icon } from '../../design/tokens';
import { useCoverageProfile, useCreateCoverage, useFormOptions } from './api';
import { TYPE_LABELS, UNAVAILABLE_REASONS } from './labels';
import { schoolDateTime } from './schoolTime';
import type { Candidate, CoverageType } from './types';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES: CoverageType[] = ['LATENESS', 'ABSENCE', 'EMPTY_CLASS'];
const NO_TEACHER = 'none';

interface Values {
  classId: string;
  type: CoverageType;
  teacherId: string;
  date: string;
  startTime: string;
  endTime: string;
  assigneeId: string;
  reason: string;
  note: string;
}

/** Créneau complet et cohérent : instants ISO de l'école, sinon null. */
function slotOf(v: Values, timeZone: string): { startAt: string; endAt: string } | null {
  if (!DATE.test(v.date) || !TIME.test(v.startTime.trim()) || !TIME.test(v.endTime.trim()))
    return null;
  const startAt = schoolDateTime(v.date, v.startTime.trim(), timeZone);
  const endAt = schoolDateTime(v.date, v.endTime.trim(), timeZone);
  return endAt > startAt ? { startAt, endAt } : null;
}

function validate(v: Values, candidates: Candidate[] | undefined): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.classId) errors.classId = 'Choisissez la classe.';
  if (!DATE.test(v.date)) errors.date = 'Indiquez la date.';
  if (!TIME.test(v.startTime.trim())) errors.startAt = 'Indiquez l’heure de début.';
  if (!TIME.test(v.endTime.trim())) errors.endAt = 'Indiquez l’heure de fin.';
  else if (!errors.startAt && v.endTime.trim() <= v.startTime.trim())
    errors.endAt = 'L’heure de fin doit suivre l’heure de début.';
  if (!candidates?.some((c) => c.id === v.assigneeId && c.available))
    errors.assigneeId = 'Choisissez un surveillant disponible.';
  return errors;
}

/**
 * Affectation directe par l'admin (US3, FR-019) : classe, type, enseignant facultatif, créneau
 * (heures de l'école), surveillant choisi parmi ceux du créneau ; l'affectation naît « assignée ».
 * Plus de diffusion ni de groupes cibles (004).
 */
export function CreateCoveragePage() {
  const options = useFormOptions();
  const profile = useCoverageProfile();
  if (options.isPending || profile.isPending)
    return <LoadingState label="Chargement du formulaire" variant="detail" />;
  if (options.error || profile.error) {
    return (
      <ErrorState
        message="Impossible de charger le formulaire."
        actionLabel="Réessayer"
        onAction={() => void options.refetch()}
      />
    );
  }
  return <CreateForm options={options.data} schoolDates={profile.data.schoolDates} />;
}

function CreateForm({
  options,
  schoolDates,
}: {
  options: NonNullable<ReturnType<typeof useFormOptions>['data']>;
  schoolDates: { timezone: string; today: string };
}) {
  const ids = { type: useId(), assignee: useId(), assigneeHelp: useId() };
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateCoverage();
  const clientId = useRef(crypto.randomUUID());
  const [values, setValues] = useState<Values>({
    classId: '',
    type: 'ABSENCE',
    teacherId: NO_TEACHER,
    date: schoolDates.today,
    startTime: '',
    endTime: '',
    assigneeId: '',
    reason: '',
    note: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  const slot = slotOf(values, schoolDates.timezone);
  const candidates = useQuery({
    queryKey: ['coverage', 'slot-candidates', values.classId, slot?.startAt, slot?.endAt],
    queryFn: () =>
      apiFetch<Candidate[]>(
        `/api/coverage/candidates?${new URLSearchParams({ classId: values.classId, startAt: slot!.startAt, endAt: slot!.endAt }).toString()}`,
      ),
    enabled: Boolean(values.classId && slot),
    staleTime: 0,
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const found = validate(values, candidates.data);
    setErrors(found);
    if (Object.keys(found).length > 0 || !slot) return;
    const reason = values.reason.trim();
    const note = values.note.trim();
    create.mutate(
      {
        clientId: clientId.current,
        classId: values.classId,
        type: values.type,
        teacherId: values.teacherId === NO_TEACHER ? null : values.teacherId,
        ...slot,
        assigneeId: values.assigneeId,
        ...(reason ? { reason } : {}),
        ...(note ? { note } : {}),
      },
      {
        onSuccess: (detail) => {
          toast.success('Affectation créée : le surveillant est prévenu.');
          navigate(`/gardes/${detail.id}`);
        },
        onError: (error) => setErrors(fieldErrors(error)),
      },
    );
  }

  const generalError =
    create.error && !(create.error instanceof ApiError && create.error.code === 'VALIDATION_ERROR')
      ? create.error instanceof ApiError
        ? create.error.message
        : 'Création impossible. Réessayez.'
      : null;

  return (
    <>
      <PageHeader
        title="Nouvelle affectation"
        description="Pour un retard ou une absence connus hors application : l’affectation est créée « assignée » et le surveillant est prévenu."
        back={{ to: '/gardes', label: 'Gardes' }}
      />
      <SectionCard component="form" noValidate onSubmit={submit} contentGap={2.5}>
        <TextField
          select
          id="affectation-classe"
          label="Classe"
          required
          value={values.classId}
          onChange={(e) => set({ classId: e.target.value, assigneeId: '' })}
          error={Boolean(errors.classId)}
          helperText={errors.classId ?? ' '}
        >
          {options.classes.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {[c.name, c.room, c.floor?.name].filter(Boolean).join(' · ')}
            </MenuItem>
          ))}
        </TextField>

        <FormControl component="fieldset">
          <FormLabel component="legend" id={ids.type}>
            Type
          </FormLabel>
          <RadioGroup
            row
            aria-labelledby={ids.type}
            value={values.type}
            onChange={(e) => set({ type: e.target.value as CoverageType })}
          >
            {TYPES.map((t) => (
              <FormControlLabel key={t} value={t} control={<Radio />} label={TYPE_LABELS[t]} />
            ))}
          </RadioGroup>
        </FormControl>

        <TextField
          select
          id="affectation-enseignant"
          label="Enseignant (facultatif)"
          value={values.teacherId}
          onChange={(e) => set({ teacherId: e.target.value })}
          error={Boolean(errors.teacherId)}
          helperText={errors.teacherId ?? ' '}
        >
          <MenuItem value={NO_TEACHER}>Non précisé</MenuItem>
          {options.teachers.map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.displayName}
            </MenuItem>
          ))}
        </TextField>

        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
          }}
        >
          <TextField
            id="affectation-date"
            label="Date"
            type="date"
            required
            value={values.date}
            onChange={(e) => set({ date: e.target.value, assigneeId: '' })}
            error={Boolean(errors.date)}
            helperText={errors.date ?? ' '}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: schoolDates.today } }}
          />
          <TextField
            id="affectation-debut"
            label="Heure de début (HH:MM)"
            required
            value={values.startTime}
            onChange={(e) => set({ startTime: e.target.value, assigneeId: '' })}
            error={Boolean(errors.startAt)}
            helperText={errors.startAt ?? ' '}
            slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 5, autoComplete: 'off' } }}
          />
          <TextField
            id="affectation-fin"
            label="Heure de fin (HH:MM)"
            required
            value={values.endTime}
            onChange={(e) => set({ endTime: e.target.value, assigneeId: '' })}
            error={Boolean(errors.endAt)}
            helperText={errors.endAt ?? ' '}
            slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 5, autoComplete: 'off' } }}
          />
        </Box>

        <FormControl component="fieldset" error={Boolean(errors.assigneeId)} required>
          <FormLabel component="legend" id={ids.assignee}>
            Surveillant
          </FormLabel>
          {!values.classId || !slot ? (
            <Typography variant="body2" color="text.secondary">
              Choisissez la classe et le créneau pour voir les surveillants disponibles.
            </Typography>
          ) : candidates.isPending ? (
            <LoadingState label="Chargement des surveillants" variant="inline" />
          ) : candidates.error ? (
            <Alert severity="error">Impossible de charger les surveillants.</Alert>
          ) : candidates.data.length === 0 ? (
            <Alert severity="info">Aucun surveillant dans le groupe Surveillants.</Alert>
          ) : (
            <RadioGroup
              aria-labelledby={ids.assignee}
              aria-describedby={errors.assigneeId ? ids.assigneeHelp : undefined}
              value={values.assigneeId}
              onChange={(e) => set({ assigneeId: e.target.value })}
            >
              {/* Étage de la classe d'abord, disponibles d'abord (tri du serveur). */}
              {candidates.data.map((c) => (
                <FormControlLabel
                  key={c.id}
                  value={c.id}
                  disabled={!c.available}
                  control={<Radio />}
                  label={[
                    c.displayName,
                    c.floor?.name ?? 'sans étage',
                    c.available ? 'Disponible' : UNAVAILABLE_REASONS[c.reason ?? 'UNAVAILABLE'],
                  ].join(' · ')}
                  sx={{ minHeight: 40 }}
                />
              ))}
            </RadioGroup>
          )}
          {errors.assigneeId && (
            <FormHelperText id={ids.assigneeHelp}>{errors.assigneeId}</FormHelperText>
          )}
        </FormControl>

        <TextField
          id="affectation-motif"
          label="Motif (facultatif)"
          multiline
          minRows={2}
          value={values.reason}
          onChange={(e) => set({ reason: e.target.value })}
          error={Boolean(errors.reason)}
          helperText={
            errors.reason ?? 'Visible des admins seulement. Le surveillant ne le voit pas.'
          }
          slotProps={{ htmlInput: { maxLength: 1000 } }}
        />
        <TextField
          id="affectation-consigne"
          label="Consigne pour le surveillant (facultatif)"
          multiline
          minRows={2}
          value={values.note}
          onChange={(e) => set({ note: e.target.value })}
          error={Boolean(errors.note)}
          helperText={errors.note ?? ' '}
          slotProps={{ htmlInput: { maxLength: 1000 } }}
        />

        {generalError && (
          <Alert severity="error" role="alert">
            {generalError}
          </Alert>
        )}
        <Box>
          <Button
            type="submit"
            variant="contained"
            size="large"
            loading={create.isPending}
            startIcon={<UserPlus size={icon.md} aria-hidden="true" />}
          >
            Créer l’affectation
          </Button>
        </Box>
      </SectionCard>
    </>
  );
}
