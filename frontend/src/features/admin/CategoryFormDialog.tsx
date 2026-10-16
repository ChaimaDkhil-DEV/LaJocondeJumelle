import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { ApiError, apiFetch, fieldErrors } from '../../api/client';
import type { Role } from '../../api/types';
import {
  adminKeys,
  useAdminUsers,
  type AdminCategory,
  type AssignmentMode,
  type CategoryKind,
  type Circuit,
  type ClosureMode,
  type Member,
  type ProofMode,
  type RoutingMode,
} from './api';
import { ASSIGNMENT_LABELS, CLOSURE_LABELS, formatMinutes, KIND_LABELS, PROOF_MODE_LABELS, ROLE_LABELS, ROUTING_HINTS, ROUTING_LABELS } from './labels';

interface Values {
  name: string;
  active: boolean;
  kind: CategoryKind;
  proofMode: ProofMode;
  circuit: Circuit;
  routingMode: RoutingMode;
  creatorRoles: Role[];
  closureMode: ClosureMode;
  autoCloseAfterMinutes: string;
  finalValidation: boolean;
  assignmentMode: AssignmentMode;
  autoAssigneeId: string;
  photoRequired: boolean;
  recipients: Member[];
  managers: Member[];
}

function initialValues(category: AdminCategory | null | undefined): Values {
  return {
    name: category?.name ?? '',
    active: category?.active ?? true,
    kind: category?.kind ?? 'WORK',
    proofMode: category?.proofMode ?? 'BOTH',
    circuit: category?.circuit ?? 'A_DIRECT',
    routingMode: category?.routingMode ?? 'DIRECT',
    creatorRoles: category?.creatorRoles ?? ['EMPLOYEE', 'MANAGER'],
    closureMode: category?.closureMode ?? 'REQUESTER',
    autoCloseAfterMinutes: String(category?.autoCloseAfterMinutes ?? 1440),
    finalValidation: category?.finalValidation ?? false,
    assignmentMode: category?.assignmentMode ?? 'MANUAL',
    autoAssigneeId: category?.autoAssigneeId ?? '',
    photoRequired: category?.photoRequired ?? false,
    recipients: category?.recipients ?? [],
    managers: category?.managers ?? [],
  };
}

function validate(v: Values): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.name.trim()) errors.name = 'Le nom est obligatoire.';
  if (v.kind === 'COVERAGE') return errors;
  if (v.creatorRoles.length === 0) errors.creatorRoles = 'Choisissez au moins un rôle.';
  if (v.closureMode === 'AUTO' && !/^\d+$/.test(v.autoCloseAfterMinutes.trim()))
    errors.autoCloseAfterMinutes = 'Nombre entier de minutes attendu (0 = immédiat).';
  if (v.circuit === 'B_ADMIN_VALIDATION' && v.assignmentMode === 'AUTO') {
    if (!v.autoAssigneeId) errors.autoAssigneeId = 'Choisissez l’employé désigné.';
    else if (!v.recipients.some((r) => r.id === v.autoAssigneeId))
      errors.autoAssigneeId = 'L’employé désigné doit faire partie des destinataires.';
  }
  return errors;
}

const ids = (members: Member[]) => members.map((m) => m.id).sort();
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Enregistre la catégorie puis ses destinataires et responsables (routes séparées, contracts/rest-api.md).
 * L'affectation automatique exige que l'employé désigné soit déjà destinataire : l'ordre des appels en tient compte.
 */
async function saveCategory(current: AdminCategory | null, v: Values): Promise<AdminCategory> {
  if (v.kind === 'COVERAGE') return saveCoverageCategory(current, v);
  const circuitB = v.circuit === 'B_ADMIN_VALIDATION';
  const auto = circuitB && v.assignmentMode === 'AUTO';
  const fields = {
    name: v.name.trim(),
    routingMode: v.routingMode,
    circuit: v.circuit,
    creatorRoles: v.creatorRoles,
    closureMode: v.closureMode,
    autoCloseAfterMinutes: v.closureMode === 'AUTO' ? Number(v.autoCloseAfterMinutes) : (current?.autoCloseAfterMinutes ?? 1440),
    finalValidation: circuitB && v.finalValidation,
    photoRequired: v.photoRequired,
  };
  const recipientIds = ids(v.recipients);
  const managerIds = ids(v.managers);
  const put = (id: string, kind: 'recipients' | 'managers', userIds: string[]) =>
    apiFetch<AdminCategory>(`/api/admin/categories/${id}/${kind}`, { method: 'PUT', body: { userIds } });

  if (!current) {
    let saved = await apiFetch<AdminCategory>('/api/admin/categories', {
      method: 'POST',
      body: { ...fields, assignmentMode: 'MANUAL', autoAssigneeId: null },
    });
    if (recipientIds.length > 0) saved = await put(saved.id, 'recipients', recipientIds);
    if (managerIds.length > 0) saved = await put(saved.id, 'managers', managerIds);
    if (auto) {
      saved = await apiFetch<AdminCategory>(`/api/admin/categories/${saved.id}`, {
        method: 'PATCH',
        body: { assignmentMode: 'AUTO', autoAssigneeId: v.autoAssigneeId },
      });
    }
    return saved;
  }

  const patch = {
    ...fields,
    active: v.active,
    assignmentMode: auto ? 'AUTO' : 'MANUAL',
    autoAssigneeId: auto ? v.autoAssigneeId : null,
  };
  const currentRecipients = ids(current.recipients);
  let saved: AdminCategory;
  if (auto) {
    // Destinataires d'abord (en gardant provisoirement l'ancien employé désigné), puis l'affectation.
    const keep = current.assignmentMode === 'AUTO' && current.autoAssigneeId ? [current.autoAssigneeId] : [];
    const interim = [...new Set([...recipientIds, ...keep])].sort();
    if (!same(interim, currentRecipients)) await put(current.id, 'recipients', interim);
    saved = await apiFetch<AdminCategory>(`/api/admin/categories/${current.id}`, { method: 'PATCH', body: patch });
    if (!same(interim, recipientIds)) saved = await put(current.id, 'recipients', recipientIds);
  } else {
    saved = await apiFetch<AdminCategory>(`/api/admin/categories/${current.id}`, { method: 'PATCH', body: patch });
    if (!same(recipientIds, currentRecipients)) saved = await put(current.id, 'recipients', recipientIds);
  }
  if (!same(managerIds, ids(current.managers))) saved = await put(current.id, 'managers', managerIds);
  return saved;
}

/**
 * Catégorie de couverture : créée par les responsables, diffusée à des groupes d'employés (pas de
 * destinataires), preuve de présence et validation finale configurables. Le type ne change plus ensuite.
 */
async function saveCoverageCategory(current: AdminCategory | null, v: Values): Promise<AdminCategory> {
  const fields = {
    name: v.name.trim(),
    circuit: 'A_DIRECT' as const,
    creatorRoles: ['MANAGER'] as Role[],
    closureMode: 'MANAGER' as const,
    autoCloseAfterMinutes: 0,
    finalValidation: v.finalValidation,
    photoRequired: false,
    proofMode: v.proofMode,
  };
  const managerIds = ids(v.managers);
  const putManagers = (id: string) =>
    apiFetch<AdminCategory>(`/api/admin/categories/${id}/managers`, { method: 'PUT', body: { userIds: managerIds } });
  if (!current) {
    let saved = await apiFetch<AdminCategory>('/api/admin/categories', { method: 'POST', body: { ...fields, kind: 'COVERAGE' } });
    if (managerIds.length > 0) saved = await putManagers(saved.id);
    return saved;
  }
  let saved = await apiFetch<AdminCategory>(`/api/admin/categories/${current.id}`, { method: 'PATCH', body: { ...fields, active: v.active } });
  if (!same(managerIds, ids(current.managers))) saved = await putManagers(current.id);
  return saved;
}

interface CategoryFormDialogProps {
  open: boolean;
  category?: AdminCategory | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Création ou modification d'une catégorie : circuit, modes, photo, destinataires et responsables. */
export function CategoryFormDialog({ open, category, onClose, onSaved }: CategoryFormDialogProps) {
  const titleId = useId();
  const queryClient = useQueryClient();
  const users = useAdminUsers();
  const [values, setValues] = useState<Values>(() => initialValues(category));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  const active = (users.data ?? []).filter((u) => u.active);
  const recipientOptions: Member[] = active.map((u) => ({ id: u.id, displayName: u.displayName }));
  const managerOptions: Member[] = active
    .filter((u) => u.role === 'MANAGER' || u.role === 'SUPER_ADMIN')
    .map((u) => ({ id: u.id, displayName: u.displayName }));

  const mutation = useMutation({
    mutationFn: (v: Values) => saveCategory(category ?? null, v),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.categories }),
        queryClient.invalidateQueries({ queryKey: adminKeys.users }),
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
        queryClient.invalidateQueries({ queryKey: ['requests', 'detail'] }),
      ]);
      onSaved(category ? 'Catégorie enregistrée.' : 'Catégorie créée.');
    },
    onError: async (error) => {
      setErrors(fieldErrors(error));
      // Une partie a pu être enregistrée (catégorie créée, destinataires non) : on recharge les listes,
      // y compris celle du formulaire « Nouvelle demande ».
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.categories }),
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
      ]);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length === 0) mutation.mutate(values);
  }

  const generalError =
    mutation.error instanceof ApiError ? mutation.error.message : mutation.error ? 'Enregistrement impossible.' : null;
  const circuitB = values.circuit === 'B_ADMIN_VALIDATION';
  const coverage = values.kind === 'COVERAGE';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="sm"
      slotProps={{
        transition: {
          onEnter: () => {
            setValues(initialValues(category));
            setErrors({});
            mutation.reset();
          },
        },
      }}
    >
      <Box component="form" noValidate onSubmit={submit}>
        <DialogTitle id={titleId}>{category ? `Modifier : ${category.name}` : 'Nouvelle catégorie'}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2.5, pt: '8px !important' }}>
          <Alert severity="info">Les modifications s’appliquent uniquement aux nouvelles demandes.</Alert>
          <TextField
            id="categorie-nom"
            label="Nom de la catégorie"
            required
            value={values.name}
            onChange={(e) => set({ name: e.target.value })}
            error={Boolean(errors.name)}
            helperText={errors.name}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
          {category && (
            <FormControlLabel
              control={<Checkbox checked={values.active} onChange={(e) => set({ active: e.target.checked })} />}
              label="Catégorie active (proposée à la création des demandes)"
            />
          )}

          {category ? (
            <FormHelperText sx={{ mt: -1 }}>Type : {KIND_LABELS[values.kind]} (non modifiable)</FormHelperText>
          ) : (
            <FormControl component="fieldset">
              <FormLabel component="legend">Type de catégorie</FormLabel>
              <RadioGroup value={values.kind} onChange={(e) => set({ kind: e.target.value as CategoryKind })}>
                {(Object.keys(KIND_LABELS) as CategoryKind[]).map((k) => (
                  <FormControlLabel key={k} value={k} control={<Radio />} label={KIND_LABELS[k]} />
                ))}
              </RadioGroup>
              <FormHelperText>Le type ne pourra plus être modifié après la création.</FormHelperText>
            </FormControl>
          )}

          {coverage && (
            <>
              <FormControl component="fieldset">
                <FormLabel component="legend">Preuve de présence exigée</FormLabel>
                <RadioGroup value={values.proofMode} onChange={(e) => set({ proofMode: e.target.value as ProofMode })}>
                  {(Object.keys(PROOF_MODE_LABELS) as ProofMode[]).map((p) => (
                    <FormControlLabel key={p} value={p} control={<Radio />} label={PROOF_MODE_LABELS[p]} />
                  ))}
                </RadioGroup>
              </FormControl>
              <FormControlLabel
                control={<Checkbox checked={values.finalValidation} onChange={(e) => set({ finalValidation: e.target.checked })} />}
                label="Validation finale de la garde par l’administration"
              />
            </>
          )}

          {!coverage && (
            <>
              <FormControl component="fieldset">
                <FormLabel component="legend">Mode de routage</FormLabel>
                <RadioGroup
                  value={values.routingMode}
                  onChange={(e) => {
                    const routingMode = e.target.value as RoutingMode;
                    // Le circuit découle du mode ; hors validation, la clôture ne revient pas à l'administration.
                    set({
                      routingMode,
                      circuit: routingMode === 'VIA_ADMIN' ? 'B_ADMIN_VALIDATION' : 'A_DIRECT',
                      ...(routingMode !== 'VIA_ADMIN' && values.closureMode === 'MANAGER' ? { closureMode: 'REQUESTER' as const } : {}),
                    });
                  }}
                >
                  {(Object.keys(ROUTING_LABELS) as RoutingMode[]).map((m) => (
                    <FormControlLabel key={m} value={m} control={<Radio />} label={ROUTING_LABELS[m]} />
                  ))}
                </RadioGroup>
                <FormHelperText>{ROUTING_HINTS[values.routingMode]}</FormHelperText>
              </FormControl>

              {circuitB && (
                <>
                  <FormControlLabel
                    control={<Checkbox checked={values.finalValidation} onChange={(e) => set({ finalValidation: e.target.checked })} />}
                    label="Validation finale par un responsable"
                  />
                  <FormControl component="fieldset">
                    <FormLabel component="legend">Affectation après approbation</FormLabel>
                    <RadioGroup value={values.assignmentMode} onChange={(e) => set({ assignmentMode: e.target.value as AssignmentMode })}>
                      {(Object.keys(ASSIGNMENT_LABELS) as AssignmentMode[]).map((m) => (
                        <FormControlLabel key={m} value={m} control={<Radio />} label={ASSIGNMENT_LABELS[m]} />
                      ))}
                    </RadioGroup>
                  </FormControl>
                </>
              )}

              <FormControl component="fieldset" error={Boolean(errors.creatorRoles)}>
                <FormLabel component="legend">Qui peut créer une demande</FormLabel>
                <FormGroup>
                  {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                    <FormControlLabel
                      key={role}
                      label={ROLE_LABELS[role]}
                      control={
                        <Checkbox
                          checked={values.creatorRoles.includes(role)}
                          onChange={(e) =>
                            set({ creatorRoles: e.target.checked ? [...values.creatorRoles, role] : values.creatorRoles.filter((r) => r !== role) })
                          }
                        />
                      }
                    />
                  ))}
                </FormGroup>
                {errors.creatorRoles && <FormHelperText>{errors.creatorRoles}</FormHelperText>}
              </FormControl>

              <TextField
                select
                id="categorie-cloture"
                label="Clôture"
                value={values.closureMode}
                onChange={(e) => set({ closureMode: e.target.value as ClosureMode })}
              >
                {(Object.keys(CLOSURE_LABELS) as ClosureMode[]).map((m) => (
                  <MenuItem key={m} value={m} disabled={m === 'MANAGER' && values.routingMode !== 'VIA_ADMIN'}>
                    {CLOSURE_LABELS[m]}
                  </MenuItem>
                ))}
              </TextField>
              {values.closureMode === 'AUTO' && (
                <TextField
                  id="categorie-delai-cloture"
                  label="Délai avant clôture automatique (minutes)"
                  value={values.autoCloseAfterMinutes}
                  onChange={(e) => set({ autoCloseAfterMinutes: e.target.value })}
                  error={Boolean(errors.autoCloseAfterMinutes)}
                  helperText={
                    errors.autoCloseAfterMinutes ??
                    (/^\d+$/.test(values.autoCloseAfterMinutes) ? `Le demandeur peut contester pendant ${formatMinutes(Number(values.autoCloseAfterMinutes))}.` : ' ')
                  }
                  slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*' } }}
                />
              )}

              <FormControlLabel
                control={<Checkbox checked={values.photoRequired} onChange={(e) => set({ photoRequired: e.target.checked })} />}
                label="Photo de preuve obligatoire"
              />

              <Autocomplete
                multiple
                id="categorie-destinataires"
                options={recipientOptions}
                value={values.recipients}
                onChange={(_e, recipients) => set({ recipients })}
                getOptionLabel={(o) => o.displayName}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                loading={users.isPending}
                noOptionsText="Aucun compte"
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Destinataires"
                    helperText={
                      values.routingMode === 'VIA_ADMIN'
                        ? 'Employés qui peuvent réaliser les demandes après approbation.'
                        : values.routingMode === 'PEER'
                          ? 'Enseignants à qui un collègue peut écrire.'
                          : 'Service qui reçoit les demandes (un seul destinataire : choisi automatiquement).'
                    }
                  />
                )}
              />
              {circuitB && values.assignmentMode === 'AUTO' && (
                <TextField
                  select
                  id="categorie-employe-designe"
                  label="Employé désigné"
                  value={values.autoAssigneeId}
                  onChange={(e) => set({ autoAssigneeId: e.target.value })}
                  error={Boolean(errors.autoAssigneeId)}
                  helperText={errors.autoAssigneeId ?? 'Choisi parmi les destinataires.'}
                >
                  {values.recipients.map((r) => (
                    <MenuItem key={r.id} value={r.id}>
                      {r.displayName}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </>
          )}
          <Autocomplete
            multiple
            id="categorie-responsables"
            options={managerOptions}
            value={values.managers}
            onChange={(_e, managers) => set({ managers })}
            getOptionLabel={(o) => o.displayName}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            loading={users.isPending}
            noOptionsText="Aucun responsable"
            renderInput={(params) => (
              <TextField {...params} label="Responsables" helperText="Responsables et super administrateurs uniquement." />
            )}
          />

          {generalError && (
            <Alert severity="error" role="alert">
              {generalError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="contained" loading={mutation.isPending}>
            Enregistrer la catégorie
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
