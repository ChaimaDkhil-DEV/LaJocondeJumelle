import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { KeyRound, LogIn, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import { fieldIcon } from '../../components/fieldIcon';
import { AuthLayout } from './AuthLayout';
import { useLogin } from './useCurrentUser';
import { homePathFor } from './homePath';

interface FieldErrors {
  username?: string;
  password?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const from = (location.state as { from?: string } | null)?.from;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextErrors: FieldErrors = {
      username: username.trim() ? undefined : 'Saisissez votre identifiant.',
      password: password ? undefined : 'Saisissez votre mot de passe.',
    };
    setErrors(nextErrors);
    if (nextErrors.username || nextErrors.password) return;

    login.mutate(
      { username: username.trim(), password },
      {
        onSuccess: ({ user }) =>
          navigate(user.mustChangePassword ? '/mot-de-passe' : homePathFor(user.role, from), { replace: true }),
      },
    );
  }

  const apiMessage =
    login.error instanceof ApiError ? login.error.message : login.error ? 'Connexion impossible.' : null;

  return (
    <AuthLayout title="Connexion" description="Connectez-vous avec l’identifiant fourni par votre établissement.">
      <form noValidate onSubmit={handleSubmit}>
        <Stack spacing={2.5}>
          {apiMessage && <Alert severity="error">{apiMessage}</Alert>}
          <TextField
            id="login-username"
            label="Identifiant"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={Boolean(errors.username)}
            helperText={errors.username}
            slotProps={{ htmlInput: { 'aria-required': true }, input: fieldIcon(UserRound) }}
          />
          <TextField
            id="login-password"
            label="Mot de passe"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={Boolean(errors.password)}
            helperText={errors.password}
            slotProps={{ htmlInput: { 'aria-required': true }, input: fieldIcon(KeyRound) }}
          />
          <Button type="submit" variant="contained" size="large" fullWidth loading={login.isPending} endIcon={<LogIn aria-hidden="true" />}>
            Se connecter
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}
