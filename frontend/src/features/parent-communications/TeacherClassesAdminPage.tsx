import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { CalendarDays, ChevronRight, Pencil, Plus, School, Search, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { loadErrorMessage } from '../../api/client';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { IconAction } from '../../components/IconAction';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { UserAvatar } from '../../components/UserAvatar';
import { font, fontSize, icon, radius, tokensOf, type ColorTokens } from '../../design/tokens';
import { t } from '../../i18n';
import { useAdminClasses, type AdminClass } from '../coverage/adminApi';
import { tintOf } from '../timetable/WeekGrid';
import { useSetTeacherClasses, useTeacherClasses } from './api';

type TeacherRow = { teacher: { id: string; displayName: string }; classIds: string[] };

/** « Élève » et « eleve » se valent : minuscules, sans accents. */
const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const countLabel = (n: number) => (n === 0 ? t('Aucune classe') : n === 1 ? t('1 classe') : t('{count} classes', { count: n }));

/**
 * Classes des enseignants : la liste à gauche, la fiche de l'enseignant choisi à droite, ses classes en blocs.
 * Elles délimitent les élèves auxquels chacun peut écrire (015) ; l'emploi du temps reste dans sa propre page.
 */
export function TeacherClassesAdminPage() {
  const teachers = useTeacherClasses();
  const classes = useAdminClasses();
  const [editing, setEditing] = useState<{ id: string; displayName: string; classIds: string[] } | null>(null);
  const [removing, setRemoving] = useState<{ row: TeacherRow; classId: string } | null>(null);
  const [query, setQuery] = useState('');
  const [pickedId, setPickedId] = useState<string>();

  const rows = teachers.data ?? [];
  const classById = new Map((classes.data ?? []).map((c) => [c.id, c]));
  const visible = rows.filter((r) => plain(r.teacher.displayName).includes(plain(query.trim())));
  const current = rows.find((r) => r.teacher.id === pickedId) ?? visible[0];
  const assigned = new Set(rows.flatMap((r) => r.classIds)).size;
  const without = rows.filter((r) => r.classIds.length === 0).length;
  const tiles: { label: string; value: number; color: (c: ColorTokens) => string }[] = [
    { label: t('Enseignants'), value: rows.length, color: (c) => c.text },
    { label: t('Classes attribuées'), value: assigned, color: (c) => c.accent.main },
    { label: t('Enseignants sans classe'), value: without, color: (c) => (without > 0 ? c.warning.text : c.textMuted) },
  ];

  return (
    <Box>
      <PageHeader title={t('Classes des enseignants')} description={t('Un enseignant n’écrit qu’aux parents des élèves de ses classes.')} />
      {teachers.isPending ? (
        <LoadingState label={t('Chargement des enseignants')} />
      ) : teachers.error ? (
        <ErrorState message={loadErrorMessage(teachers.error, t('les enseignants'))} actionLabel={t('Réessayer')} onAction={() => void teachers.refetch()} />
      ) : rows.length === 0 ? (
        <Paper variant="elevated">
          <EmptyState icon={School} title={t('Aucun enseignant')} description={t('Ajoutez des membres au groupe Enseignants.')} />
        </Paper>
      ) : (
        <>
          <Box
            component="section"
            aria-label={t('Chiffres des affectations')}
            sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, mb: 2 }}
          >
            {tiles.map((tile) => (
              <Paper key={tile.label} variant="elevated" sx={{ p: 2, minWidth: 0 }}>
                <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                  {tile.label}
                </Typography>
                <Box
                  component="span"
                  sx={(theme) => ({ display: 'block', mt: 0.5, fontSize: fontSize.xxl, fontWeight: font.semibold, lineHeight: 1.2, color: tile.color(tokensOf(theme)) })}
                >
                  {tile.value}
                </Box>
              </Paper>
            ))}
          </Box>

          <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: '340px minmax(0, 1fr)' } }}>
            <Paper component="section" variant="elevated" aria-labelledby="teachers-title" sx={{ p: 2, minWidth: 0 }}>
              <Typography id="teachers-title" component="h2" variant="h6" sx={{ mb: 1.5 }}>
                {t('Liste des enseignants')}
              </Typography>
              <TextField
                type="search"
                size="small"
                fullWidth
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Rechercher un enseignant')}
                slotProps={{
                  htmlInput: { 'aria-label': t('Rechercher un enseignant') },
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <Search size={icon.md} aria-hidden />
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{ mb: 1.5 }}
              />
              {visible.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                  {t('Aucun enseignant ne correspond.')}
                </Typography>
              ) : (
                <Box sx={{ display: 'grid', gap: 0.75, maxHeight: { lg: 560 }, overflowY: 'auto' }}>
                  {visible.map((row) => {
                    const on = row.teacher.id === current?.teacher.id;
                    return (
                      <Box
                        key={row.teacher.id}
                        component="button"
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPickedId(row.teacher.id)}
                        sx={(theme) => {
                          const c = tokensOf(theme);
                          return {
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            width: '100%',
                            m: 0,
                            p: 1.25,
                            font: 'inherit',
                            textAlign: 'left',
                            cursor: 'pointer',
                            color: c.text,
                            bgcolor: on ? c.accent.soft : 'transparent',
                            border: `1px solid ${on ? c.accent.border : 'transparent'}`,
                            borderRadius: '12px',
                            '&:hover': { bgcolor: on ? c.accent.soft : c.surfaceMuted },
                            '&:focus-visible': { outline: `3px solid ${c.focus}`, outlineOffset: 1 },
                          };
                        }}
                      >
                        <UserAvatar user={row.teacher} size={40} />
                        <Box component="span" sx={{ flex: 1, minWidth: 0, fontWeight: font.semibold, overflowWrap: 'anywhere' }}>
                          {row.teacher.displayName}
                        </Box>
                        <Box
                          component="span"
                          sx={(theme) => ({
                            flex: 'none',
                            px: 1,
                            py: 0.25,
                            borderRadius: `${radius.round}px`,
                            fontSize: fontSize.xs,
                            fontWeight: font.medium,
                            bgcolor: row.classIds.length ? tokensOf(theme).accent.soft : tokensOf(theme).surfaceMuted,
                            color: row.classIds.length ? tokensOf(theme).accent.text : tokensOf(theme).textSecondary,
                          })}
                        >
                          {countLabel(row.classIds.length)}
                        </Box>
                        <ChevronRight size={icon.md} aria-hidden />
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Paper>

            {current && (
              <TeacherDetail
                row={current}
                classById={classById}
                onEdit={() => setEditing({ ...current.teacher, classIds: current.classIds })}
                onRemove={(classId) => setRemoving({ row: current, classId })}
              />
            )}
          </Box>
        </>
      )}
      {editing && <ClassesDialog teacher={editing} classes={(classes.data ?? []).filter((c) => c.active)} onClose={() => setEditing(null)} />}
      {removing && <RemoveDialog target={removing} classById={classById} onClose={() => setRemoving(null)} />}
    </Box>
  );
}

function TeacherDetail({
  row,
  classById,
  onEdit,
  onRemove,
}: {
  row: TeacherRow;
  classById: Map<string, AdminClass>;
  onEdit: () => void;
  onRemove: (classId: string) => void;
}) {
  const { teacher, classIds } = row;
  return (
    <Paper component="section" variant="elevated" aria-labelledby="teacher-title" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 3 }}>
        <UserAvatar user={teacher} size={56} />
        <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
          <Typography id="teacher-title" component="h2" variant="h5" sx={{ overflowWrap: 'anywhere' }}>
            {teacher.displayName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {countLabel(classIds.length)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Button
            component={RouterLink}
            to={`/admin/emplois-du-temps?id=${encodeURIComponent(teacher.id)}`}
            variant="outlined"
            startIcon={<CalendarDays size={icon.md} aria-hidden />}
          >
            {t('Voir l’emploi du temps')}
          </Button>
          <Button
            variant="outlined"
            color="inherit"
            startIcon={<Pencil size={icon.md} aria-hidden />}
            aria-label={t('Modifier les classes de {name}', { name: teacher.displayName })}
            onClick={onEdit}
          >
            {t('Modifier')}
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
        <Typography component="h3" variant="subtitle1" sx={{ fontWeight: font.semibold }}>
          {t('Classes attribuées ({count})', { count: classIds.length })}
        </Typography>
        <Button variant="contained" size="small" startIcon={<Plus size={icon.md} aria-hidden />} onClick={onEdit}>
          {t('Assigner une classe')}
        </Button>
      </Box>

      {classIds.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 3 }}>
          {t('Aucune classe attribuée')}
        </Typography>
      ) : (
        <Box
          component="ul"
          sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(220px, 1fr))' } }}
        >
          {classIds.map((id) => {
            const c = classById.get(id);
            const name = c?.name ?? '—';
            const meta = [c?.level?.name, c?.room ? t('Salle : {room}', { room: c.room }) : null, c?.floor?.name, c && !c.active ? t('Classe inactive') : null]
              .filter(Boolean)
              .join(' · ');
            return (
              <Box
                component="li"
                key={id}
                sx={(theme) => {
                  const tint = tintOf(theme, id);
                  return { display: 'flex', alignItems: 'flex-start', gap: 1, p: 1.5, borderRadius: '12px', borderLeft: `4px solid ${tint.bar}`, bgcolor: tint.bg, color: tint.text, minWidth: 0 };
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: font.semibold, overflowWrap: 'anywhere', color: 'inherit' }}>{name}</Typography>
                  {meta && <Typography sx={{ fontSize: fontSize.sm, color: 'inherit' }}>{meta}</Typography>}
                </Box>
                <IconAction
                  icon={X}
                  size="small"
                  color="inherit"
                  label={t('Retirer {class} de {name}', { class: name, name: teacher.displayName })}
                  onClick={() => onRemove(id)}
                />
              </Box>
            );
          })}
        </Box>
      )}
    </Paper>
  );
}

/** Retirer une classe : l'enseignant n'écrit plus aux parents de ses élèves ; confirmation avant d'enregistrer. */
function RemoveDialog({
  target,
  classById,
  onClose,
}: {
  target: { row: TeacherRow; classId: string };
  classById: Map<string, AdminClass>;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useSetTeacherClasses();
  const { row, classId } = target;
  const name = classById.get(classId)?.name ?? '—';
  return (
    <ConfirmDialog
      open
      title={t('Retirer la classe {class}', { class: name })}
      confirmLabel={t('Retirer')}
      pending={save.isPending}
      error={save.error ? loadErrorMessage(save.error, t('les classes')) : null}
      onClose={onClose}
      onConfirm={() =>
        save.mutate(
          { teacherId: row.teacher.id, classIds: row.classIds.filter((id) => id !== classId) },
          {
            onSuccess: () => {
              toast.success(t('Classe retirée.'));
              onClose();
            },
          },
        )
      }
    >
      {t('{name} n’écrira plus aux parents des élèves de cette classe.', { name: row.teacher.displayName })}
    </ConfirmDialog>
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
