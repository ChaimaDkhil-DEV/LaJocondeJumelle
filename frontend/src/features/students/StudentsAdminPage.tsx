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
import type { Theme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { CircleOff, FileUp, GraduationCap, History, Pencil, RotateCcw, Search, SearchX, UserPlus } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link as RouterLink } from 'react-router';
import { ApiError } from '../../api/client';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { SectionHeader } from '../../components/SectionHeader';
import { useToast } from '../../components/Toast';
import { font, fontSize, icon, tokensOf } from '../../design/tokens';
import { isPlural, locale, t } from '../../i18n';
import { StudentHistoryDrawer } from './StudentHistoryDrawer';
import { StudentsImportDialog } from './StudentsImportDialog';
import { isTunisianPhone } from './tunisianPhone';
import { useLevels, useSaveStudent, useStudents, type GradeLevel, type Student } from './api';

const ROWS_PER_PAGE = [25, 50, 100];

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
      ...(isTunisianPhone(parentPhone.trim()) ? {} : { parentPhone: t('Numéro de téléphone tunisien invalide : 8 chiffres, avec ou sans « +216 » (par exemple 20 123 456).') }),
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
            helperText={errors.parentPhone ?? t('Par exemple : 20 123 456.')}
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
const digitsOf = (text: string) => text.replace(/\D/g, '');
const compare = (a: string, b: string) => a.localeCompare(b, locale(), { sensitivity: 'base' });

type SortKey = 'nom-asc' | 'nom-desc' | 'classe';
const byName = (a: Student, b: Student) => compare(a.lastName, b.lastName) || compare(a.firstName, b.firstName);
const SORTS: Record<SortKey, (a: Student, b: Student) => number> = {
  'nom-asc': byName,
  'nom-desc': (a, b) => byName(b, a),
  classe: (a, b) => (a.class.level?.position ?? Number.MAX_SAFE_INTEGER) - (b.class.level?.position ?? Number.MAX_SAFE_INTEGER) || compare(a.class.name, b.class.name) || byName(a, b),
};

/** Texte lu par les lecteurs d'écran seulement (grand écran) ; visible comme étiquette sur téléphone. */
const cellLabel = (theme: Theme) => ({
  color: 'text.secondary',
  [theme.breakpoints.up('md')]: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' },
});
const ROW_COLUMNS = 'minmax(0, 2fr) minmax(0, 1.5fr) minmax(0, 1.3fr) 212px';

/** Élèves par niveau et classe (super administrateur). */
export function StudentsAdminPage() {
  const students = useStudents();
  const levels = useLevels();
  const toast = useToast();
  const [form, setForm] = useState<{ student: Student | null } | null>(null);
  const [importing, setImporting] = useState(false);
  const [historyOf, setHistoryOf] = useState<Student | null>(null);
  const [query, setQuery] = useState('');
  const [levelId, setLevelId] = useState('');
  const [classId, setClassId] = useState('');
  const [sort, setSort] = useState<SortKey>('nom-asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE[0]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    const digits = digitsOf(query);
    return (students.data ?? [])
      .filter(
        (s) =>
          (!levelId || s.class.level?.id === levelId) &&
          (!classId || s.class.id === classId) &&
          (!q || normalize(`${s.firstName} ${s.lastName} ${s.lastName} ${s.firstName}`).includes(q) || (digits.length > 0 && digitsOf(s.parentPhone).includes(digits))),
      )
      .sort(SORTS[sort]);
  }, [students.data, query, levelId, classId, sort]);
  const levelClasses = (levels.data ?? []).find((l) => l.id === levelId)?.classes ?? (levels.data ?? []).flatMap((l) => l.classes);
  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage);
  const resetPage = () => setPage(0);
  const filtering = Boolean(query.trim() || levelId || classId);
  const total = students.data?.length ?? 0;
  const enrolled = (students.data ?? []).filter((s) => s.active).length;
  const classCount = (levels.data ?? []).reduce((sum, l) => sum + l.classes.length, 0);
  // Sans classe rattachée à un niveau, aucun élève ne peut être inscrit : on dit quoi faire.
  const noClassWithLevel = levels.data !== undefined && levels.data.every((l) => l.classes.length === 0);
  const tiles = [
    { label: t('Élèves inscrits'), value: enrolled, note: enrolled < total ? t('sur {total} au total', { total }) : null },
    { label: t('Classes'), value: classCount, note: null },
    { label: t('Niveaux'), value: levels.data?.length ?? 0, note: null },
  ];

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
        <>
          <Box component="section" aria-label={t('Chiffres des élèves')} sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' }, mb: 2 }}>
            {tiles.map((tile) => (
              <Paper key={tile.label} variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 0 }}>
                <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                  {tile.label}
                </Typography>
                <Box component="span" sx={{ display: 'block', fontSize: fontSize.xxl, fontWeight: font.semibold, lineHeight: 1.2 }}>
                  {tile.value}
                </Box>
                {tile.note && (
                  <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                    {tile.note}
                  </Typography>
                )}
              </Paper>
            ))}
          </Box>

          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ display: 'grid', gap: 1.5, p: 2 }}>
              <TextField
                id="eleves-recherche"
                size="small"
                fullWidth
                type="search"
                placeholder={t('Rechercher par nom, prénom ou téléphone du représentant')}
                value={query}
                onChange={(e) => (setQuery(e.target.value), resetPage())}
                slotProps={{
                  htmlInput: { 'aria-label': t('Rechercher un élève par nom, prénom ou téléphone du représentant') },
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search size={icon.sm} aria-hidden="true" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
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
                <TextField
                  id="eleves-tri"
                  select
                  size="small"
                  label={t('Trier par')}
                  value={sort}
                  onChange={(e) => (setSort(e.target.value as SortKey), resetPage())}
                  sx={{ flex: '1 1 180px' }}
                >
                  <MenuItem value="nom-asc">{t('Nom (A → Z)')}</MenuItem>
                  <MenuItem value="nom-desc">{t('Nom (Z → A)')}</MenuItem>
                  <MenuItem value="classe">{t('Niveau et classe')}</MenuItem>
                </TextField>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1, minHeight: 32 }}>
                <Typography variant="body2" color="text.secondary" aria-live="polite">
                  {filtering
                    ? t('{count} sur {total} élèves', { count: filtered.length, total })
                    : t(isPlural(filtered.length) ? '{count} élèves' : '{count} élève', { count: filtered.length })}
                </Typography>
                {filtering && (
                  <Button
                    size="small"
                    startIcon={<RotateCcw size={icon.sm} aria-hidden="true" />}
                    onClick={() => {
                      setQuery('');
                      setLevelId('');
                      setClassId('');
                      resetPage();
                    }}
                  >
                    {t('Réinitialiser les filtres')}
                  </Button>
                )}
              </Box>
            </Box>
            {filtered.length === 0 ? (
              <EmptyState
                icon={total === 0 ? GraduationCap : SearchX}
                title={total === 0 ? t('Aucun élève') : t('Aucun élève trouvé')}
                description={total === 0 ? t('Ajoutez les élèves de chaque classe.') : t('Aucun élève ne correspond à cette recherche ou à ces filtres.')}
              />
            ) : (
              <>
                <Box
                  aria-hidden="true"
                  sx={(theme) => ({
                    display: { xs: 'none', md: 'grid' },
                    gridTemplateColumns: ROW_COLUMNS,
                    gap: 2,
                    px: 2.5,
                    py: 1,
                    borderTop: 1,
                    borderColor: 'divider',
                    bgcolor: tokensOf(theme).surfaceMuted,
                    color: 'text.secondary',
                    fontSize: fontSize.sm,
                    fontWeight: font.medium,
                  })}
                >
                  <span>{t('Élève')}</span>
                  <span>{t('Classe')}</span>
                  <span>{t('Téléphone du représentant')}</span>
                  <span style={{ textAlign: 'right' }}>{t('Actions')}</span>
                </Box>
                <Box component="ul" aria-label={t('Élèves')} sx={{ listStyle: 'none', m: 0, p: 0, borderTop: 1, borderColor: 'divider', '& > li + li': { borderTop: 1, borderColor: 'divider' } }}>
                  {rows.map((s) => {
                    const fullName = `${s.firstName} ${s.lastName}`;
                    return (
                      <Box
                        component="li"
                        key={s.id}
                        sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: ROW_COLUMNS }, gap: { xs: 0.5, md: 2 }, alignItems: 'center', px: { xs: 2, md: 2.5 }, py: 1.25 }}
                      >
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: font.medium, overflowWrap: 'anywhere' }}>
                            {s.lastName.toLocaleUpperCase(locale())} {s.firstName}
                          </Typography>
                          {!s.active && (
                            <Badge tone="neutral" icon={CircleOff}>
                              {t('Inactif')}
                            </Badge>
                          )}
                        </Box>
                        <Typography component="div" variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                          <Box component="span" sx={cellLabel}>{t('Classe :')} </Box>
                          <span>{s.class.name}</span>
                        </Typography>
                        <Typography component="div" variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                          <Box component="span" sx={cellLabel}>{t('Téléphone du représentant :')} </Box>
                          <span>{s.parentPhone}</span>
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, mt: { xs: 0.5, md: 0 }, justifyContent: { md: 'flex-end' } }}>
                          <Tooltip title={t('Voir l’historique de classe de {name}', { name: fullName })}>
                            <Button
                              size="small"
                              variant="outlined"
                              color="inherit"
                              startIcon={<History size={icon.sm} aria-hidden="true" />}
                              aria-label={t('Historique de la classe de l’élève {name}', { name: fullName })}
                              onClick={() => setHistoryOf(s)}
                            >
                              {t('Historique')}
                            </Button>
                          </Tooltip>
                          <Tooltip title={t('Modifier la fiche de {name}', { name: fullName })}>
                            <Button
                              size="small"
                              variant="outlined"
                              color="inherit"
                              startIcon={<Pencil size={icon.sm} aria-hidden="true" />}
                              aria-label={t('Modifier l’élève {name}', { name: fullName })}
                              onClick={() => setForm({ student: s })}
                            >
                              {t('Modifier')}
                            </Button>
                          </Tooltip>
                        </Box>
                      </Box>
                    );
                  })}
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
        </>
      )}
      {importing && <StudentsImportDialog onClose={() => setImporting(false)} />}
      <StudentHistoryDrawer student={historyOf} onClose={() => setHistoryOf(null)} />
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
