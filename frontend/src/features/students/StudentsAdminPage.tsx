import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TablePagination from '@mui/material/TablePagination';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { CircleOff, FileUp, GraduationCap, Pencil, Search, SearchX, UserPlus } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
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
import { isPlural, locale, t } from '../../i18n';
import { StudentsImportDialog } from './StudentsImportDialog';
import { useLevels, useSaveStudent, useStudents, type GradeLevel, type Student } from './api';

const ROWS_PER_PAGE = [25, 50, 100];
const PHONE_RE = /^\+?\d[\d ]{6,18}\d$/;

/** Classe choisie, groupée par niveau (ListSubheader : en-têtes non sélectionnables). */
function classOptions(levels: GradeLevel[]) {
  return levels.flatMap((level) => [
    <ListSubheader key={`niveau-${level.id}`}>{level.name}</ListSubheader>,
    ...level.classes.map((c) => (
      <MenuItem key={c.id} value={c.id}>
        {c.name}
      </MenuItem>
    )),
  ]);
}

type Errors = Partial<Record<'firstName' | 'lastName' | 'classId' | 'parentPhone', string>>;

function StudentFormDialog({
  student,
  levels,
  onClose,
  onSaved,
}: {
  student: Student | null;
  levels: GradeLevel[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const titleId = useId();
  const save = useSaveStudent();
  const [firstName, setFirstName] = useState(student?.firstName ?? '');
  const [lastName, setLastName] = useState(student?.lastName ?? '');
  const [classId, setClassId] = useState(student?.class.id ?? '');
  const [parentPhone, setParentPhone] = useState(student?.parentPhone ?? '');
  const [active, setActive] = useState(student?.active ?? true);
  const [errors, setErrors] = useState<Errors>({});

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const next: Errors = {
      ...(firstName.trim() ? {} : { firstName: t('Le prénom est obligatoire.') }),
      ...(lastName.trim() ? {} : { lastName: t('Le nom est obligatoire.') }),
      ...(classId ? {} : { classId: t('Choisissez la classe de l’élève.') }),
      ...(PHONE_RE.test(parentPhone.trim().replace(/\s+/g, ' ')) ? {} : { parentPhone: t('Numéro invalide : chiffres et espaces, « + » possible au début.') }),
    };
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    save.mutate(
      {
        id: student?.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        classId,
        parentPhone: parentPhone.trim(),
        ...(student ? { active } : {}),
      },
      { onSuccess: () => onSaved(student ? t('Élève enregistré.') : t('Élève ajouté.')) },
    );
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <Box component="form" noValidate onSubmit={submit}>
        <DialogTitle id={titleId}>{student ? t('Modifier : {name}', { name: `${student.firstName} ${student.lastName}` }) : t('Nouvel élève')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2.5, pt: '8px !important' }}>
          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { sm: '1fr 1fr' } }}>
            <TextField
              id="eleve-prenom"
              label={t('Prénom')}
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              error={Boolean(errors.firstName)}
              helperText={errors.firstName}
              slotProps={{ htmlInput: { maxLength: 60 } }}
            />
            <TextField
              id="eleve-nom"
              label={t('Nom')}
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              error={Boolean(errors.lastName)}
              helperText={errors.lastName}
              slotProps={{ htmlInput: { maxLength: 60 } }}
            />
          </Box>
          <TextField
            id="eleve-classe"
            select
            label={t('Classe')}
            required
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            error={Boolean(errors.classId)}
            helperText={errors.classId ?? t('Le niveau scolaire se déduit de la classe.')}
          >
            {classOptions(levels)}
          </TextField>
          <TextField
            id="eleve-telephone"
            label={t('Téléphone d’un parent')}
            required
            type="tel"
            value={parentPhone}
            onChange={(e) => setParentPhone(e.target.value)}
            error={Boolean(errors.parentPhone)}
            helperText={errors.parentPhone ?? t('Par exemple : 06 12 34 56 78.')}
            slotProps={{ htmlInput: { maxLength: 20, inputMode: 'tel', autoComplete: 'off' } }}
          />
          {student && <FormControlLabel control={<Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} />} label={t('Élève inscrit (actif)')} />}
          {save.error && <Alert severity="error">{save.error instanceof ApiError ? save.error.message : t('Enregistrement impossible.')}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('Annuler')}</Button>
          <Button type="submit" variant="contained" loading={save.isPending}>
            {t('Enregistrer l’élève')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase(locale());

/** Élèves par niveau et classe (super administrateur). */
export function StudentsAdminPage() {
  const students = useStudents();
  const levels = useLevels();
  const toast = useToast();
  const [form, setForm] = useState<{ student: Student | null } | null>(null);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState('');
  const [levelId, setLevelId] = useState('');
  const [classId, setClassId] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE[0]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return (students.data ?? []).filter(
      (s) =>
        (!levelId || s.class.level?.id === levelId) &&
        (!classId || s.class.id === classId) &&
        (!q || normalize(`${s.firstName} ${s.lastName} ${s.lastName} ${s.firstName}`).includes(q)),
    );
  }, [students.data, query, levelId, classId]);
  const levelClasses = (levels.data ?? []).find((l) => l.id === levelId)?.classes ?? (levels.data ?? []).flatMap((l) => l.classes);
  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage);
  const resetPage = () => setPage(0);
  // Sans classe rattachée à un niveau, aucun élève ne peut être inscrit : on dit quoi faire.
  const noClassWithLevel = levels.data !== undefined && levels.data.every((l) => l.classes.length === 0);

  return (
    <Box component="section" aria-labelledby="titre-eleves">
      <SectionHeader
        id="titre-eleves"
        title={t('Élèves')}
        description={t('Élèves par niveau et par classe, avec le téléphone d’un parent.')}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" startIcon={<FileUp size={icon.sm} aria-hidden="true" />} disabled={!levels.data || noClassWithLevel} onClick={() => setImporting(true)}>
              {t('Importer un fichier')}
            </Button>
            <Button variant="contained" startIcon={<UserPlus size={icon.sm} aria-hidden="true" />} disabled={!levels.data || noClassWithLevel} onClick={() => setForm({ student: null })}>
              {t('Nouvel élève')}
            </Button>
          </Box>
        }
      />
      {noClassWithLevel && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button color="inherit" size="small" component={RouterLink} to="/admin/niveaux">
                {t('Gérer les niveaux')}
              </Button>
              <Button color="inherit" size="small" component={RouterLink} to="/admin/classes">
                {t('Gérer les classes')}
              </Button>
            </Box>
          }
        >
          {t('Aucune classe n’est rattachée à un niveau scolaire : on ne peut pas encore inscrire d’élèves. Créez d’abord les niveaux, puis rattachez-y les classes.')}
        </Alert>
      )}
      {students.isPending || levels.isPending ? (
        <LoadingState label={t('Chargement des élèves')} />
      ) : students.error || levels.error ? (
        <ErrorState message={t('Impossible de charger les élèves.')} actionLabel={t('Réessayer')} onAction={() => void Promise.all([students.refetch(), levels.refetch()])} />
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, p: 2 }}>
            <TextField
              id="eleves-recherche"
              size="small"
              placeholder={t('Rechercher un élève…')}
              value={query}
              onChange={(e) => (setQuery(e.target.value), resetPage())}
              sx={{ flex: '1 1 220px' }}
              slotProps={{
                htmlInput: { 'aria-label': t('Rechercher un élève') },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={icon.sm} aria-hidden="true" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              id="eleves-niveau"
              select
              size="small"
              label={t('Niveau')}
              value={levelId}
              onChange={(e) => (setLevelId(e.target.value), setClassId(''), resetPage())}
              sx={{ flex: '1 1 180px' }}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            >
              <MenuItem value="">{t('Tous')}</MenuItem>
              {levels.data.map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  {l.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              id="eleves-classe"
              select
              size="small"
              label={t('Classe')}
              value={classId}
              onChange={(e) => (setClassId(e.target.value), resetPage())}
              sx={{ flex: '1 1 200px' }}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            >
              <MenuItem value="">{t('Toutes')}</MenuItem>
              {levelClasses.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <Typography variant="body2" color="text.secondary" aria-live="polite" sx={{ px: 2, pb: 1.5 }}>
            {t(isPlural(filtered.length) ? '{count} élèves' : '{count} élève', { count: filtered.length })}
          </Typography>
          {filtered.length === 0 ? (
            <EmptyState
              icon={students.data.length === 0 ? GraduationCap : SearchX}
              title={students.data.length === 0 ? t('Aucun élève') : t('Aucun élève trouvé')}
              description={students.data.length === 0 ? t('Ajoutez les élèves de chaque classe.') : t('Aucun élève ne correspond à cette recherche ou à ces filtres.')}
            />
          ) : (
            <>
              <Box component="ul" aria-label={t('Élèves')} sx={{ listStyle: 'none', m: 0, p: 0, borderTop: 1, borderColor: 'divider', '& > li + li': { borderTop: 1, borderColor: 'divider' } }}>
                {rows.map((s) => (
                  <Box component="li" key={s.id} sx={{ display: 'flex', gap: 2, alignItems: 'center', px: { xs: 2, md: 2.5 }, py: 1.25 }}>
                    <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontWeight: font.medium, overflowWrap: 'anywhere' }}>
                          {s.lastName.toLocaleUpperCase(locale())} {s.firstName}
                        </Typography>
                        {!s.active && (
                          <Badge tone="neutral" icon={CircleOff}>
                            {t('Inactif')}
                          </Badge>
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                        {s.class.name} · {s.parentPhone}
                      </Typography>
                    </Box>
                    <IconAction icon={Pencil} label={t('Modifier l’élève {name}', { name: `${s.firstName} ${s.lastName}` })} tooltip={t('Modifier')} onClick={() => setForm({ student: s })} />
                  </Box>
                ))}
              </Box>
              <TablePagination
                component="div"
                count={filtered.length}
                page={currentPage}
                rowsPerPage={rowsPerPage}
                rowsPerPageOptions={ROWS_PER_PAGE}
                onPageChange={(_e, next) => setPage(next)}
                onRowsPerPageChange={(e) => (setRowsPerPage(Number(e.target.value)), resetPage())}
                labelRowsPerPage={t('Lignes par page :')}
                labelDisplayedRows={({ from, to, count }) => t('{from}–{to} sur {count}', { from, to, count })}
                getItemAriaLabel={(type) => (type === 'next' ? t('Page suivante') : type === 'previous' ? t('Page précédente') : type === 'first' ? t('Première page') : t('Dernière page'))}
              />
            </>
          )}
        </Paper>
      )}
      {importing && <StudentsImportDialog onClose={() => setImporting(false)} />}
      {form && levels.data && (
        <StudentFormDialog
          student={form.student}
          levels={levels.data}
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
