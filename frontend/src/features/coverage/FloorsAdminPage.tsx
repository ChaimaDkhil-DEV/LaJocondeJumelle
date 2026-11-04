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
import { isPlural, t } from '../../i18n';

const supervisorsText = (n: number) => t(isPlural(n) ? '{n} surveillants' : '{n} surveillant', { n });
const classesText = (n: number) => t(isPlural(n) ? '{n} classes' : '{n} classe', { n });

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
    if (!name.trim()) found.name = t('Le nom est obligatoire.');
    if (!/^\d+$/.test(position.trim())) found.position = t('Nombre entier attendu (ex. 1).');
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate(
      { id: floor?.id, name: name.trim(), position: Number(position), ...(floor ? { active } : {}) },
      { onSuccess: () => onSaved(floor ? t('Étage enregistré.') : t('Étage créé.')) },
    );
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <Box component="form" noValidate onSubmit={submit}>
        <DialogTitle id={titleId}>{floor ? t('Modifier : {name}', { name: floor.name }) : t('Nouvel étage')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2.5, pt: '8px !important' }}>
          <TextField
            id="etage-nom"
            label={t('Nom de l’étage')}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={Boolean(errors.name)}
            helperText={errors.name ?? t('Par exemple : 1er étage, rez-de-chaussée.')}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
          <TextField
            id="etage-position"
            label={t('Ordre d’affichage')}
            required
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            error={Boolean(errors.position)}
            helperText={errors.position ?? t('Les étages sont listés du plus petit au plus grand.')}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />
          {floor && <FormControlLabel control={<Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} />} label={t('Étage actif')} />}
          {save.error && <Alert severity="error">{save.error instanceof ApiError ? save.error.message : t('Enregistrement impossible.')}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('Annuler')}</Button>
          <Button type="submit" variant="contained" loading={save.isPending}>
            {t('Enregistrer l’étage')}
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
        title={t('Étages')}
        description={t('Rattachez chaque classe et chaque surveillant à un étage : les surveillants de l’étage sont proposés en premier.')}
        action={
          <Button variant="contained" startIcon={<Building2 size={icon.sm} aria-hidden="true" />} onClick={() => setForm({ floor: null })}>
            {t('Nouvel étage')}
          </Button>
        }
      />
      {floors.isPending ? (
        <LoadingState label={t('Chargement des étages')} />
      ) : floors.error ? (
        <ErrorState message={t('Impossible de charger les étages.')} actionLabel={t('Réessayer')} onAction={() => void floors.refetch()} />
      ) : floors.data.length === 0 ? (
        <Paper variant="outlined">
          <EmptyState icon={Building2} title={t('Aucun étage')} description={t('Créez les étages de l’école, par exemple « 1er étage ».')} />
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box component="ul" aria-label={t('Étages')} sx={{ listStyle: 'none', m: 0, p: 0, '& > li + li': { borderTop: 1, borderColor: 'divider' } }}>
            {floors.data.map((f) => (
              <Box component="li" key={f.id} sx={{ display: 'flex', gap: 2, alignItems: 'center', px: { xs: 2, md: 2.5 }, py: 1.5 }}>
                <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontWeight: font.medium }}>{f.name}</Typography>
                    {!f.active && (
                      <Badge tone="neutral" icon={CircleOff}>
                        {t('Inactif')}
                      </Badge>
                    )}
                    {f.active && f.warning === 'NO_SUPERVISOR' && (
                      <Badge tone="warning" icon={TriangleAlert}>
                        {t('Étage sans surveillant')}
                      </Badge>
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {supervisorsText(f.supervisorCount)} · {classesText(f.classCount)}
                  </Typography>
                </Box>
                <IconAction icon={Pencil} label={t('Modifier l’étage {name}', { name: f.name })} tooltip={t('Modifier')} onClick={() => setForm({ floor: f })} />
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
