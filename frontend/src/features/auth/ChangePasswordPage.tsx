import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { KeyRound, LockKeyhole } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { ApiError, fieldErrors } from '../../api/client';
import { fieldIcon } from '../../components/fieldIcon';
import { LoadingState } from '../../components/LoadingState';
import { AuthLayout } from './AuthLayout';
import { useChangePassword, useCurrentUser } from './useCurrentUser';
import { t } from '../../i18n';

const MIN_LENGTH = 12;

interface Errors {
  currentPassword?: string;
  newPassword?: string;
  confirmation?: string;
}

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const me = useCurrentUser();
  const changePassword = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  if (me.isPending) return <LoadingState variant="form" />;
  if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/connexion" replace />;

  // Imposé (première connexion, mot de passe réinitialisé) ou volontaire depuis « Mon profil » (spec 005).
  const forced = me.data?.mustChangePassword ?? false;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const next: Errors = {
      currentPassword: currentPassword ? undefined : t('Saisissez votre mot de passe actuel.'),
      newPassword: newPassword.length >= MIN_LENGTH ? undefined : t('Au moins {count} caractères.', { count: MIN_LENGTH }),
      confirmation:
        confirmation === newPassword ? undefined : t('Les deux mots de passe ne correspondent pas.'),
    };
    setErrors(next);
    if (next.currentPassword || next.newPassword || next.confirmation) return;

    // Mode figé à l'envoi : le compte rechargé après le succès n'a plus de changement imposé.
    const wasForced = forced;
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () =>
          wasForced
            ? navigate('/', { replace: true })
            : navigate('/profil', { replace: true, state: { passwordChanged: true } }),
        onError: (error) => setErrors(fieldErrors(error)),
      },
    );
  }

  const apiError = changePassword.error;
  const generalMessage =
    apiError instanceof ApiError && Object.keys(fieldErrors(apiError)).length === 0 ? apiError.message : null;

  return (
    <AuthLayout
      title={t('Changer votre mot de passe')}
      description={
        forced
          ? t('Pour sécuriser votre compte, choisissez un nouveau mot de passe d’au moins {count} caractères.', { count: MIN_LENGTH })
          : undefined
      }
    >
      <form noValidate onSubmit={handleSubmit}>
        <Stack spacing={2.5}>
          {generalMessage && <Alert severity="error">{generalMessage}</Alert>}
          <TextField
            id="current-password"
            label={t('Mot de passe actuel')}
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            error={Boolean(errors.currentPassword)}
            helperText={errors.currentPassword}
            slotProps={{ input: fieldIcon(KeyRound) }}
          />
          <TextField
            id="new-password"
            label={t('Nouveau mot de passe')}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={Boolean(errors.newPassword)}
            helperText={errors.newPassword ?? t('Au moins {count} caractères.', { count: MIN_LENGTH })}
            slotProps={{ input: fieldIcon(LockKeyhole) }}
          />
          <TextField
            id="confirm-password"
            label={t('Confirmer le nouveau mot de passe')}
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            error={Boolean(errors.confirmation)}
            helperText={errors.confirmation}
            slotProps={{ input: fieldIcon(LockKeyhole) }}
          />
          <Button type="submit" variant="contained" size="large" fullWidth loading={changePassword.isPending}>
            {t('Enregistrer le mot de passe')}
          </Button>
          {!forced && (
            <Button variant="text" size="large" fullWidth onClick={() => navigate('/profil')}>
              {t('Annuler')}
            </Button>
          )}
        </Stack>
      </form>
    </AuthLayout>
  );
}
