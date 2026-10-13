import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { ApiError, apiFetch, fieldErrors } from '../../api/client';
import type { Role } from '../../api/types';
import { adminKeys, useAdminCategories, type AdminUser } from './api';
import { ROLE_LABELS } from './labels';

interface UserFormDialogProps {
  open: boolean;
  /** Compte modifié ; absent : création. */
  user?: AdminUser | null;
  /** Le compte modifié est celui de l'utilisateur connecté (rôle non modifiable). */
  isSelf?: boolean;
  onClose: () => void;
  onCreated: (created: { user: AdminUser; temporaryPassword: string }) => void;
  onSaved: (message: string) => void;
}

interface Values {
  username: string;
  displayName: string;
  jobTitle: string;
  role: Role;
  recipientCategories: CategoryOption[];
}

interface CategoryOption {
  id: string;
  name: string;
}

const USERNAME_FORMAT = /^[a-z0-9._-]+$/;

function validate(values: Values, creating: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  const username = values.username.trim().toLowerCase();
  if (creating) {
    if (!username) errors.username = 'L’identifiant est obligatoire.';
    else if (username.length < 3) errors.username = 'L’identifiant doit comporter au moins 3 caractères.';
    else if (!USERNAME_FORMAT.test(username))
      errors.username = 'L’identifiant ne peut contenir que des lettres sans accent, chiffres, points, tirets et soulignés.';
  }
  if (!values.displayName.trim()) errors.displayName = 'Le nom est obligatoire.';
  return errors;
}

/** Création ou modification d'un compte (nom, fonction, rôle). */
export function UserFormDialog({ open, user, isSelf, onClose, onCreated, onSaved }: UserFormDialogProps) {
  const titleId = useId();
  const queryClient = useQueryClient();
  const creating = !user;
  const initial = (): Values => ({
    username: user?.username ?? '',
    displayName: user?.displayName ?? '',
    jobTitle: user?.jobTitle ?? '',
    role: user?.role ?? 'EMPLOYEE',
    recipientCategories: user?.recipientCategories ?? [],
  });
  const categories = useAdminCategories();
  const categoryOptions: CategoryOption[] = (categories.data ?? []).map((c) => ({ id: c.id, name: c.name }));
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (v: Values): Promise<{ user: AdminUser; temporaryPassword: string } | AdminUser> =>
      creating
        ? apiFetch<{ user: AdminUser; temporaryPassword: string }>('/api/admin/users', {
            method: 'POST',
            body: {
              username: v.username.trim().toLowerCase(),
              displayName: v.displayName.trim(),
              jobTitle: v.jobTitle.trim() || null,
              role: v.role,
              recipientCategoryIds: v.recipientCategories.map((c) => c.id),
            },
          })
        : apiFetch<AdminUser>(`/api/admin/users/${user.id}`, {
            method: 'PATCH',
            body: {
              displayName: v.displayName.trim(),
              jobTitle: v.jobTitle.trim() || null,
              ...(isSelf ? {} : { role: v.role }),
              recipientCategoryIds: v.recipientCategories.map((c) => c.id),
            },
          }),
    onSuccess: async (result) => {
      // Les destinataires changent aussi côté catégories et listes d'affectation.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.users }),
        queryClient.invalidateQueries({ queryKey: adminKeys.categories }),
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
        queryClient.invalidateQueries({ queryKey: ['requests', 'detail'] }),
      ]);
      if (creating) onCreated(result as { user: AdminUser; temporaryPassword: string });
      else onSaved('Compte enregistré.');
    },
    onError: (error) => {
      const fields = fieldErrors(error);
      if (error instanceof ApiError && error.code === 'CONFLICT') fields.username = error.message;
      setErrors(fields);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const found = validate(values, creating);
    setErrors(found);
    if (Object.keys(found).length === 0) mutation.mutate(values);
  }

  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));
  const generalError =
    mutation.error && !(mutation.error instanceof ApiError && ['VALIDATION_ERROR', 'CONFLICT'].includes(mutation.error.code))
      ? mutation.error instanceof ApiError
        ? mutation.error.message
        : 'Enregistrement impossible.'
      : null;

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
            setValues(initial());
            setErrors({});
            mutation.reset();
          },
        },
      }}
    >
      <Box component="form" noValidate onSubmit={submit}>
        <DialogTitle id={titleId}>{creating ? 'Nouveau compte' : `Modifier : ${user.displayName}`}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          {creating && (
            <TextField
              id="compte-identifiant"
              label="Identifiant de connexion"
              required
              value={values.username}
              onChange={(e) => set({ username: e.target.value })}
              error={Boolean(errors.username)}
              helperText={errors.username ?? 'Lettres sans accent, chiffres, points ou tirets (ex. prenom.nom).'}
              slotProps={{ htmlInput: { maxLength: 64, autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } }}
            />
          )}
          <TextField
            id="compte-nom"
            label="Nom affiché"
            required
            value={values.displayName}
            onChange={(e) => set({ displayName: e.target.value })}
            error={Boolean(errors.displayName)}
            helperText={errors.displayName}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            id="compte-fonction"
            label="Fonction (facultatif)"
            value={values.jobTitle}
            onChange={(e) => set({ jobTitle: e.target.value })}
            error={Boolean(errors.jobTitle)}
            helperText={errors.jobTitle}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            select
            id="compte-role"
            label="Rôle"
            value={values.role}
            onChange={(e) => set({ role: e.target.value as Role })}
            disabled={isSelf}
            helperText={isSelf ? 'Vous ne pouvez pas modifier votre propre rôle.' : errors.role}
          >
            {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
              <MenuItem key={role} value={role}>
                {ROLE_LABELS[role]}
              </MenuItem>
            ))}
          </TextField>
          <Autocomplete
            multiple
            id="compte-categories"
            options={categoryOptions}
            value={values.recipientCategories}
            onChange={(_e, recipientCategories) => set({ recipientCategories })}
            getOptionLabel={(o) => o.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            loading={categories.isPending}
            noOptionsText="Aucune catégorie"
            renderInput={(params) => (
              <TextField
                {...params}
                label="Destinataire des catégories"
                error={Boolean(errors.recipientCategoryIds)}
                helperText={
                  errors.recipientCategoryIds ??
                  (values.recipientCategories.length === 0 && values.role === 'EMPLOYEE'
                    ? 'Sans catégorie, ce compte peut créer des demandes mais ne peut ni en recevoir ni être affecté.'
                    : 'Ce compte pourra recevoir les demandes de ces catégories et y être affecté par leurs responsables.')
                }
              />
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
            {creating ? 'Créer le compte' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
