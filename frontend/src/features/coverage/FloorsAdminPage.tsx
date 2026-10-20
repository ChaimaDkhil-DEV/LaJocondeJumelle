import Alert from '@mui/material/Alert';
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
import { Building2, CircleOff, Pencil, TriangleAlert } from 'lucide-react';
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
import { useAdminFloors, useSaveFloor, type AdminFloor } from './adminApi';

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

function FloorFormDialog({
  floor,
  nextPosition,
  onClose,
  onSaved,
}: {
  floor: AdminFloor | null;
  nextPosition: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const titleId = useId();
  const save = useSaveFloor();
  const [name, setName] = useState(floor?.name ?? '');
  const [position, setPosition] = useState(String(floor?.position ?? nextPosition));
  const [active, setActive] = useState(floor?.active ?? true);
  const [errors, setErrors] = useState<{ name?: string; position?: string }>({});

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const found: typeof errors = {};
    if (!name.trim()) found.name = 'Le nom est obligatoire.';
    if (!/^\d+$/.test(position.trim())) found.position = 'Nombre entier attendu (ex. 1).';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate(
      { id: floor?.id, name: name.trim(), position: Number(position), ...(floor ? { active } : {}) },
      { onSuccess: () => onSaved(floor ? 'Étage enregistré.' : 'Étage créé.') },
    );
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <Box component="form" noValidate onSubmit={submit}>
        <DialogTitle id={titleId}>{floor ? `Modifier : ${floor.name}` : 'Nouvel étage'}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2.5, pt: '8px !important' }}>
          <TextField
            id="etage-nom"
            label="Nom de l’étage"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={Boolean(errors.name)}
            helperText={errors.name ?? 'Par exemple : 1er étage, rez-de-chaussée.'}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
          <TextField
            id="etage-position"
            label="Ordre d’affichage"
            required
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            error={Boolean(errors.position)}
            helperText={errors.position ?? 'Les étages sont listés du plus petit au plus grand.'}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />
          {floor && <FormControlLabel control={<Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Étage actif" />}
          {save.error && <Alert severity="error">{save.error instanceof ApiError ? save.error.message : 'Enregistrement impossible.'}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="contained" loading={save.isPending}>
            Enregistrer l’étage
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

/**
 * Étages (004, FR-006) : les classes et les surveillants y sont rattachés ; l'admin voit d'abord les
 * surveillants de l'étage de la classe. Un étage sans surveillant est signalé, sans bloquer (FR-006a).
 */
export function FloorsAdminPage() {
  const floors = useAdminFloors();
  const toast = useToast();
  const [form, setForm] = useState<{ floor: AdminFloor | null } | null>(null);
  const nextPosition = Math.max(0, ...(floors.data ?? []).map((f) => f.position)) + 1;

  return (
    <Box component="section" aria-labelledby="titre-etages">
      <SectionHeader
        id="titre-etages"
        title="Étages"
        description="Rattachez chaque classe et chaque surveillant à un étage : les surveillants de l’étage sont proposés en premier."
        action={
          <Button variant="contained" startIcon={<Building2 size={icon.sm} aria-hidden="true" />} onClick={() => setForm({ floor: null })}>
            Nouvel étage
          </Button>
        }
      />
      {floors.isPending ? (
        <LoadingState label="Chargement des étages" />
      ) : floors.error ? (
        <ErrorState message="Impossible de charger les étages." actionLabel="Réessayer" onAction={() => void floors.refetch()} />
      ) : floors.data.length === 0 ? (
        <Paper variant="outlined">
          <EmptyState icon={Building2} title="Aucun étage" description="Créez les étages de l’école, par exemple « 1er étage »." />
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box component="ul" aria-label="Étages" sx={{ listStyle: 'none', m: 0, p: 0, '& > li + li': { borderTop: 1, borderColor: 'divider' } }}>
            {floors.data.map((f) => (
              <Box component="li" key={f.id} sx={{ display: 'flex', gap: 2, alignItems: 'center', px: { xs: 2, md: 2.5 }, py: 1.5 }}>
                <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontWeight: font.medium }}>{f.name}</Typography>
                    {!f.active && (
                      <Badge tone="neutral" icon={CircleOff}>
                        Inactif
                      </Badge>
                    )}
                    {f.active && f.warning === 'NO_SUPERVISOR' && (
                      <Badge tone="warning" icon={TriangleAlert}>
                        Étage sans surveillant
                      </Badge>
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {plural(f.supervisorCount, 'surveillant')} · {plural(f.classCount, 'classe')}
                  </Typography>
                </Box>
                <IconAction icon={Pencil} label={`Modifier l’étage ${f.name}`} tooltip="Modifier" onClick={() => setForm({ floor: f })} />
              </Box>
            ))}
          </Box>
        </Paper>
      )}
      {form && (
        <FloorFormDialog
          floor={form.floor}
          nextPosition={nextPosition}
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
