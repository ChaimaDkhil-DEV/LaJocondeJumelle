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
import { CircleOff, Pencil, TriangleAlert, UsersRound } from 'lucide-react';
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

function GroupFormDialog({ group, onClose, onSaved }: { group: AdminGroup | null | undefined; onClose: () => void; onSaved: (message: string) => void }) {
  const titleId = useId();
  const users = useAdminUsers();
  const save = useSaveGroup();
  const [name, setName] = useState(group?.name ?? '');
  const [active, setActive] = useState(group?.active ?? true);
  const [members, setMembers] = useState<Person[]>(group?.members ?? []);
  const [nameError, setNameError] = useState<string | null>(null);
  const options: Person[] = (users.data ?? [])
    .filter((u) => u.active && u.role === 'EMPLOYEE')
    .map((u) => ({ id: u.id, displayName: u.displayName }));

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!name.trim()) {
      setNameError('Le nom est obligatoire.');
      return;
    }
    setNameError(null);
    save.mutate(
      { id: group?.id, name: name.trim(), active, memberIds: members.map((m) => m.id) },
      { onSuccess: () => onSaved(group ? 'Groupe enregistré.' : 'Groupe créé.') },
    );
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <Box component="form" noValidate onSubmit={submit}>
        <DialogTitle id={titleId}>{group ? `Modifier : ${group.name}` : 'Nouveau groupe d’employés'}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2.5, pt: '8px !important' }}>
          <TextField
            id="groupe-nom"
            label="Nom du groupe"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={Boolean(nameError)}
            helperText={nameError ?? 'Par exemple : Surveillants/Remplaçants.'}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
          {group && <FormControlLabel control={<Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Groupe actif" />}
          <Autocomplete
            multiple
            id="groupe-membres"
            options={options}
            value={members}
            onChange={(_e, value) => setMembers(value)}
            getOptionLabel={(o) => o.displayName}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            loading={users.isPending}
            noOptionsText="Aucun employé"
            renderInput={(params) => <TextField {...params} label="Membres" helperText="Employés prévenus des demandes de couverture ciblant ce groupe." />}
          />
          {members.length === 0 && <Alert severity="warning">Un groupe vide ne prévient personne : ajoutez au moins un employé.</Alert>}
          {save.error && <Alert severity="error">{save.error instanceof ApiError ? save.error.message : 'Enregistrement impossible.'}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="contained" loading={save.isPending}>
            Enregistrer le groupe
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

/** Groupes d'employés ciblés par les demandes de couverture ; les groupes vides sont signalés. */
export function GroupsAdminPage() {
  const groups = useAdminGroups();
  const toast = useToast();
  const [form, setForm] = useState<{ group: AdminGroup | null } | null>(null);

  return (
    <Box component="section" aria-labelledby="titre-groupes">
      <SectionHeader
        id="titre-groupes"
        title="Groupes d’employés"
        description="Les employés prévenus quand une classe doit être couverte."
        action={
          <Button variant="contained" startIcon={<UsersRound size={icon.sm} aria-hidden="true" />} onClick={() => setForm({ group: null })}>
            Nouveau groupe
          </Button>
        }
      />
      {groups.isPending ? (
        <LoadingState label="Chargement des groupes" />
      ) : groups.error ? (
        <ErrorState message="Impossible de charger les groupes." actionLabel="Réessayer" onAction={() => void groups.refetch()} />
      ) : groups.data.length === 0 ? (
        <Paper variant="outlined">
          <EmptyState icon={UsersRound} title="Aucun groupe" description="Créez un groupe, par exemple « Surveillants/Remplaçants »." />
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box component="ul" aria-label="Groupes" sx={{ listStyle: 'none', m: 0, p: 0, '& > li + li': { borderTop: 1, borderColor: 'divider' } }}>
            {groups.data.map((g) => (
              <Box component="li" key={g.id} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', px: { xs: 2, md: 2.5 }, py: 2 }}>
                <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontWeight: font.medium }}>{g.name}</Typography>
                    {!g.active && (
                      <Badge tone="neutral" icon={CircleOff}>
                        Inactif
                      </Badge>
                    )}
                    {g.active && g.memberCount === 0 && (
                      <Badge tone="error" icon={TriangleAlert}>
                        Groupe vide
                      </Badge>
                    )}
                    {g.active && g.memberCount > 0 && g.availableCount === 0 && (
                      <Badge tone="warning" icon={TriangleAlert}>
                        Personne de disponible
                      </Badge>
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
                    {g.memberCount} membre{g.memberCount > 1 ? 's' : ''} · {g.availableCount} disponible{g.availableCount > 1 ? 's' : ''}
                    {g.members.length > 0 && ` : ${g.members.map((m) => m.displayName).join(', ')}`}
                  </Typography>
                </Box>
                <IconAction icon={Pencil} label={`Modifier le groupe ${g.name}`} tooltip="Modifier" onClick={() => setForm({ group: g })} />
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
