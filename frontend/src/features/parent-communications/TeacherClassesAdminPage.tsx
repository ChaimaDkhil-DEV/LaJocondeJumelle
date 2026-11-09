import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { School } from 'lucide-react';
import { useId, useState } from 'react';
import { loadErrorMessage } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { t } from '../../i18n';
import { useAdminClasses } from '../coverage/adminApi';
import { useSetTeacherClasses, useTeacherClasses } from './api';

/** Classes attribuées aux enseignants : elles délimitent les élèves auxquels chacun peut écrire (015). */
export function TeacherClassesAdminPage() {
  const teachers = useTeacherClasses();
  const classes = useAdminClasses();
  const [editing, setEditing] = useState<{
    id: string;
    displayName: string;
    classIds: string[];
  } | null>(null);
  const nameOf = new Map((classes.data ?? []).map((c) => [c.id, c.name]));
  return (
    <Box>
      <PageHeader
        title={t('Classes des enseignants')}
        description={t('Un enseignant n’écrit qu’aux parents des élèves de ses classes.')}
      />
      {teachers.isPending ? (
        <LoadingState label={t('Chargement des enseignants')} />
      ) : teachers.error ? (
        <ErrorState
          message={loadErrorMessage(teachers.error, t('les enseignants'))}
          actionLabel={t('Réessayer')}
          onAction={() => void teachers.refetch()}
        />
      ) : teachers.data.length === 0 ? (
        <Paper variant="elevated">
          <EmptyState
            icon={School}
            title={t('Aucun enseignant')}
            description={t('Ajoutez des membres au groupe Enseignants.')}
          />
        </Paper>
      ) : (
        <Box
          component="ul"
          aria-label={t('Enseignants')}
          sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}
        >
          {teachers.data.map(({ teacher, classIds }) => (
            <Paper
              component="li"
              key={teacher.id}
              variant="elevated"
              sx={{
                p: 2,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 1,
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 600 }}>{teacher.displayName}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {classIds.length
                    ? classIds.map((id) => nameOf.get(id) ?? '—').join(', ')
                    : t('Aucune classe attribuée')}
                </Typography>
              </Box>
              <Button
                size="small"
                aria-label={t('Modifier les classes de {name}', { name: teacher.displayName })}
                onClick={() => setEditing({ ...teacher, classIds })}
              >
                {t('Modifier')}
              </Button>
            </Paper>
          ))}
        </Box>
      )}
      {editing && (
        <ClassesDialog
          teacher={editing}
          classes={(classes.data ?? []).filter((c) => c.active)}
          onClose={() => setEditing(null)}
        />
      )}
    </Box>
  );
}

function ClassesDialog({
  teacher,
  classes,
  onClose,
}: {
  teacher: { id: string; displayName: string; classIds: string[] };
  classes: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const titleId = useId();
  const toast = useToast();
  const save = useSetTeacherClasses();
  const [selected, setSelected] = useState(new Set(teacher.classIds));
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="xs">
      <DialogTitle id={titleId}>
        {t('Classes de {name}', { name: teacher.displayName })}
      </DialogTitle>
      <DialogContent>
        <FormGroup>
          {classes.map((c) => (
            <FormControlLabel
              key={c.id}
              control={<Checkbox checked={selected.has(c.id)} onChange={() => toggle(c.id)} />}
              label={c.name}
            />
          ))}
        </FormGroup>
        {save.error && <ErrorState message={loadErrorMessage(save.error, t('les classes'))} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Annuler')}</Button>
        <Button
          variant="contained"
          loading={save.isPending}
          onClick={() =>
            save.mutate(
              {
                teacherId: teacher.id,
                classIds: classes.filter((c) => selected.has(c.id)).map((c) => c.id),
              },
              {
                onSuccess: () => {
                  toast.success(t('Classes enregistrées.'));
                  onClose();
                },
              },
            )
          }
        >
          {t('Enregistrer')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
