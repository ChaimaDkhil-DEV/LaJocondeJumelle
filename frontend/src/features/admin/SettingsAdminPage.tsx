import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiError, apiFetch, fieldErrors } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { adminKeys, useAdminSettings, useRolePermissions, type AdminSettings, type ConfigurableRole, type RolePermissions } from './api';
import { PERMISSION_LABELS, ROLE_LABELS } from './labels';

const MB = 1024 * 1024;

type NumberKey = Exclude<keyof AdminSettings, 'allowedPhotoTypes' | 'allowedDocumentTypes' | 'draftsEnabled'>;

/** Réglages numériques : libellé, et conversion pour les tailles saisies en Mo. */
const NUMBER_FIELDS: Array<{ key: NumberKey; label: string; megabytes?: boolean }> = [
  { key: 'voiceMaxSeconds', label: 'Durée maximale d’un vocal (secondes)' },
  { key: 'voiceMaxBytes', label: 'Taille maximale d’un vocal (Mo)', megabytes: true },
  { key: 'attachmentMaxBytes', label: 'Taille maximale d’une pièce jointe (Mo)', megabytes: true },
  { key: 'attachmentMaxPerMessage', label: 'Pièces jointes par message' },
  { key: 'deadlineWarnPercent', label: 'Alerte d’échéance proche (% du délai restant)' },
  { key: 'sessionIdleMinutes', label: 'Déconnexion après inactivité (minutes)' },
  { key: 'sessionMaxHours', label: 'Durée maximale d’une session (heures)' },
];

const PHOTO_TYPES = [
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/png', label: 'PNG' },
  { value: 'image/webp', label: 'WebP' },
];

const DOCUMENT_TYPES = [{ value: 'application/pdf', label: 'PDF' }];

type Draft = Record<NumberKey, string> & Pick<AdminSettings, 'allowedPhotoTypes' | 'allowedDocumentTypes' | 'draftsEnabled'>;

function toDraft(s: AdminSettings): Draft {
  const numbers = Object.fromEntries(
    NUMBER_FIELDS.map((f) => [f.key, f.megabytes ? String(Math.round((s[f.key] / MB) * 100) / 100) : String(s[f.key])]),
  ) as Record<NumberKey, string>;
  return { ...numbers, allowedPhotoTypes: s.allowedPhotoTypes, allowedDocumentTypes: s.allowedDocumentTypes, draftsEnabled: s.draftsEnabled };
}

/** Valeurs à envoyer (seulement celles modifiées) ou erreurs de saisie. */
function changes(draft: Draft, current: AdminSettings): { body: Partial<AdminSettings>; errors: Record<string, string> } {
  const body: Partial<AdminSettings> = {};
  const errors: Record<string, string> = {};
  for (const field of NUMBER_FIELDS) {
    const raw = draft[field.key].trim().replace(',', '.');
    const valid = field.megabytes ? /^\d+(\.\d+)?$/.test(raw) : /^\d+$/.test(raw);
    if (!valid) {
      errors[field.key] = field.megabytes ? 'Nombre attendu (ex. 10 ou 2,5).' : 'Nombre entier attendu.';
      continue;
    }
    const value = field.megabytes ? Math.round(Number(raw) * MB) : Number(raw);
    if (value !== current[field.key]) body[field.key] = value;
  }
  for (const key of ['allowedPhotoTypes', 'allowedDocumentTypes'] as const) {
    if ([...draft[key]].sort().join() !== [...current[key]].sort().join()) body[key] = draft[key];
  }
  if (draft.draftsEnabled !== current.draftsEnabled) body.draftsEnabled = draft.draftsEnabled;
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
      setFeedback('Réglages enregistrés.');
    },
    onError: (error) => setErrors(fieldErrors(error)),
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFeedback(null);
    const { body, errors: found } = changes(draft, settings);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (Object.keys(body).length === 0) setFeedback('Aucune modification à enregistrer.');
    else mutation.mutate(body);
  }

  const generalError =
    mutation.error && !(mutation.error instanceof ApiError && mutation.error.code === 'VALIDATION_ERROR')
      ? mutation.error instanceof ApiError
        ? mutation.error.message
        : 'Enregistrement impossible.'
      : null;

  return (
    <Paper component="form" variant="outlined" noValidate onSubmit={submit} sx={{ p: 2, display: 'grid', gap: 2 }} aria-labelledby="titre-reglages">
      <Typography id="titre-reglages" component="h2" variant="h6">
        Réglages
      </Typography>
      <Typography color="text.secondary">Valeurs par défaut provisoires, à ajuster avec l’établissement.</Typography>
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
      </Box>
      <TypeChoices
        legend="Types de photo acceptés"
        options={PHOTO_TYPES}
        value={draft.allowedPhotoTypes}
        error={errors.allowedPhotoTypes}
        onChange={(allowedPhotoTypes) => set({ allowedPhotoTypes })}
      />
      <TypeChoices
        legend="Types de document acceptés"
        options={DOCUMENT_TYPES}
        value={draft.allowedDocumentTypes}
        error={errors.allowedDocumentTypes}
        onChange={(allowedDocumentTypes) => set({ allowedDocumentTypes })}
      />
      <FormControlLabel
        control={<Checkbox checked={draft.draftsEnabled} onChange={(e) => set({ draftsEnabled: e.target.checked })} />}
        label="Autoriser les brouillons de demande"
      />
      {generalError && (
        <Alert severity="error" role="alert">
          {generalError}
        </Alert>
      )}
      {mutation.error instanceof ApiError && mutation.error.code === 'VALIDATION_ERROR' && (
        <Alert severity="error" role="alert">
          Certains réglages sont invalides : corrigez les champs signalés.
        </Alert>
      )}
      {feedback && (
        <Alert severity="success" role="status">
          {feedback}
        </Alert>
      )}
      <Box>
        <Button type="submit" variant="contained" loading={mutation.isPending}>
          Enregistrer les réglages
        </Button>
      </Box>
    </Paper>
  );
}

const ROLES: ConfigurableRole[] = ['EMPLOYEE', 'MANAGER'];

function RolePermissionsForm({ permissions }: { permissions: RolePermissions }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RolePermissions>(permissions);
  const [feedback, setFeedback] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: RolePermissions) => apiFetch<RolePermissions>('/api/admin/role-permissions', { method: 'PUT', body }),
    onSuccess: (saved) => {
      queryClient.setQueryData(adminKeys.rolePermissions, saved);
      setDraft(saved);
      setFeedback('Permissions enregistrées.');
    },
  });

  function toggle(role: ConfigurableRole, permission: string, checked: boolean): void {
    setFeedback(null);
    setDraft((d) => ({ ...d, [role]: (checked ? [...d[role], permission] : d[role].filter((p) => p !== permission)).sort() }));
  }

  return (
    <Paper variant="outlined" component="section" aria-labelledby="titre-permissions" sx={{ p: 2, display: 'grid', gap: 2 }}>
      <Typography id="titre-permissions" component="h2" variant="h6">
        Permissions par rôle
      </Typography>
      <Typography color="text.secondary">Le super administrateur dispose toujours de toutes les permissions.</Typography>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
        {ROLES.map((role) => (
          <FormControl key={role} component="fieldset">
            <FormLabel component="legend">{ROLE_LABELS[role]}</FormLabel>
            <FormGroup>
              {Object.entries(PERMISSION_LABELS).map(([permission, label]) => (
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
          {mutation.error instanceof ApiError ? mutation.error.message : 'Enregistrement impossible.'}
        </Alert>
      )}
      {feedback && (
        <Alert severity="success" role="status">
          {feedback}
        </Alert>
      )}
      <Box>
        <Button variant="contained" loading={mutation.isPending} onClick={() => mutation.mutate(draft)}>
          Enregistrer les permissions
        </Button>
      </Box>
    </Paper>
  );
}

/** Réglages globaux et permissions par rôle (US8). */
export function SettingsAdminPage() {
  const settings = useAdminSettings();
  const permissions = useRolePermissions();

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      {settings.isPending ? (
        <LoadingState label="Chargement des réglages" />
      ) : settings.error ? (
        <ErrorState message="Impossible de charger les réglages." actionLabel="Réessayer" onAction={() => void settings.refetch()} />
      ) : (
        <SettingsForm settings={settings.data} />
      )}
      {permissions.isPending ? (
        <LoadingState label="Chargement des permissions" />
      ) : permissions.error ? (
        <ErrorState message="Impossible de charger les permissions." actionLabel="Réessayer" onAction={() => void permissions.refetch()} />
      ) : (
        <RolePermissionsForm permissions={permissions.data} />
      )}
    </Box>
  );
}
