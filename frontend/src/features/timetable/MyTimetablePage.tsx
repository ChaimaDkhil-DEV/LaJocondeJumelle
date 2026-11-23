import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { loadErrorMessage, serverNow } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { font, icon, layout } from '../../design/tokens';
import { t } from '../../i18n';
import { useMyTimetable } from './api';
import { arrowButton, segmented } from './controls';
import { addDays, dateLabel, dayLabel, todayOf, weekDays, weekStart, weekendLabel } from './labels';
import { SessionList } from './SessionList';
import { WeekGrid } from './WeekGrid';
import { NextSessionCard, SubjectsCard, TeacherStatTiles } from './WeekPanels';
import { nextSession, subjectBreakdown, weekStats } from './weekLayout';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type View = 'jour' | 'semaine' | 'liste';
const viewOf = (value: string | null): View => (value === 'jour' || value === 'liste' ? value : 'semaine');

/**
 * Mon emploi du temps (020, US4) : l'enseignant voit ses seules séances, par jour, par semaine (grille) ou en liste.
 * L'identité vient de sa session (le serveur n'accepte aucun autre enseignant) ; la vue et la date sont gardées dans
 * l'adresse. Les vues de la semaine ajoutent les quatre chiffres, la prochaine séance et les matières de la semaine.
 */
export function MyTimetablePage() {
  const [params, setParams] = useSearchParams();
  const view = viewOf(params.get('vue'));
  const weekly = view !== 'jour';
  const now = serverNow();
  const today = todayOf(now);
  const date = DATE_RE.test(params.get('date') ?? '') ? params.get('date')! : today;
  const days = weekly ? weekDays(weekStart(date)) : [date];
  const timetable = useMyTimetable(days[0], days[days.length - 1]);
  const step = weekly ? 7 : 1;

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) next.set(k, v);
    setParams(next, { replace: true });
  };

  const sessions = timetable.data?.sessions ?? [];
  /** Samedi et dimanche ne s'affichent que si l'un des deux a une séance (aucune séance n'est cachée). */
  const showWeekend = sessions.some((s) => s.date === days[5] || s.date === days[6]);
  const shownDays = weekly && !showWeekend ? days.slice(0, 5) : days;

  const content = timetable.isPending ? (
    <LoadingState label={t('Chargement de l’emploi du temps')} />
  ) : timetable.error ? (
    <ErrorState message={loadErrorMessage(timetable.error, t('l’emploi du temps'))} actionLabel={t('Réessayer')} onAction={() => void timetable.refetch()} />
  ) : view === 'semaine' ? (
    sessions.length === 0 ? (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        {t('Aucune séance cette semaine.')}
      </Typography>
    ) : (
      <>
        <WeekGrid days={shownDays} sessions={sessions} today={today} detailed tintBy="subject" fitHours now={now} />
        {shownDays.length < days.length && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            {t('{days} : aucune séance.', { days: weekendLabel(days[5], days[6]) })}
          </Typography>
        )}
      </>
    )
  ) : (
    <SessionList days={days} sessions={sessions} hideEmptyDays={view === 'liste'} />
  );

  return (
    <Box sx={{ maxWidth: layout.content, mx: 'auto' }}>
      <PageHeader title={t('Mon emploi du temps')} description={t('Vos séances : jour, heures, classe et niveau, matière et salle.')} />

      {weekly && timetable.data && <TeacherStatTiles stats={weekStats(sessions)} />}

      <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: weekly ? 'minmax(0, 1fr) 300px' : 'minmax(0, 1fr)' } }}>
        <Paper variant="elevated" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <ToggleButtonGroup exclusive size="small" value={view} aria-label={t('Affichage')} sx={segmented} onChange={(_e, v: string | null) => v && update({ vue: v })}>
              <ToggleButton value="jour">{t('Jour')}</ToggleButton>
              <ToggleButton value="semaine">{t('Semaine')}</ToggleButton>
              <ToggleButton value="liste">{t('Liste')}</ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ ml: { sm: 'auto' }, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
              {!days.includes(today) && (
                <Button size="small" onClick={() => update({ date: today })}>
                  {t('Aujourd’hui')}
                </Button>
              )}
              <IconButton aria-label={weekly ? t('Semaine précédente') : t('Jour précédent')} sx={arrowButton} onClick={() => update({ date: addDays(days[0], -step) })}>
                <ChevronLeft size={icon.md} aria-hidden />
              </IconButton>
              <Typography component="p" aria-live="polite" sx={{ fontWeight: font.semibold, textAlign: 'center', textTransform: weekly ? 'none' : 'capitalize' }}>
                {weekly ? t('Semaine du {date}', { date: dateLabel(days[0]) }) : dayLabel(date)}
              </Typography>
              <IconButton aria-label={weekly ? t('Semaine suivante') : t('Jour suivant')} sx={arrowButton} onClick={() => update({ date: addDays(days[0], step) })}>
                <ChevronRight size={icon.md} aria-hidden />
              </IconButton>
            </Box>
          </Box>
          {content}
        </Paper>

        {weekly && timetable.data && (
          <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <NextSessionCard next={nextSession(sessions, now)} />
            {sessions.some((s) => s.status !== 'CANCELLED') && <SubjectsCard subjects={subjectBreakdown(sessions)} />}
          </Box>
        )}
      </Box>
    </Box>
  );
}
