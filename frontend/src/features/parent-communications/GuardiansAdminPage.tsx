import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { UserPlus, Users } from 'lucide-react';
import { useId, useState } from 'react';
import { ApiError, fieldErrors, loadErrorMessage } from '../../api/client';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { icon } from '../../design/tokens';
import { t } from '../../i18n';
import { useStudents, type Student } from '../students/api';
import { fullName, useGuardianMutations, useGuardians, type Guardian } from './api';

/** Représentants légaux, leurs élèves et leur compte parent (015, FR-012) : admin et super administrateur. */
export function GuardiansAdminPage() {
  const guardians = useGuardians();
  const [editing, setEditing] = useState<Guardian | 'new' | null>(null);
  const [account, setAccount] = useState<Guardian | null>(null);
  return (
    <Box>
      <PageHeader
        title={t('Représentants légaux')}
        description={t(
          'Parents et tuteurs des élèves : destinataires des communications des enseignants.',
        )}
        actions={
          <Button
            variant="contained"
            startIcon={<UserPlus size={icon.sm} aria-hidden="true" />}
            onClick={() => setEditing('new')}
          >
            {t('Nouveau représentant')}
          </Button>
        }
      />
      {guardians.isPending ? (
        <LoadingState label={t('Chargement des représentants')} />
      ) : guardians.error ? (
        <ErrorState
          message={loadErrorMessage(guardians.error, t('les représentants'))}
          actionLabel={t('Réessayer')}
          onAction={() => void guardians.refetch()}
        />
      ) : guardians.data.length === 0 ? (
        <Paper variant="elevated">
          <EmptyState
            icon={Users}
            title={t('Aucun représentant')}
            description={t('Ajoutez les parents ou tuteurs et reliez-les à leurs enfants.')}
          />
        </Paper>
      ) : (
        <TableContainer
          component={Paper}
          variant="elevated"
          tabIndex={0}
          aria-label={t('Représentants légaux')}
        >
          <Table size="small" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <TableCell>{t('Représentant')}</TableCell>
                <TableCell>{t('Élèves')}</TableCell>
                <TableCell>{t('Compte parent')}</TableCell>
                <TableCell>
                  <Box
                    component="span"
                    sx={{
                      position: 'absolute',
                      width: 1,
                      height: 1,
                      overflow: 'hidden',
                      clip: 'rect(0 0 0 0)',
                    }}
                  >
                    {t('Actions')}
                  </Box>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {guardians.data.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>
                    {fullName(g)}
                    {g.relationship ? ` (${g.relationship})` : ''}
                    {!g.active && (
                      <>
                        {' '}
                        <Badge tone="neutral">{t('Désactivé')}</Badge>
                      </>
                    )}
                    <Typography variant="body2" color="text.secondary">
                      {[g.email, g.phone].filter(Boolean).join(' · ') || t('Aucune coordonnée')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {g.students.map((s) => `${fullName(s)} (${s.class.name})`).join(', ') || '—'}
                  </TableCell>
                  <TableCell>{g.account ? g.account.username : t('Aucun')}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Button size="small" onClick={() => setEditing(g)}>
                      {t('Modifier')}
                    </Button>
                    {!g.account && g.active && (
                      <Button size="small" onClick={() => setAccount(g)}>
                        {t('Créer le compte parent')}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {editing && (
        <GuardianDialog
          guardian={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {account && <AccountDialog guardian={account} onClose={() => setAccount(null)} />}
    </Box>
  );
}

function GuardianDialog({ guardian, onClose }: { guardian: Guardian | null; onClose: () => void }) {
  const titleId = useId();
  const toast = useToast();
  const students = useStudents();
  const { save } = useGuardianMutations();
  const [form, setForm] = useState({
    firstName: guardian?.firstName ?? '',
    lastName: guardian?.lastName ?? '',
    relationship: guardian?.relationship ?? '',
    phone: guardian?.phone ?? '',
    email: guardian?.email ?? '',
    active: guardian?.active ?? true,
  });
  const [selected, setSelected] = useState<Array<{ id: string; label: string }>>(
    (guardian?.students ?? []).map((s) => ({
      id: s.id,
      label: `${fullName(s)} (${s.class.name})`,
    })),
  );
  const errors = fieldErrors(save.error);
  const options = (students.data ?? [])
    .filter((s: Student) => s.active)
    .map((s: Student) => ({ id: s.id, label: `${fullName(s)} (${s.class.name})` }));

  function submit(): void {
    save.mutate(
      {
        ...(guardian ? { id: guardian.id, active: form.active } : {}),
        firstName: form.firstName,
        lastName: form.lastName,
        relationship: form.relationship || null,
        phone: form.phone || null,
        email: form.email || null,
        studentIds: selected.map((s) => s.id),
      },
      {
        onSuccess: () => {
          toast.success(guardian ? t('Représentant modifié.') : t('Représentant ajouté.'));
          onClose();
        },
      },
    );
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <DialogTitle id={titleId}>
        {guardian ? t('Modifier le représentant') : t('Nouveau représentant')}
      </DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        {(
          [
            ['firstName', t('Prénom'), true],
            ['lastName', t('Nom'), true],
            ['relationship', t('Lien de parenté'), false],
            ['email', t('E-mail'), false],
            ['phone', t('Téléphone (WhatsApp)'), false],
          ] as const
        ).map(([key, label, required]) => (
          <TextField
            key={key}
            id={`gd-${key}`}
            label={label}
            required={required}
            value={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            error={Boolean(errors[key])}
            helperText={errors[key]}
          />
        ))}
        <Autocomplete
          multiple
          options={options}
          value={selected}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          onChange={(_, value) => setSelected(value)}
          renderInput={(params) => (
            <TextField
              {...params}
              label={t('Élèves')}
              error={Boolean(errors.studentIds)}
              helperText={errors.studentIds}
            />
          )}
        />
        {guardian && (
          <TextField
            select
            id="gd-active"
            label={t('État')}
            value={form.active ? 'on' : 'off'}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'on' }))}
            slotProps={{ select: { native: true } }}
          >
            <option value="on">{t('Actif')}</option>
            <option value="off">{t('Désactivé (le compte parent est aussi désactivé)')}</option>
          </TextField>
        )}
        {save.error && !Object.keys(errors).length && (
          <Alert severity="error" role="alert">
            {save.error instanceof ApiError
              ? save.error.message
              : t('L’enregistrement a échoué. Réessayez.')}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Annuler')}</Button>
        <Button variant="contained" onClick={submit} loading={save.isPending}>
          {t('Enregistrer')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Compte parent : identifiant choisi par l'administration, mot de passe provisoire montré une seule fois. */
function AccountDialog({ guardian, onClose }: { guardian: Guardian; onClose: () => void }) {
  const titleId = useId();
  const { account } = useGuardianMutations();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState<string | null>(null);
  const errors = fieldErrors(account.error);
  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="xs">
      <DialogTitle id={titleId}>
        {t('Compte parent de {name}', { name: fullName(guardian) })}
      </DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        {password ? (
          <Alert severity="success">
            {t(
              'Compte créé. Mot de passe provisoire, à transmettre au parent ; il ne sera plus affiché :',
            )}
            <Typography component="p" sx={{ fontFamily: 'monospace', fontSize: '1.1rem', mt: 1 }}>
              {password}
            </Typography>
            {t('Le parent devra le changer à sa première connexion.')}
          </Alert>
        ) : (
          <>
            <TextField
              id="gd-username"
              label={t('Identifiant')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={Boolean(errors.username)}
              helperText={errors.username ?? t('Lettres sans accent, chiffres, points, tirets.')}
              slotProps={{ htmlInput: { autoComplete: 'off' } }}
            />
            {account.error && !errors.username && (
              <Alert severity="error" role="alert">
                {account.error instanceof ApiError
                  ? account.error.message
                  : t('La création a échoué. Réessayez.')}
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{password ? t('Fermer') : t('Annuler')}</Button>
        {!password && (
          <Button
            variant="contained"
            loading={account.isPending}
            onClick={() =>
              account.mutate(
                { id: guardian.id, username },
                { onSuccess: (r) => setPassword(r.temporaryPassword) },
              )
            }
          >
            {t('Créer le compte')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
