import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Layers, Pencil } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Link as RouterLink } from 'react-router';
import { ApiError } from '../../api/client';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { IconAction } from '../../components/IconAction';
import { LoadingState } from '../../components/LoadingState';
import { SectionHeader } from '../../components/SectionHeader';
import { useToast } from '../../components/Toast';
import { font, icon } from '../../design/tokens';
import { isPlural, t } from '../../i18n';
import { CYCLE_LABELS, useLevels, useSaveLevel, type Cycle, type GradeLevel } from './api';

const classesText = (n: number) => t(isPlural(n) ? '{n} classes' : '{n} classe', { n });
const studentsText = (n: number) => t(isPlural(n) ? '{n} élèves' : '{n} élève', { n });

function LevelFormDialog({
  level,
  nextPosition,
  onClose,
  onSaved,
}: {
  level: GradeLevel | null;
  nextPosition: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const titleId = useId();
  const save = useSaveLevel();
  const [name, setName] = useState(level?.name ?? '');
  const [cycle, setCycle] = useState<Cycle>(level?.cycle ?? 'PRIMARY');
  const [position, setPosition] = useState(String(level?.position ?? nextPosition));
  const [errors, setErrors] = useState<{ name?: string; position?: string }>({});

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const found: typeof errors = {};
    if (!name.trim()) found.name = t('Le nom est obligatoire.');
    if (!/^\d+$/.test(position.trim())) found.position = t('Nombre entier attendu (ex. 1).');
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate(
      { id: level?.id, name: name.trim(), cycle, position: Number(position) },
      { onSuccess: () => onSaved(level ? t('Niveau enregistré.') : t('Niveau créé.')) },
    );
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <Box component="form" noValidate onSubmit={submit}>
        <DialogTitle id={titleId}>{level ? t('Modifier : {name}', { name: level.name }) : t('Nouveau niveau')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2.5, pt: '8px !important' }}>
          <TextField
            id="niveau-nom"
            label={t('Nom du niveau')}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={Boolean(errors.name)}
            helperText={errors.name ?? t('Par exemple : Préparatoire 1, 1re année primaire.')}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
          <TextField id="niveau-cycle" select label={t('Cycle')} required value={cycle} onChange={(e) => setCycle(e.target.value as Cycle)}>
            {(Object.keys(CYCLE_LABELS) as Cycle[]).map((c) => (
              <MenuItem key={c} value={c}>
                {CYCLE_LABELS[c]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            id="niveau-position"
            label={t('Ordre d’affichage')}
            required
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            error={Boolean(errors.position)}
            helperText={errors.position ?? t('Les niveaux sont listés du plus petit au plus grand ; chaque ordre ne sert qu’une fois.')}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />
          {save.error && <Alert severity="error">{save.error instanceof ApiError ? save.error.message : t('Enregistrement impossible.')}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('Annuler')}</Button>
          <Button type="submit" variant="contained" loading={save.isPending}>
            {t('Enregistrer le niveau')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

/**
 * Niveaux scolaires (ex. « Préparatoire 1 », « 1re année primaire ») : une classe n'accueille des élèves
 * que si elle est rattachée à un niveau, qui se choisit dans le formulaire de la classe.
 */
export function LevelsAdminPage() {
  const levels = useLevels();
  const toast = useToast();
  const [form, setForm] = useState<{ level: GradeLevel | null } | null>(null);
  const nextPosition = Math.max(0, ...(levels.data ?? []).map((l) => l.position)) + 1;

  return (
    <Box component="section" aria-labelledby="titre-niveaux">
      <SectionHeader
        id="titre-niveaux"
        title={t('Niveaux')}
        description={t('Créez les niveaux de l’école, puis rattachez-y chaque classe (menu Classes) : c’est ce qui permet d’inscrire des élèves.')}
        action={
          <Button variant="contained" startIcon={<Layers size={icon.sm} aria-hidden="true" />} onClick={() => setForm({ level: null })}>
            {t('Nouveau niveau')}
          </Button>
        }
      />
      {levels.isPending ? (
        <LoadingState label={t('Chargement des niveaux')} />
      ) : levels.error ? (
        <ErrorState message={t('Impossible de charger les niveaux.')} actionLabel={t('Réessayer')} onAction={() => void levels.refetch()} />
      ) : levels.data.length === 0 ? (
        <Paper variant="outlined">
          <EmptyState
            icon={Layers}
            title={t('Aucun niveau')}
            description={t('Créez les niveaux de l’école, par exemple « Préparatoire 1 » ou « 1re année primaire ».')}
          />
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box component="ul" aria-label={t('Niveaux')} sx={{ listStyle: 'none', m: 0, p: 0, '& > li + li': { borderTop: 1, borderColor: 'divider' } }}>
            {levels.data.map((l) => {
              const students = l.classes.reduce((sum, c) => sum + c.studentCount, 0);
              return (
                <Box component="li" key={l.id} sx={{ display: 'flex', gap: 2, alignItems: 'center', px: { xs: 2, md: 2.5 }, py: 1.5 }}>
                  <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontWeight: font.medium }}>{l.name}</Typography>
                      <Badge tone="neutral">{CYCLE_LABELS[l.cycle]}</Badge>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {classesText(l.classes.length)} · {studentsText(students)}
                    </Typography>
                  </Box>
                  <IconAction icon={Pencil} label={t('Modifier le niveau {name}', { name: l.name })} tooltip={t('Modifier')} onClick={() => setForm({ level: l })} />
                </Box>
              );
            })}
          </Box>
        </Paper>
      )}
      {levels.data && levels.data.length > 0 && levels.data.every((l) => l.classes.length === 0) && (
        <Alert
          severity="info"
          sx={{ mt: 2 }}
          action={
            <Button color="inherit" size="small" component={RouterLink} to="/admin/classes">
              {t('Gérer les classes')}
            </Button>
          }
        >
          {t('Aucune classe n’est encore rattachée à un niveau. Ouvrez une classe et choisissez son niveau scolaire.')}
        </Alert>
      )}
      {form && (
        <LevelFormDialog
          level={form.level}
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
