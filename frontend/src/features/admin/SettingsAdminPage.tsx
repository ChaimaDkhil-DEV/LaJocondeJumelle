import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Save, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiError, apiFetch, fieldErrors } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { SectionCard } from '../../components/SectionCard';
import { icon } from '../../design/tokens';
import { t } from '../../i18n';
import { adminKeys, useAdminSettings, useRolePermissions, type AdminSettings, type ConfigurableRole, type RolePermissions } from './api';
import { usePushConfig } from '../push/api';
import { PERMISSION_LABELS, ROLE_LABELS } from './labels';

const MB = 1024 * 1024;

type NumberKey = Exclude<
  keyof AdminSettings,
  | 'allowedPhotoTypes'
  | 'allowedDocumentTypes'
  | 'draftsEnabled'
  | 'coverageMorningReminderTime'
  | 'pushWindowDays'
  | 'pushWindowStart'
  | 'pushWindowEnd'
>;

/** Réglages numériques : libellé, et conversion pour les tailles saisies en Mo. */
const NUMBER_FIELDS: Array<{ key: NumberKey; label: string; megabytes?: boolean }> = [
  { key: 'voiceMaxSeconds', label: t('Durée maximale d’un vocal (secondes)') },
  { key: 'voiceMaxBytes', label: t('Taille maximale d’un vocal (Mo)'), megabytes: true },
  { key: 'attachmentMaxBytes', label: t('Taille maximale d’une pièce jointe (Mo)'), megabytes: true },
  { key: 'attachmentMaxPerMessage', label: t('Pièces jointes par message') },
  { key: 'deadlineWarnPercent', label: t('Alerte d’échéance proche (% du délai restant)') },
  { key: 'sessionIdleMinutes', label: t('Déconnexion après inactivité (minutes)') },
  { key: 'sessionMaxHours', label: t('Durée maximale d’une session (heures)') },
  // Affectations des surveillants (004).
  { key: 'coverageUrgencyThresholdMinutes', label: t('Affectations : seuil d’urgence avant le début du créneau (minutes)') },
  { key: 'coverageEscalationMinutes', label: t('Affectations : escalade au super administrateur après l’alerte (minutes)') },
  { key: 'coverageCloseReminderMinutes', label: t('Affectations : rappel de clôture après la fin du créneau (minutes)') },
  { key: 'coverageCloseEscalationMinutes', label: t('Affectations : rappel de clôture à l’admin ensuite (minutes)') },
  { key: 'coverageSupportReminderMinutes', label: t('Affectations : intervalle des rappels de renfort (minutes)') },
  { key: 'coverageSupportReminderMax', label: t('Affectations : nombre maximal de rappels de renfort') },
  { key: 'coverageRetentionMonths', label: t('Affectations : durée de conservation avant anonymisation (mois)') },
];

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const PHOTO_TYPES = [
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/png', label: 'PNG' },
  { value: 'image/webp', label: 'WebP' },
];

const DOCUMENT_TYPES = [{ value: 'application/pdf', label: 'PDF' }];

/** Jours d'envoi des notifications push (014), dans l'ordre de la semaine. */
const WEEK_DAYS = [
  { value: 'MON', label: t('Lundi') },
  { value: 'TUE', label: t('Mardi') },
  { value: 'WED', label: t('Mercredi') },
  { value: 'THU', label: t('Jeudi') },
  { value: 'FRI', label: t('Vendredi') },
  { value: 'SAT', label: t('Samedi') },
  { value: 'SUN', label: t('Dimanche') },
];
const DAY_ORDER = WEEK_DAYS.map((d) => d.value);

type Draft = Record<NumberKey, string> &
  Pick<
    AdminSettings,
    | 'allowedPhotoTypes'
    | 'allowedDocumentTypes'
    | 'draftsEnabled'
    | 'coverageMorningReminderTime'
    | 'pushWindowDays'
    | 'pushWindowStart'
    | 'pushWindowEnd'
  >;

function toDraft(s: AdminSettings): Draft {
  const numbers = Object.fromEntries(
    NUMBER_FIELDS.map((f) => [f.key, f.megabytes ? String(Math.round((s[f.key] / MB) * 100) / 100) : String(s[f.key])]),
  ) as Record<NumberKey, string>;
  return {
    ...numbers,
    allowedPhotoTypes: s.allowedPhotoTypes,
    allowedDocumentTypes: s.allowedDocumentTypes,
    draftsEnabled: s.draftsEnabled,
    coverageMorningReminderTime: s.coverageMorningReminderTime,
    pushWindowDays: s.pushWindowDays,
    pushWindowStart: s.pushWindowStart,
    pushWindowEnd: s.pushWindowEnd,
  };
}

/** Valeurs à envoyer (seulement celles modifiées) ou erreurs de saisie. */
function changes(draft: Draft, current: AdminSettings): { body: Partial<AdminSettings>; errors: Record<string, string> } {
  const body: Partial<AdminSettings> = {};
  const errors: Record<string, string> = {};
  for (const field of NUMBER_FIELDS) {
    const raw = draft[field.key].trim().replace(',', '.');
    const valid = field.megabytes ? /^\d+(\.\d+)?$/.test(raw) : /^\d+$/.test(raw);
    if (!valid) {
      errors[field.key] = field.megabytes ? t('Nombre attendu (ex. 10 ou 2,5).') : t('Nombre entier attendu.');
      continue;
    }
    const value = field.megabytes ? Math.round(Number(raw) * MB) : Number(raw);
    if (value !== current[field.key]) body[field.key] = value;
  }
  for (const key of ['allowedPhotoTypes', 'allowedDocumentTypes'] as const) {
    if ([...draft[key]].sort().join() !== [...current[key]].sort().join()) body[key] = draft[key];
  }
  if (draft.draftsEnabled !== current.draftsEnabled) body.draftsEnabled = draft.draftsEnabled;
  const morning = draft.coverageMorningReminderTime.trim();
  if (!TIME_PATTERN.test(morning)) errors.coverageMorningReminderTime = t('Heure au format HH:MM attendue (ex. 07:00).');
  else if (morning !== current.coverageMorningReminderTime) body.coverageMorningReminderTime = morning;

  // Plage d'envoi des notifications push (014) : au moins un jour, fin strictement après le début.
  const days = [...draft.pushWindowDays].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  if (days.length === 0) errors.pushWindowDays = t('Choisissez au moins un jour.');
  else if (days.join() !== [...current.pushWindowDays].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)).join()) body.pushWindowDays = days;
  const start = draft.pushWindowStart.trim();
  const end = draft.pushWindowEnd.trim();
  if (!TIME_PATTERN.test(start)) errors.pushWindowStart = t('Heure au format HH:MM attendue (ex. 07:00).');
  if (!TIME_PATTERN.test(end)) errors.pushWindowEnd = t('Heure au format HH:MM attendue (ex. 07:00).');
  else if (TIME_PATTERN.test(start) && end <= start) errors.pushWindowEnd = t('L’heure de fin doit être après l’heure de début.');
  if (!errors.pushWindowStart && start !== current.pushWindowStart) body.pushWindowStart = start;
  if (!errors.pushWindowEnd && end !== current.pushWindowEnd) body.pushWindowEnd = end;
  return { body, errors };
}

function TypeChoices(props: {
  legend: string;
  options: Array<{ value: string; label: string }>;
  value: string[];
  error?: string;
  onChange: (value: string[]) => void;
}) {
  return (
    <FormControl component="fieldset" error={Boolean(props.error)}>
      <FormLabel component="legend">{props.legend}</FormLabel>
      <FormGroup row>
        {props.options.map((o) => (
          <FormControlLabel
            key={o.value}
            label={o.label}
            control={
              <Checkbox
                checked={props.value.includes(o.value)}
                onChange={(e) => props.onChange(e.target.checked ? [...props.value, o.value] : props.value.filter((v) => v !== o.value))}
              />
            }
          />
        ))}
      </FormGroup>
      {props.error && <FormHelperText>{props.error}</FormHelperText>}
    </FormControl>
  );
}

/** Plage d'envoi des notifications push (014, contracts/ui.md) : jours, heures, aide et état du push. */
function PushWindowFields(props: { draft: Draft; errors: Record<string, string>; set: (patch: Partial<Draft>) => void }) {
  const { draft, errors, set } = props;
  const push = usePushConfig();
  return (
    <Box component="section" aria-labelledby="titre-plage-push" sx={{ display: 'grid', gap: 1.5 }}>
      <Typography id="titre-plage-push" component="h3" variant="subtitle1">
        {t('Plage d’envoi des notifications push')}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t(
          'Heure de l’école. En dehors de cette plage, aucune notification push n’est envoyée ni différée ; les notifications restent dans l’application. Les signalements de retard arrivent souvent avant 07:30.',
        )}
      </Typography>
      {push.data && (
        <Typography variant="body2">
          {push.data.enabled ? t('Notifications push : activées') : t('Notifications push : désactivées (clés non configurées)')}
        </Typography>
      )}
      <TypeChoices
        legend={t('Jours d’envoi des notifications push')}
        options={WEEK_DAYS}
        value={draft.pushWindowDays}
        error={errors.pushWindowDays}
        onChange={(pushWindowDays) => set({ pushWindowDays })}
      />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
        <TextField
          id="reglage-pushWindowStart"
          label={t('Heure de début (HH:MM)')}
          value={draft.pushWindowStart}
          onChange={(e) => set({ pushWindowStart: e.target.value })}
          error={Boolean(errors.pushWindowStart)}
          helperText={errors.pushWindowStart ?? ' '}
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
        />
        <TextField
          id="reglage-pushWindowEnd"
          label={t('Heure de fin (HH:MM)')}
          value={draft.pushWindowEnd}
          onChange={(e) => set({ pushWindowEnd: e.target.value })}
          error={Boolean(errors.pushWindowEnd)}
          helperText={errors.pushWindowEnd ?? ' '}
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
        />
      </Box>
    </Box>
  );
}

function SettingsForm({ settings }: { settings: AdminSettings }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const mutation = useMutation({
    mutationFn: (body: Partial<AdminSettings>) => apiFetch<AdminSettings>('/api/admin/settings', { method: 'PUT', body }),
    onSuccess: (saved) => {
      queryClient.setQueryData(adminKeys.settings, saved);
      void queryClient.invalidateQueries({ queryKey: ['settings', 'client'] });
      setDraft(toDraft(saved));
      setFeedback(t('Réglages enregistrés.'));
    },
    onError: (error) => setErrors(fieldErrors(error)),
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFeedback(null);
    const { body, errors: found } = changes(draft, settings);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (Object.keys(body).length === 0) setFeedback(t('Aucune modification à enregistrer.'));
    else mutation.mutate(body);
  }

  const generalError =
    mutation.error && !(mutation.error instanceof ApiError && mutation.error.code === 'VALIDATION_ERROR')
      ? mutation.error instanceof ApiError
        ? mutation.error.message
        : t('Enregistrement impossible.')
      : null;

  return (
    <SectionCard
      component="form"
      noValidate
      onSubmit={submit}
      title={t('Réglages')}
      titleId="titre-reglages"
      icon={SlidersHorizontal}
      description={t('Valeurs par défaut provisoires, à ajuster avec l’établissement.')}
      contentGap={3}
    >
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
        {NUMBER_FIELDS.map((field) => (
          <TextField
            key={field.key}
            id={`reglage-${field.key}`}
            label={field.label}
            value={draft[field.key]}
            onChange={(e) => set({ [field.key]: e.target.value } as Partial<Draft>)}
            error={Boolean(errors[field.key])}
            helperText={errors[field.key] ?? ' '}
            slotProps={{ htmlInput: { inputMode: field.megabytes ? 'decimal' : 'numeric' } }}
          />
        ))}
        <TextField
          id="reglage-coverageMorningReminderTime"
          label={t('Affectations : heure du rappel du matin (HH:MM)')}
          value={draft.coverageMorningReminderTime}
          onChange={(e) => set({ coverageMorningReminderTime: e.target.value })}
          error={Boolean(errors.coverageMorningReminderTime)}
          helperText={errors.coverageMorningReminderTime ?? ' '}
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
        />
      </Box>
      <TypeChoices
        legend={t('Types de photo acceptés')}
        options={PHOTO_TYPES}
        value={draft.allowedPhotoTypes}
        error={errors.allowedPhotoTypes}
        onChange={(allowedPhotoTypes) => set({ allowedPhotoTypes })}
      />
      <TypeChoices
        legend={t('Types de document acceptés')}
        options={DOCUMENT_TYPES}
        value={draft.allowedDocumentTypes}
        error={errors.allowedDocumentTypes}
        onChange={(allowedDocumentTypes) => set({ allowedDocumentTypes })}
      />
      <FormControlLabel
        control={<Checkbox checked={draft.draftsEnabled} onChange={(e) => set({ draftsEnabled: e.target.checked })} />}
        label={t('Autoriser les brouillons de demande')}
      />
      <PushWindowFields draft={draft} errors={errors} set={set} />
      {generalError && (
        <Alert severity="error" role="alert">
          {generalError}
        </Alert>
      )}
      {mutation.error instanceof ApiError && mutation.error.code === 'VALIDATION_ERROR' && (
        <Alert severity="error" role="alert">
          {t('Certains réglages sont invalides : corrigez les champs signalés.')}
        </Alert>
      )}
      {feedback && (
        <Alert severity="success" role="status">
          {feedback}
        </Alert>
      )}
      <Box>
        <Button type="submit" variant="contained" loading={mutation.isPending} startIcon={<Save size={icon.sm} aria-hidden="true" />}>
          {t('Enregistrer les réglages')}
        </Button>
      </Box>
    </SectionCard>
  );
}

const ROLES: ConfigurableRole[] = ['EMPLOYEE', 'ADMIN'];

/** Réglables pour le rôle ADMIN seulement, comme côté serveur (015 : la surveillante générale valide). */
const ADMIN_ONLY_PERMISSIONS = new Set(['PARENT_COMMUNICATION_VALIDATE']);
const permissionsFor = (role: ConfigurableRole) =>
  Object.entries(PERMISSION_LABELS).filter(([permission]) => role === 'ADMIN' || !ADMIN_ONLY_PERMISSIONS.has(permission));

function RolePermissionsForm({ permissions }: { permissions: RolePermissions }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RolePermissions>(permissions);
  const [feedback, setFeedback] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: RolePermissions) => apiFetch<RolePermissions>('/api/admin/role-permissions', { method: 'PUT', body }),
    onSuccess: (saved) => {
      queryClient.setQueryData(adminKeys.rolePermissions, saved);
      setDraft(saved);
      setFeedback(t('Permissions enregistrées.'));
    },
  });

  function toggle(role: ConfigurableRole, permission: string, checked: boolean): void {
    setFeedback(null);
    setDraft((d) => ({ ...d, [role]: (checked ? [...d[role], permission] : d[role].filter((p) => p !== permission)).sort() }));
  }

  return (
    <SectionCard
      title={t('Permissions par rôle')}
      titleId="titre-permissions"
      icon={ShieldCheck}
      description={t('Le super administrateur dispose toujours de toutes les permissions.')}
      contentGap={3}
    >
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
        {ROLES.map((role) => (
          <FormControl key={role} component="fieldset">
            <FormLabel component="legend">{ROLE_LABELS[role]}</FormLabel>
            <FormGroup>
              {permissionsFor(role).map(([permission, label]) => (
                <FormControlLabel
                  key={permission}
                  label={label}
                  control={<Checkbox checked={draft[role].includes(permission)} onChange={(e) => toggle(role, permission, e.target.checked)} />}
                />
              ))}
            </FormGroup>
          </FormControl>
        ))}
      </Box>
      {mutation.error && (
        <Alert severity="error" role="alert">
          {mutation.error instanceof ApiError ? mutation.error.message : t('Enregistrement impossible.')}
        </Alert>
      )}
      {feedback && (
        <Alert severity="success" role="status">
          {feedback}
        </Alert>
      )}
      <Box>
        <Button variant="outlined" loading={mutation.isPending} onClick={() => mutation.mutate(draft)} startIcon={<Save size={icon.sm} aria-hidden="true" />}>
          {t('Enregistrer les permissions')}
        </Button>
      </Box>
    </SectionCard>
  );
}

/** Réglages globaux et permissions par rôle (US8). */
export function SettingsAdminPage() {
  const settings = useAdminSettings();
  const permissions = useRolePermissions();

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      {settings.isPending ? (
        <LoadingState label={t('Chargement des réglages')} variant="form" />
      ) : settings.error ? (
        <ErrorState message={t('Impossible de charger les réglages.')} actionLabel={t('Réessayer')} onAction={() => void settings.refetch()} />
      ) : (
        <SettingsForm settings={settings.data} />
      )}
      {permissions.isPending ? (
        <LoadingState label={t('Chargement des permissions')} />
      ) : permissions.error ? (
        <ErrorState message={t('Impossible de charger les permissions.')} actionLabel={t('Réessayer')} onAction={() => void permissions.refetch()} />
      ) : (
        <RolePermissionsForm permissions={permissions.data} />
      )}
    </Box>
  );
}
