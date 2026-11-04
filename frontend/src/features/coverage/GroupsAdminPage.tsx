import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { CircleOff, KeyRound, Pencil, TriangleAlert, UsersRound } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { IconAction } from '../../components/IconAction';
import { LoadingState } from '../../components/LoadingState';
import { SectionHeader } from '../../components/SectionHeader';
import { useToast } from '../../components/Toast';
import { font, icon } from '../../design/tokens';
import { useAdminUsers } from '../admin/api';
import { useAdminGroups, useSaveGroup, type AdminGroup } from './adminApi';
import type { Person } from './types';
import { isPlural, t } from '../../i18n';

function summaryText(g: AdminGroup): string {
  const counts = t('{members} · {available}', {
    members: t(isPlural(g.memberCount) ? '{count} membres' : '{count} membre', { count: g.memberCount }),
    available: t(isPlural(g.availableCount) ? '{count} disponibles' : '{count} disponible', { count: g.availableCount }),
  });
  return g.members.length > 0
    ? t('{counts} : {names}', { counts, names: g.members.map((m) => m.displayName).join(', ') })
    : counts;
}

function GroupFormDialog({ group, onClose, onSaved }: { group: AdminGroup | null | undefined; onClose: () => void; onSaved: (message: string) => void }) {
  const titleId = useId();
  const users = useAdminUsers();
  const save = useSaveGroup();
  const [name, setName] = useState(group?.name ?? '');
  const [active, setActive] = useState(group?.active ?? true);
  const [members, setMembers] = useState<Person[]>(group?.members ?? []);
  const [nameError, setNameError] = useState<string | null>(null);
  // Tout compte actif : un admin peut être enseignant, un super administrateur surveillant (R7).
  const options: Person[] = (users.data ?? []).filter((u) => u.active).map((u) => ({ id: u.id, displayName: u.displayName }));

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!name.trim()) {
      setNameError(t('Le nom est obligatoire.'));
      return;
    }
    setNameError(null);
    save.mutate(
      { id: group?.id, name: name.trim(), active, memberIds: members.map((m) => m.id) },
      { onSuccess: () => onSaved(group ? t('Groupe enregistré.') : t('Groupe créé.')) },
    );
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <Box component="form" noValidate onSubmit={submit}>
        <DialogTitle id={titleId}>{group ? t('Modifier : {name}', { name: group.name }) : t('Nouveau groupe d’employés')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2.5, pt: '8px !important' }}>
          <TextField
            id="groupe-nom"
            label={t('Nom du groupe')}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={Boolean(nameError)}
            helperText={nameError ?? (group?.systemKey ? t('Groupe utilisé par les affectations : le nom peut changer, pas son rôle.') : t('Par exemple : Équipe de cantine.'))}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
          {group && !group.systemKey && (
            <FormControlLabel control={<Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} />} label={t('Groupe actif')} />
          )}
          <Autocomplete
            multiple
            id="groupe-membres"
            options={options}
            value={members}
            onChange={(_e, value) => setMembers(value)}
            getOptionLabel={(o) => o.displayName}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            loading={users.isPending}
            noOptionsText={t('Aucun employé')}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('Membres')}
                helperText={
                  group?.systemKey === 'SUPERVISORS'
                    ? t('Surveillants : ils peuvent être assignés et déclarer une classe vide.')
                    : group?.systemKey === 'TEACHERS'
                      ? t('Enseignants : ils peuvent signaler un retard ou une absence.')
                      : t('Comptes membres du groupe.')
                }
              />
            )}
          />
          {members.length === 0 && group?.systemKey === 'SUPERVISORS' && (
            <Alert severity="warning">{t('Sans surveillant, aucune affectation ne peut être assignée.')}</Alert>
          )}
          {save.error && <Alert severity="error">{save.error instanceof ApiError ? save.error.message : t('Enregistrement impossible.')}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('Annuler')}</Button>
          <Button type="submit" variant="contained" loading={save.isPending}>
            {t('Enregistrer le groupe')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

/** Groupes d'employés ; Surveillants et Enseignants sont utilisés par les affectations (clé système, R7). */
export function GroupsAdminPage() {
  const groups = useAdminGroups();
  const toast = useToast();
  const [form, setForm] = useState<{ group: AdminGroup | null } | null>(null);

  return (
    <Box component="section" aria-labelledby="titre-groupes">
      <SectionHeader
        id="titre-groupes"
        title={t('Groupes d’employés')}
        description={t('Les membres du groupe Surveillants sont assignables ; ceux du groupe Enseignants signalent leurs retards et absences.')}
        action={
          <Button variant="contained" startIcon={<UsersRound size={icon.sm} aria-hidden="true" />} onClick={() => setForm({ group: null })}>
            {t('Nouveau groupe')}
          </Button>
        }
      />
      {groups.isPending ? (
        <LoadingState label={t('Chargement des groupes')} />
      ) : groups.error ? (
        <ErrorState message={t('Impossible de charger les groupes.')} actionLabel={t('Réessayer')} onAction={() => void groups.refetch()} />
      ) : groups.data.length === 0 ? (
        <Paper variant="outlined">
          <EmptyState icon={UsersRound} title={t('Aucun groupe')} description={t('Les groupes Surveillants et Enseignants sont créés par la mise à jour.')} />
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box component="ul" aria-label={t('Groupes')} sx={{ listStyle: 'none', m: 0, p: 0, '& > li + li': { borderTop: 1, borderColor: 'divider' } }}>
            {groups.data.map((g) => (
              <Box component="li" key={g.id} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', px: { xs: 2, md: 2.5 }, py: 2 }}>
                <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontWeight: font.medium }}>{g.name}</Typography>
                    {g.systemKey && (
                      <Badge tone="info" icon={KeyRound}>
                        {g.systemKey === 'SUPERVISORS' ? t('Groupe des surveillants') : t('Groupe des enseignants')}
                      </Badge>
                    )}
                    {!g.active && (
                      <Badge tone="neutral" icon={CircleOff}>
                        {t('Inactif')}
                      </Badge>
                    )}
                    {g.active && g.memberCount === 0 && (
                      <Badge tone="error" icon={TriangleAlert}>
                        {t('Groupe vide')}
                      </Badge>
                    )}
                    {g.active && g.memberCount > 0 && g.availableCount === 0 && (
                      <Badge tone="warning" icon={TriangleAlert}>
                        {t('Personne de disponible')}
                      </Badge>
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
                    {summaryText(g)}
                  </Typography>
                </Box>
                <IconAction icon={Pencil} label={t('Modifier le groupe {name}', { name: g.name })} tooltip={t('Modifier')} onClick={() => setForm({ group: g })} />
              </Box>
            ))}
          </Box>
        </Paper>
      )}
      {form && (
        <GroupFormDialog
          group={form.group}
          onClose={() => setForm(null)}
          onSaved={(message) => {
            setForm(null);
            toast.success(message);
          }}
        />
      )}
    </Box>
  );
}
