import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, apiFetch } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { useCurrentUser } from '../auth/useCurrentUser';
import { adminKeys, useAdminUsers, type AdminUser } from './api';
import { ConfirmDialog } from './ConfirmDialog';
import { ROLE_LABELS } from './labels';
import { TemporaryPasswordDialog } from './TemporaryPasswordDialog';
import { UserFormDialog } from './UserFormDialog';

type Pending = { kind: 'deactivate' | 'reset'; user: AdminUser } | null;

/** Comptes (US8) : création, modification, désactivation, réinitialisation du mot de passe. */
export function UsersAdminPage() {
  const me = useCurrentUser();
  const users = useAdminUsers();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{ user: AdminUser | null } | null>(null);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [password, setPassword] = useState<{ password: string; displayName: string } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const action = useMutation({
    mutationFn: ({ kind, user }: NonNullable<Pending> | { kind: 'reactivate'; user: AdminUser }): Promise<AdminUser | { temporaryPassword: string }> =>
      kind === 'reset'
        ? apiFetch<{ temporaryPassword: string }>(`/api/admin/users/${user.id}/reset-password`, { method: 'POST' })
        : apiFetch<AdminUser>(`/api/admin/users/${user.id}`, { method: 'PATCH', body: { active: kind === 'reactivate' } }),
    onSuccess: async (result, { kind, user }) => {
      setConfirm(null);
      await queryClient.invalidateQueries({ queryKey: adminKeys.users });
      if (kind === 'reset') setPassword({ password: (result as { temporaryPassword: string }).temporaryPassword, displayName: user.displayName });
      else setFeedback(kind === 'deactivate' ? `Compte de ${user.displayName} désactivé.` : `Compte de ${user.displayName} réactivé.`);
    },
  });
  const actionError = action.error instanceof ApiError ? action.error.message : action.error ? 'Action impossible.' : null;

  return (
    <Box component="section" aria-labelledby="titre-comptes">
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2 }}>
        <Typography id="titre-comptes" component="h2" variant="h6">
          Comptes
        </Typography>
        <Button variant="contained" onClick={() => setForm({ user: null })}>
          Nouveau compte
        </Button>
      </Box>

      {feedback && (
        <Alert severity="success" role="status" onClose={() => setFeedback(null)} sx={{ mb: 2 }}>
          {feedback}
        </Alert>
      )}
      {actionError && !confirm && (
        <Alert severity="error" role="alert" sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      )}

      {users.isPending ? (
        <LoadingState label="Chargement des comptes" />
      ) : users.error ? (
        <ErrorState message="Impossible de charger les comptes." actionLabel="Réessayer" onAction={() => void users.refetch()} />
      ) : (
        <Box component="ul" aria-label="Comptes" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
          {users.data.map((user) => {
            const self = user.id === me.data?.id;
            return (
              <Paper component="li" key={user.id} variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{user.displayName}</Typography>
                  {!user.active && <Chip size="small" label="Désactivé" />}
                  {user.mustChangePassword && user.active && <Chip size="small" color="warning" label="Mot de passe à changer" />}
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                  {user.username} · {ROLE_LABELS[user.role]}
                  {user.jobTitle ? ` · ${user.jobTitle}` : ''}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                  <Button size="small" variant="outlined" aria-label={`Modifier le compte de ${user.displayName}`} onClick={() => setForm({ user })}>
                    Modifier
                  </Button>
                  {!self && user.active && (
                    <>
                      <Button
                        size="small"
                        variant="outlined"
                        aria-label={`Réinitialiser le mot de passe de ${user.displayName}`}
                        onClick={() => setConfirm({ kind: 'reset', user })}
                      >
                        Réinitialiser le mot de passe
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        aria-label={`Désactiver le compte de ${user.displayName}`}
                        onClick={() => setConfirm({ kind: 'deactivate', user })}
                      >
                        Désactiver
                      </Button>
                    </>
                  )}
                  {!user.active && (
                    <Button
                      size="small"
                      variant="outlined"
                      aria-label={`Réactiver le compte de ${user.displayName}`}
                      loading={action.isPending && action.variables?.user.id === user.id}
                      onClick={() => action.mutate({ kind: 'reactivate', user })}
                    >
                      Réactiver
                    </Button>
                  )}
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      <UserFormDialog
        open={form !== null}
        user={form?.user}
        isSelf={form?.user?.id === me.data?.id}
        onClose={() => setForm(null)}
        onCreated={({ user, temporaryPassword }) => {
          setForm(null);
          setFeedback(`Compte de ${user.displayName} créé.`);
          setPassword({ password: temporaryPassword, displayName: user.displayName });
        }}
        onSaved={(message) => {
          setForm(null);
          setFeedback(message);
        }}
      />

      <ConfirmDialog
        open={confirm?.kind === 'deactivate'}
        title="Désactiver ce compte ?"
        confirmLabel="Désactiver le compte"
        pending={action.isPending}
        error={actionError}
        onConfirm={() => confirm && action.mutate(confirm)}
        onClose={() => {
          setConfirm(null);
          action.reset();
        }}
      >
        {confirm?.user.displayName} sera déconnecté immédiatement et ne pourra plus se connecter. Ses demandes et son historique sont
        conservés.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === 'reset'}
        title="Réinitialiser le mot de passe ?"
        confirmLabel="Réinitialiser"
        pending={action.isPending}
        error={actionError}
        onConfirm={() => confirm && action.mutate(confirm)}
        onClose={() => {
          setConfirm(null);
          action.reset();
        }}
      >
        {confirm?.user.displayName} sera déconnecté et devra se connecter avec un nouveau mot de passe provisoire.
      </ConfirmDialog>

      <TemporaryPasswordDialog value={password} onClose={() => setPassword(null)} />
    </Box>
  );
}
