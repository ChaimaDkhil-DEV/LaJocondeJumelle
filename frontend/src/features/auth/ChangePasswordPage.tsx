import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { ApiError, fieldErrors } from '../../api/client';
import { LoadingState } from '../../components/LoadingState';
import { AuthLayout } from './AuthLayout';
import { useChangePassword, useCurrentUser } from './useCurrentUser';

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

  if (me.isPending) return <LoadingState />;
  if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/connexion" replace />;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const next: Errors = {
      currentPassword: currentPassword ? undefined : 'Saisissez votre mot de passe actuel.',
      newPassword: newPassword.length >= MIN_LENGTH ? undefined : `Au moins ${MIN_LENGTH} caractères.`,
      confirmation:
        confirmation === newPassword ? undefined : 'Les deux mots de passe ne correspondent pas.',
    };
    setErrors(next);
    if (next.currentPassword || next.newPassword || next.confirmation) return;

    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => navigate('/', { replace: true }),
        onError: (error) => setErrors(fieldErrors(error)),
      },
    );
  }

  const apiError = changePassword.error;
  const generalMessage =
    apiError instanceof ApiError && Object.keys(fieldErrors(apiError)).length === 0 ? apiError.message : null;

  return (
    <AuthLayout title="Changer votre mot de passe">
      {me.data?.mustChangePassword && (
        <Typography sx={{ mb: 2 }}>
          Pour sécuriser votre compte, choisissez un nouveau mot de passe d’au moins {MIN_LENGTH} caractères.
        </Typography>
      )}
      <form noValidate onSubmit={handleSubmit}>
        <Stack spacing={2}>
          {generalMessage && <Alert severity="error">{generalMessage}</Alert>}
          <TextField
            id="current-password"
            label="Mot de passe actuel"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            error={Boolean(errors.currentPassword)}
            helperText={errors.currentPassword}
          />
          <TextField
            id="new-password"
            label="Nouveau mot de passe"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={Boolean(errors.newPassword)}
            helperText={errors.newPassword ?? `Au moins ${MIN_LENGTH} caractères.`}
          />
          <TextField
            id="confirm-password"
            label="Confirmer le nouveau mot de passe"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            error={Boolean(errors.confirmation)}
            helperText={errors.confirmation}
          />
          <Button type="submit" variant="contained" size="large" loading={changePassword.isPending}>
            Enregistrer le mot de passe
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}
