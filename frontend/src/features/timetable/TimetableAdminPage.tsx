import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { loadErrorMessage, serverNow } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { t } from '../../i18n';
import { useAdminClasses } from '../coverage/adminApi';
import { useTeacherClasses } from '../parent-communications/api';
import { useTimetableSessions } from './api';
import { CancelDialog } from './CancelDialog';
import { addDays, dateLabel, todayOf, weekDays, weekStart } from './labels';
import { SessionList } from './SessionList';
import { TimetableFormDialog, type FormMode } from './TimetableFormDialog';
import type { TimetableSession } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Une séance passée s'annule jusqu'à 7 jours en arrière (règle du serveur). */
const CANCEL_DAYS_BACK = 7;

/**
 * Emplois du temps (020) : l'administration choisit un enseignant ou une classe et une semaine, voit les séances
 * jour par jour, crée des séries hebdomadaires ou des séances, modifie et annule. Le choix est gardé dans l'adresse.
 */
export function TimetableAdminPage() {
  const [params, setParams] = useSearchParams();
  const by = params.get('vue') === 'classe' ? 'classe' : 'enseignant';
  const selected = params.get('id') ?? '';
  const today = todayOf(serverNow());
  const monday = weekStart(DATE_RE.test(params.get('semaine') ?? '') ? params.get('semaine')! : today);
  const days = weekDays(monday);

  const teachers = useTeacherClasses();
  const classes = useAdminClasses();
  const teacherList = (teachers.data ?? []).map((row) => row.teacher);
  const classList = (classes.data ?? []).filter((c) => c.active).map((c) => ({ id: c.id, name: c.name }));
  const sessions = useTimetableSessions(
    { from: days[0], to: days[6], ...(by === 'enseignant' ? { teacherId: selected } : { classId: selected }) },
    Boolean(selected),
  );
  const [form, setForm] = useState<FormMode | null>(null);
  const [cancelling, setCancelling] = useState<TimetableSession | null>(null);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const now = serverNow();
  const actions = (s: TimetableSession) =>
    s.status === 'CANCELLED' ? null : (
      <>
        {new Date(s.startAt) > now && (
          <Button size="small" aria-label={t('Modifier la séance de {start}, {date}', { start: s.startTime, date: dateLabel(s.date) })} onClick={() => setForm({ kind: 'edit', session: s })}>
            {t('Modifier')}
          </Button>
        )}
        {s.date >= addDays(today, -CANCEL_DAYS_BACK) && (
          <Button size="small" color="error" aria-label={t('Annuler la séance de {start}, {date}', { start: s.startTime, date: dateLabel(s.date) })} onClick={() => setCancelling(s)}>
            {t('Annuler')}
          </Button>
        )}
      </>
    );

  const options = by === 'enseignant' ? teacherList : classList;
  return (
    <Box>
      <PageHeader
        title={t('Emplois du temps')}
        description={t('Séances des enseignants : séries hebdomadaires, changements exceptionnels et annulations.')}
        actions={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="contained" startIcon={<Plus size={18} aria-hidden />} onClick={() => setForm({ kind: 'series' })}>
              {t('Nouvelle série')}
            </Button>
            <Button variant="outlined" startIcon={<Plus size={18} aria-hidden />} onClick={() => setForm({ kind: 'session' })}>
              {t('Nouvelle séance')}
            </Button>
          </Box>
        }
      />
      <Paper variant="elevated" sx={{ p: 2, mb: 2, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={by}
          aria-label={t('Afficher par')}
          onChange={(_e, value: string | null) => value && update({ vue: value === 'classe' ? 'classe' : null, id: null })}
        >
          <ToggleButton value="enseignant">{t('Par enseignant')}</ToggleButton>
          <ToggleButton value="classe">{t('Par classe')}</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          select
          size="small"
          label={by === 'enseignant' ? t('Enseignant') : t('Classe')}
          value={options.some((o) => o.id === selected) ? selected : ''}
          onChange={(e) => update({ id: e.target.value })}
          sx={{ minWidth: 240, flex: '1 1 240px' }}
        >
          {options.map((o) => (
            <MenuItem key={o.id} value={o.id}>
              {'displayName' in o ? o.displayName : o.name}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Button size="small" startIcon={<ChevronLeft size={18} aria-hidden />} onClick={() => update({ semaine: addDays(monday, -7) })}>
            {t('Semaine précédente')}
          </Button>
          <Typography component="p" aria-live="polite" sx={{ fontWeight: 600 }}>
            {t('Semaine du {date}', { date: dateLabel(monday) })}
          </Typography>
          <Button size="small" endIcon={<ChevronRight size={18} aria-hidden />} onClick={() => update({ semaine: addDays(monday, 7) })}>
            {t('Semaine suivante')}
          </Button>
        </Box>
      </Paper>

      {!selected ? (
        <Paper variant="elevated">
          <EmptyState
            icon={CalendarDays}
            title={by === 'enseignant' ? t('Choisissez un enseignant') : t('Choisissez une classe')}
            description={t('Son emploi du temps de la semaine s’affiche ici.')}
          />
        </Paper>
      ) : sessions.isPending ? (
        <LoadingState label={t('Chargement de l’emploi du temps')} />
      ) : sessions.error ? (
        <ErrorState message={loadErrorMessage(sessions.error, t('l’emploi du temps'))} actionLabel={t('Réessayer')} onAction={() => void sessions.refetch()} />
      ) : (
        <SessionList days={days} sessions={sessions.data} showTeacher={by === 'classe'} actions={actions} />
      )}

      {form && (
        <TimetableFormDialog
          mode={form}
          teachers={teacherList}
          classes={classList}
          defaults={{ date: days[0] >= today ? days[0] : today, ...(by === 'enseignant' ? { teacherId: selected } : { classId: selected }) }}
          onClose={() => setForm(null)}
        />
      )}
      {cancelling && <CancelDialog session={cancelling} onClose={() => setCancelling(null)} />}
    </Box>
  );
}
