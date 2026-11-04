import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { ApiError, fieldErrors } from '../../api/client';
import { locale, t } from '../../i18n';
import { adminKeys, saveGuideline, useAdminCategories, type AdminGuideline, type GuidelineInput } from './api';

const TITLE_MAX = 120;
const BODY_MAX = 4000;
/** Valeur de la liste « Portée » pour une consigne générale (categoryId null). */
const GENERAL = '';

interface Values {
  title: string;
  body: string;
  categoryId: string;
  active: boolean;
}

function initialValues(guideline: AdminGuideline | null | undefined): Values {
  return {
    title: guideline?.title ?? '',
    body: guideline?.body ?? '',
    categoryId: guideline?.categoryId ?? GENERAL,
    active: guideline?.active ?? true,
  };
}

function validate(v: Values): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.title.trim()) errors.title = t('Le titre est obligatoire.');
  if (!v.body.trim()) errors.body = t('Le texte est obligatoire.');
  return errors;
}

function toInput(v: Values): GuidelineInput {
  return { title: v.title.trim(), body: v.body.trim(), categoryId: v.categoryId || null, active: v.active };
}

interface GuidelineFormDialogProps {
  open: boolean;
  guideline?: AdminGuideline | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Création ou modification d'une consigne (spec 009, US3) : titre, texte, portée et état. */
export function GuidelineFormDialog({ open, guideline, onClose, onSaved }: GuidelineFormDialogProps) {
  const titleId = useId();
  const queryClient = useQueryClient();
  const categories = useAdminCategories();
  const [values, setValues] = useState<Values>(() => initialValues(guideline));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  // Portée : catégories de demande de travail actives, plus la catégorie actuelle si elle ne l'est plus.
  const scopes = (categories.data ?? []).filter(
    (c) => c.kind === 'WORK' && (c.active || c.id === guideline?.categoryId),
  );

  const mutation = useMutation({
    mutationFn: (v: Values) => saveGuideline(guideline?.id ?? null, toInput(v)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.guidelines });
      onSaved(guideline ? t('Consigne enregistrée.') : t('Consigne créée.'));
    },
    onError: (error) => setErrors(fieldErrors(error)),
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length === 0) mutation.mutate(values);
  }

  const generalError =
    mutation.error instanceof ApiError
      ? Object.keys(fieldErrors(mutation.error)).length > 0
        ? null
        : mutation.error.message
      : mutation.error
        ? t('Enregistrement impossible.')
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
            setValues(initialValues(guideline));
            setErrors({});
            mutation.reset();
          },
        },
      }}
    >
      <Box component="form" noValidate onSubmit={submit}>
        <DialogTitle id={titleId}>{guideline ? t('Modifier : {title}', { title: guideline.title }) : t('Nouvelle consigne')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2.5, pt: '8px !important' }}>
          <TextField
            id="consigne-titre"
            label={t('Titre')}
            required
            value={values.title}
            onChange={(e) => set({ title: e.target.value })}
            error={Boolean(errors.title)}
            helperText={errors.title}
            slotProps={{ htmlInput: { maxLength: TITLE_MAX } }}
          />
          <TextField
            id="consigne-texte"
            label={t('Texte')}
            required
            multiline
            minRows={4}
            value={values.body}
            onChange={(e) => set({ body: e.target.value })}
            error={Boolean(errors.body)}
            helperText={
              errors.body ??
              t('Vous pouvez indiquer une priorité sous la forme « Priorité : Haute ». {count} / {max}', {
                count: values.body.length,
                max: BODY_MAX.toLocaleString(locale()),
              })
            }
            slotProps={{ htmlInput: { maxLength: BODY_MAX } }}
          />
          <TextField
            select
            id="consigne-portee"
            label={t('Portée')}
            value={values.categoryId}
            onChange={(e) => set({ categoryId: e.target.value })}
            error={Boolean(errors.categoryId)}
            helperText={errors.categoryId ?? t('Une consigne générale s’applique à toutes les demandes de travail.')}
          >
            <MenuItem value={GENERAL}>{t('Générale')}</MenuItem>
            {scopes.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={<Checkbox checked={values.active} onChange={(e) => set({ active: e.target.checked })} />}
            label={t('Active (utilisée pour les propositions automatiques)')}
          />

          {generalError && (
            <Alert severity="error" role="alert">
              {generalError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('Annuler')}</Button>
          <Button type="submit" variant="contained" loading={mutation.isPending}>
            {t('Enregistrer la consigne')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
