import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, CircleCheck, KeyRound, Pencil, TriangleAlert, UserCheck, UserPlus, UserX } from 'lucide-react';
import { useState } from 'react';
import { ApiError, apiFetch } from '../../api/client';
import { Badge } from '../../components/Badge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { IconAction } from '../../components/IconAction';
import { LoadingState } from '../../components/LoadingState';
import { SectionHeader } from '../../components/SectionHeader';
import { useToast } from '../../components/Toast';
import { Person } from '../../components/UserAvatar';
import { font, fontSize, icon, tokensOf } from '../../design/tokens';
import { useCurrentUser } from '../auth/useCurrentUser';
import { adminKeys, useAdminUsers, type AdminUser } from './api';
import { ROLE_LABELS } from './labels';
import { TemporaryPasswordDialog } from './TemporaryPasswordDialog';
import { UserFormDialog } from './UserFormDialog';

type Pending = { kind: 'deactivate' | 'reset'; user: AdminUser } | null;

/** Colonnes de la liste (bureau), de largeur fixe pour rester alignées d'une ligne à l'autre ; empilées sur mobile. */
const COLUMNS = { md: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.6fr) 184px 116px' };

function AccountState({ user }: { user: AdminUser }) {
  if (!user.active) {
    return (
      <Badge tone="neutral" icon={Ban}>
        Désactivé
      </Badge>
    );
  }
  if (user.mustChangePassword) {
    return (
      <Badge tone="warning" icon={KeyRound}>
        Mot de passe à changer
      </Badge>
    );
  }
  return (
    <Badge tone="success" icon={CircleCheck}>
      Actif
    </Badge>
  );
}

/** Comptes (US8) : création, modification, désactivation, réinitialisation du mot de passe. */
export function UsersAdminPage() {
  const me = useCurrentUser();
  const users = useAdminUsers();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<{ user: AdminUser | null } | null>(null);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [password, setPassword] = useState<{ password: string; displayName: string } | null>(null);

  const action = useMutation({
    mutationFn: ({ kind, user }: NonNullable<Pending> | { kind: 'reactivate'; user: AdminUser }): Promise<AdminUser | { temporaryPassword: string }> =>
      kind === 'reset'
        ? apiFetch<{ temporaryPassword: string }>(`/api/admin/users/${user.id}/reset-password`, { method: 'POST' })
        : apiFetch<AdminUser>(`/api/admin/users/${user.id}`, { method: 'PATCH', body: { active: kind === 'reactivate' } }),
    onSuccess: async (result, { kind, user }) => {
      setConfirm(null);
      await queryClient.invalidateQueries({ queryKey: adminKeys.users });
      if (kind === 'reset') setPassword({ password: (result as { temporaryPassword: string }).temporaryPassword, displayName: user.displayName });
      else toast.success(kind === 'deactivate' ? `Compte de ${user.displayName} désactivé.` : `Compte de ${user.displayName} réactivé.`);
    },
  });
  const actionError = action.error instanceof ApiError ? action.error.message : action.error ? 'Action impossible.' : null;

  return (
    <Box component="section" aria-labelledby="titre-comptes">
      <SectionHeader
        id="titre-comptes"
        title="Comptes"
        description="Créez les comptes du personnel et rattachez-les aux catégories dont ils reçoivent les demandes."
        action={
          <Button variant="contained" startIcon={<UserPlus size={icon.sm} aria-hidden="true" />} onClick={() => setForm({ user: null })}>
            Nouveau compte
          </Button>
        }
      />

      {actionError && !confirm && (
        <Alert severity="error" role="alert" sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      )}

      {users.isPending ? (
        <LoadingState label="Chargement des comptes" />
      ) : users.error ? (
        <ErrorState message="Impossible de charger les comptes." actionLabel="Réessayer" onAction={() => void users.refetch()} />
      ) : users.data.length === 0 ? (
        <Paper variant="outlined">
          <EmptyState title="Aucun compte" description="Créez le premier compte du personnel." />
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box
            aria-hidden="true"
            sx={(theme) => ({
              display: { xs: 'none', md: 'grid' },
              gridTemplateColumns: COLUMNS.md,
              gap: 2,
              px: 2.5,
              py: 1.25,
              bgcolor: tokensOf(theme).surfaceMuted,
              borderBottom: 1,
              borderColor: 'divider',
              color: tokensOf(theme).textSecondary,
              fontSize: fontSize.xs,
              fontWeight: font.medium,
            })}
          >
            <span>Compte</span>
            <span>Rôle</span>
            <span>Catégories</span>
            <span>État</span>
            <span />
          </Box>
          <Box component="ul" aria-label="Comptes" sx={{ listStyle: 'none', m: 0, p: 0, '& > li + li': { borderTop: 1, borderColor: 'divider' } }}>
            {users.data.map((user) => {
              const self = user.id === me.data?.id;
              return (
                <Box
                  component="li"
                  key={user.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', md: COLUMNS.md },
                    alignItems: 'center',
                    gap: { xs: 1, md: 2 },
                    px: { xs: 2, md: 2.5 },
                    py: 1.75,
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Person
                      name={user.displayName}
                      id={user.id}
                      size={32}
                      secondary={`${user.username}${user.jobTitle ? ` · ${user.jobTitle}` : ''}`}
                    />
                  </Box>
                  <Typography variant="body2" sx={{ gridRow: { xs: 2, md: 'auto' } }}>
                    {ROLE_LABELS[user.role]}
                  </Typography>
                  <Box sx={{ minWidth: 0, gridColumn: { xs: '1 / -1', md: 'auto' } }}>
                    {user.recipientCategories.length > 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                        Destinataire : {user.recipientCategories.map((c) => c.name).join(', ')}
                      </Typography>
                    ) : (
                      user.active &&
                      user.role === 'EMPLOYEE' && (
                        <Typography
                          variant="body2"
                          sx={(theme) => ({ color: tokensOf(theme).warning.text, display: 'flex', alignItems: 'flex-start', gap: 0.75 })}
                        >
                          <Box component="span" sx={{ display: 'flex', pt: 0.25, flex: 'none' }}>
                            <TriangleAlert size={icon.sm - 2} aria-hidden="true" />
                          </Box>
                          <span>Destinataire d’aucune catégorie : ne peut pas être affecté.</span>
                        </Typography>
                      )
                    )}
                  </Box>
                  <Box sx={{ gridRow: { xs: 1, md: 'auto' }, gridColumn: { xs: 2, md: 'auto' }, justifySelf: { xs: 'end', md: 'start' } }}>
                    <AccountState user={user} />
                  </Box>
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 0.5,
                      justifyContent: 'flex-end',
                      minWidth: { md: 116 },
                      gridColumn: { xs: '1 / -1', md: 'auto' },
                      mt: { xs: 0.5, md: 0 },
                    }}
                  >
                    <IconAction
                      icon={Pencil}
                      label={`Modifier le compte de ${user.displayName}`}
                      tooltip="Modifier"
                      onClick={() => setForm({ user })}
                    />
                    {!self && user.active && (
                      <>
                        <IconAction
                          icon={KeyRound}
                          label={`Réinitialiser le mot de passe de ${user.displayName}`}
                          tooltip="Réinitialiser le mot de passe"
                          onClick={() => setConfirm({ kind: 'reset', user })}
                        />
                        <IconAction
                          icon={UserX}
                          label={`Désactiver le compte de ${user.displayName}`}
                          tooltip="Désactiver"
                          onClick={() => setConfirm({ kind: 'deactivate', user })}
                          sx={(theme) => ({ '&:hover': { color: tokensOf(theme).error.text, bgcolor: tokensOf(theme).error.soft } })}
                        />
                      </>
                    )}
                    {!user.active && (
                      <IconAction
                        icon={UserCheck}
                        label={`Réactiver le compte de ${user.displayName}`}
                        tooltip="Réactiver"
                        loading={action.isPending && action.variables?.user.id === user.id}
                        onClick={() => action.mutate({ kind: 'reactivate', user })}
                      />
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Paper>
      )}

      <UserFormDialog
        open={form !== null}
        user={form?.user}
        isSelf={form?.user?.id === me.data?.id}
        onClose={() => setForm(null)}
        onCreated={({ user, temporaryPassword }) => {
          setForm(null);
          // La fenêtre du mot de passe provisoire confirme la création : pas de toast qui la recouvrirait.
          setPassword({ password: temporaryPassword, displayName: user.displayName });
        }}
        onSaved={(message) => {
          setForm(null);
          toast.success(message);
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
