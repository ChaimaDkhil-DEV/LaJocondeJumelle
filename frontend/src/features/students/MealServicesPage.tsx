import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TablePagination from '@mui/material/TablePagination';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ArrowRightLeft, GraduationCap, History, Search, SearchX } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { ApiError, loadErrorMessage } from '../../api/client';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { IconAction } from '../../components/IconAction';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { font, icon } from '../../design/tokens';
import { isPlural, locale, t } from '../../i18n';
import { MEAL_SERVICE_LABELS, useChangeMealService, useMealHistory, useMealStudents, type MealService, type MealStudent } from './api';

const ROWS_PER_PAGE = [25, 50, 100];
const REASON_MAX = 300;

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase(locale());
const fullName = (s: MealStudent) => `${s.firstName} ${s.lastName}`;
const otherService = (service: MealService): MealService => (service === 'CANTINE' ? 'PANIER' : 'CANTINE');
const switchLabel = (service: MealService) => (service === 'CANTINE' ? t('Passer au panier') : t('Passer à la cantine'));

function MealBadge({ service }: { service: MealService }) {
  return <Badge tone={service === 'CANTINE' ? 'info' : 'warning'}>{MEAL_SERVICE_LABELS[service]}</Badge>;
}

function ChangeMealDialog({ student, onClose, onSaved }: { student: MealStudent; onClose: () => void; onSaved: (message: string) => void }) {
  const titleId = useId();
  const change = useChangeMealService();
  const [reason, setReason] = useState('');
  const target = otherService(student.mealService);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = reason.trim();
    change.mutate(
      { id: student.id, mealService: target, ...(trimmed ? { reason: trimmed } : {}) },
      { onSuccess: () => onSaved(t('{name} : service changé.', { name: fullName(student) })) },
    );
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <Box component="form" noValidate onSubmit={submit}>
        <DialogTitle id={titleId}>{t('Changer le service : {name}', { name: fullName(student) })}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2.5 }}>
          <Typography>
            {t('{from} → {to}, à partir de maintenant. Le changement est gardé dans l’historique de l’élève.', {
              from: MEAL_SERVICE_LABELS[student.mealService],
              to: MEAL_SERVICE_LABELS[target],
            })}
          </Typography>
          <TextField
            id="restauration-motif"
            label={t('Motif (facultatif)')}
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            slotProps={{ htmlInput: { maxLength: REASON_MAX } }}
          />
          {change.error && <Alert severity="error">{change.error instanceof ApiError ? change.error.message : t('Enregistrement impossible.')}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('Annuler')}</Button>
          <Button type="submit" variant="contained" loading={change.isPending}>
            {t('Confirmer')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function MealHistoryDialog({ student, onClose }: { student: MealStudent; onClose: () => void }) {
  const titleId = useId();
  const history = useMealHistory(student.id);

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <DialogTitle id={titleId}>{t('Historique : {name}', { name: fullName(student) })}</DialogTitle>
      <DialogContent>
        {history.isPending ? (
          <LoadingState label={t('Chargement de l’historique')} />
        ) : history.error ? (
          <ErrorState message={t('Impossible de charger l’historique.')} actionLabel={t('Réessayer')} onAction={() => void history.refetch()} />
        ) : history.data.length === 0 ? (
          <EmptyState compact icon={History} title={t('Aucun changement')} description={t('Aucun changement de service n’a été enregistré pour cet élève.')} />
        ) : (
          <Box component="ol" aria-label={t('Changements de service')} sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2 }}>
            {history.data.map((change) => (
              <li key={change.id}>
                <Typography sx={{ fontWeight: font.medium }}>
                  {MEAL_SERVICE_LABELS[change.fromService]} → {MEAL_SERVICE_LABELS[change.toService]}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('{date} · par {name}', { date: formatDateTime(change.createdAt), name: change.actor.displayName })}
                </Typography>
                {change.reason && (
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                    {change.reason}
                  </Typography>
                )}
              </li>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Fermer')}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Service de restauration des élèves : passage cantine ↔ panier et historique (administration). */
export function MealServicesPage() {
  const toast = useToast();
  const students = useMealStudents();
  const [query, setQuery] = useState('');
  const [classId, setClassId] = useState('');
  const [meal, setMeal] = useState<MealService | ''>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE[0]);
  const [changing, setChanging] = useState<MealStudent | null>(null);
  const [viewing, setViewing] = useState<MealStudent | null>(null);

  const classes = useMemo(() => {
    const byId = new Map((students.data ?? []).map((s) => [s.class.id, s.class.name]));
    return [...byId].map(([id, name]) => ({ id, name }));
  }, [students.data]);
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return (students.data ?? []).filter(
      (s) =>
        (!classId || s.class.id === classId) &&
        (!meal || s.mealService === meal) &&
        (!q || normalize(`${s.firstName} ${s.lastName} ${s.lastName} ${s.firstName}`).includes(q)),
    );
  }, [students.data, query, classId, meal]);
  const cantine = filtered.filter((s) => s.mealService === 'CANTINE').length;
  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage);
  const resetPage = () => setPage(0);

  return (
    <Box component="section">
      <PageHeader title={t('Restauration')} description={t('Passez un élève de la cantine au panier, ou l’inverse. Chaque changement est gardé dans son historique.')} />
      {students.isPending ? (
        <LoadingState label={t('Chargement des élèves')} />
      ) : students.error ? (
        // Accès refusé : réessayer ne changerait rien, seule une erreur passagère propose de recommencer.
        <ErrorState
          message={loadErrorMessage(students.error, t('la liste des élèves'))}
          {...(students.error instanceof ApiError && students.error.status === 403 ? {} : { actionLabel: t('Réessayer'), onAction: () => void students.refetch() })}
        />
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, p: 2 }}>
            <TextField
              id="restauration-recherche"
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
              id="restauration-classe"
              select
              size="small"
              label={t('Classe')}
              value={classId}
              onChange={(e) => (setClassId(e.target.value), resetPage())}
              sx={{ flex: '1 1 200px' }}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            >
              <MenuItem value="">{t('Toutes')}</MenuItem>
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              id="restauration-service"
              select
              size="small"
              label={t('Service')}
              value={meal}
              onChange={(e) => (setMeal(e.target.value as MealService | ''), resetPage())}
              sx={{ flex: '1 1 150px' }}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            >
              <MenuItem value="">{t('Tous')}</MenuItem>
              <MenuItem value="CANTINE">{t('Cantine')}</MenuItem>
              <MenuItem value="PANIER">{t('Panier')}</MenuItem>
            </TextField>
          </Box>
          <Typography variant="body2" color="text.secondary" aria-live="polite" sx={{ px: 2, pb: 1.5 }}>
            {t(isPlural(filtered.length) ? '{count} élèves · {cantine} à la cantine · {basket} au panier' : '{count} élève · {cantine} à la cantine · {basket} au panier', {
              count: filtered.length,
              cantine,
              basket: filtered.length - cantine,
            })}
          </Typography>
          {filtered.length === 0 ? (
            <EmptyState
              icon={students.data.length === 0 ? GraduationCap : SearchX}
              title={students.data.length === 0 ? t('Aucun élève') : t('Aucun élève trouvé')}
              description={students.data.length === 0 ? t('Aucun élève actif n’est inscrit pour le moment.') : t('Aucun élève ne correspond à cette recherche ou à ces filtres.')}
            />
          ) : (
            <>
              <Box component="ul" aria-label={t('Élèves')} sx={{ listStyle: 'none', m: 0, p: 0, borderTop: 1, borderColor: 'divider', '& > li + li': { borderTop: 1, borderColor: 'divider' } }}>
                {rows.map((s) => (
                  <Box component="li" key={s.id} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', px: { xs: 2, md: 2.5 }, py: 1.25 }}>
                    <Box sx={{ minWidth: 0, flex: '1 1 220px' }}>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontWeight: font.medium, overflowWrap: 'anywhere' }}>
                          {s.lastName.toLocaleUpperCase(locale())} {s.firstName}
                        </Typography>
                        <MealBadge service={s.mealService} />
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                        {s.class.name}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <IconAction icon={History} label={t('Historique de {name}', { name: fullName(s) })} tooltip={t('Historique')} onClick={() => setViewing(s)} />
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<ArrowRightLeft size={icon.sm} aria-hidden="true" />}
                        aria-label={t('{action} : {name}', { action: switchLabel(s.mealService), name: fullName(s) })}
                        onClick={() => setChanging(s)}
                      >
                        {switchLabel(s.mealService)}
                      </Button>
                    </Box>
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
      {changing && (
        <ChangeMealDialog
          student={changing}
          onClose={() => setChanging(null)}
          onSaved={(message) => {
            setChanging(null);
            toast.success(message);
          }}
        />
      )}
      {viewing && <MealHistoryDialog student={viewing} onClose={() => setViewing(null)} />}
    </Box>
  );
}
