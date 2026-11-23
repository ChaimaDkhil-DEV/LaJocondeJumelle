import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
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
import { UserAvatar } from '../../components/UserAvatar';
import { font, fontSize, icon, tokensOf } from '../../design/tokens';
import { t } from '../../i18n';
import { useAdminClasses } from '../coverage/adminApi';
import { useTeacherClasses } from '../parent-communications/api';
import { useTimetableSessions } from './api';
import { CancelDialog } from './CancelDialog';
import { arrowButton, segmented } from './controls';
import { addDays, dateLabel, todayOf, weekDays, weekStart } from './labels';
import { SessionList } from './SessionList';
import { TimetableFormDialog, type FormMode } from './TimetableFormDialog';
import type { TimetableSession } from './types';
import { WeekGrid } from './WeekGrid';
import { SelectedSessionCard, StatTiles, WeekClassesCard } from './WeekPanels';
import { weekStats } from './weekLayout';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Une séance passée s'annule jusqu'à 7 jours en arrière (règle du serveur). */
const CANCEL_DAYS_BACK = 7;

/**
 * Emplois du temps (020) : l'administration choisit un enseignant ou une classe et une semaine, voit les séances
 * en grille (ou en liste, jour par jour), crée des séries hebdomadaires ou des séances, modifie et annule. Le choix,
 * la semaine et l'affichage sont gardés dans l'adresse.
 */
export function TimetableAdminPage() {
  const [params, setParams] = useSearchParams();
  const by = params.get('vue') === 'classe' ? 'classe' : 'enseignant';
  const selected = params.get('id') ?? '';
  const today = todayOf(serverNow());
  const monday = weekStart(DATE_RE.test(params.get('semaine') ?? '') ? params.get('semaine')! : today);
  const days = weekDays(monday);
  const asList = params.get('affichage') === 'liste';

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
  const [pickedId, setPickedId] = useState<string>();

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const now = serverNow();
  /** Modifier / annuler : en petits boutons dans la liste, en pleine largeur dans le détail de la grille. */
  const buttons = (s: TimetableSession, panel: boolean) =>
    s.status === 'CANCELLED' ? null : (
      <>
        {new Date(s.startAt) > now && (
          <Button
            size={panel ? 'medium' : 'small'}
            variant={panel ? 'outlined' : 'text'}
            color={panel ? 'inherit' : 'primary'}
            aria-label={t('Modifier la séance de {start}, {date}', { start: s.startTime, date: dateLabel(s.date) })}
            onClick={() => setForm({ kind: 'edit', session: s })}
          >
            {t('Modifier')}
          </Button>
        )}
        {s.date >= addDays(today, -CANCEL_DAYS_BACK) && (
          <Button
            size={panel ? 'medium' : 'small'}
            variant={panel ? 'outlined' : 'text'}
            color="error"
            aria-label={t('Annuler la séance de {start}, {date}', { start: s.startTime, date: dateLabel(s.date) })}
            onClick={() => setCancelling(s)}
          >
            {t('Annuler')}
          </Button>
        )}
      </>
    );

  const options = by === 'enseignant' ? teacherList : classList;
  const ordered = [...(sessions.data ?? [])].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const held = ordered.filter((s) => s.status !== 'CANCELLED');
  const current = ordered.find((s) => s.id === pickedId) ?? held[0] ?? ordered[0];
  /** Jours ouvrés ; samedi et dimanche seulement s'ils ont une séance (aucune séance n'est cachée). */
  const shownDays = days.filter((d, i) => i < 5 || ordered.some((s) => s.date === d));
  const pickedPerson = options.find((o) => o.id === selected);
  const showWeek = Boolean(selected) && !asList && !sessions.isPending && !sessions.error;

  return (
    <Box>
      <PageHeader
        title={t('Emplois du temps')}
        description={t('Séances des enseignants : séries hebdomadaires, changements exceptionnels et annulations.')}
        actions={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" color="inherit" startIcon={<Plus size={icon.md} aria-hidden />} onClick={() => setForm({ kind: 'session' })}>
              {t('Nouvelle séance')}
            </Button>
            <Button variant="contained" startIcon={<Plus size={icon.md} aria-hidden />} onClick={() => setForm({ kind: 'series' })}>
              {t('Nouvelle série')}
            </Button>
          </Box>
        }
      />

      {selected && sessions.data && <StatTiles stats={weekStats(ordered)} />}

      <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 320px' } }}>
        <Paper variant="elevated" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={by}
              aria-label={t('Afficher par')}
              sx={segmented}
              onChange={(_e, value: string | null) => value && update({ vue: value === 'classe' ? 'classe' : null, id: null })}
            >
              <ToggleButton value="enseignant">{t('Par enseignant')}</ToggleButton>
              <ToggleButton value="classe">{t('Par classe')}</ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={asList ? 'liste' : 'semaine'}
              aria-label={t('Affichage')}
              sx={segmented}
              onChange={(_e, value: string | null) => value && update({ affichage: value === 'liste' ? 'liste' : null })}
            >
              <ToggleButton value="semaine">{t('Semaine')}</ToggleButton>
              <ToggleButton value="liste">{t('Liste')}</ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ ml: { sm: 'auto' }, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <IconButton aria-label={t('Semaine précédente')} sx={arrowButton} onClick={() => update({ semaine: addDays(monday, -7) })}>
                <ChevronLeft size={icon.md} aria-hidden />
              </IconButton>
              <Typography component="p" aria-live="polite" sx={{ fontWeight: font.semibold, textAlign: 'center' }}>
                {t('Semaine du {date}', { date: dateLabel(monday) })}
              </Typography>
              <IconButton aria-label={t('Semaine suivante')} sx={arrowButton} onClick={() => update({ semaine: addDays(monday, 7) })}>
                <ChevronRight size={icon.md} aria-hidden />
              </IconButton>
            </Box>
          </Box>

          {!selected ? (
            <EmptyState
              icon={CalendarDays}
              title={by === 'enseignant' ? t('Choisissez un enseignant') : t('Choisissez une classe')}
              description={t('Son emploi du temps de la semaine s’affiche ici.')}
            />
          ) : sessions.isPending ? (
            <LoadingState label={t('Chargement de l’emploi du temps')} />
          ) : sessions.error ? (
            <ErrorState message={loadErrorMessage(sessions.error, t('l’emploi du temps'))} actionLabel={t('Réessayer')} onAction={() => void sessions.refetch()} />
          ) : asList ? (
            <SessionList days={shownDays} sessions={sessions.data} showTeacher={by === 'classe'} actions={(s) => buttons(s, false)} />
          ) : ordered.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              {t('Aucune séance cette semaine.')}
            </Typography>
          ) : (
            <WeekGrid days={shownDays} sessions={ordered} selectedId={current?.id} today={today} onSelect={(s) => setPickedId(s.id)} />
          )}
        </Paper>

        <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <Paper component="section" variant="elevated" aria-labelledby="person-title" sx={{ p: 2 }}>
            <Typography id="person-title" component="h2" variant="h6" sx={{ mb: 1.5 }}>
              {by === 'enseignant' ? t('Enseignant') : t('Classe')}
            </Typography>
            <Select
              fullWidth
              displayEmpty
              value={pickedPerson ? selected : ''}
              onChange={(e) => update({ id: e.target.value })}
              inputProps={{ 'aria-labelledby': 'person-title' }}
              MenuProps={{ slotProps: { paper: { sx: { maxHeight: 320 } } } }}
              sx={(theme) => ({ bgcolor: tokensOf(theme).accent.soft, borderRadius: '12px', '& .MuiSelect-select': { py: 1.25 } })}
              renderValue={(value) => {
                const person = options.find((o) => o.id === value);
                if (!person) {
                  return <Typography color="text.secondary">{by === 'enseignant' ? t('Choisir un enseignant') : t('Choisir une classe')}</Typography>;
                }
                const name = 'displayName' in person ? person.displayName : person.name;
                const detail =
                  by === 'enseignant'
                    ? [...new Set(ordered.map((s) => s.subject).filter(Boolean))].join(', ')
                    : (ordered[0]?.level?.name ?? '');
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                    {'displayName' in person && <UserAvatar user={person} size={40} />}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: font.semibold, overflowWrap: 'anywhere' }}>{name}</Typography>
                      {detail && (
                        <Typography color="text.secondary" sx={{ fontSize: fontSize.xs }}>
                          {detail}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              }}
            >
              {options.map((o) => (
                <MenuItem key={o.id} value={o.id}>
                  {'displayName' in o ? o.displayName : o.name}
                </MenuItem>
              ))}
            </Select>
          </Paper>
          {showWeek && current && <SelectedSessionCard session={current} actions={buttons(current, true)} />}
          {showWeek && held.length > 0 && <WeekClassesCard sessions={held} selectedId={current?.id} onSelect={(s) => setPickedId(s.id)} />}
        </Box>
      </Box>

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
