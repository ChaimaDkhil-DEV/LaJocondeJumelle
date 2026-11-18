import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { loadErrorMessage, serverNow } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { layout } from '../../design/tokens';
import { t } from '../../i18n';
import { useMyTimetable } from './api';
import { addDays, dateLabel, dayLabel, todayOf, weekDays, weekStart } from './labels';
import { SessionList } from './SessionList';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mon emploi du temps (020, US4) : l'enseignant voit ses seules séances, par jour ou par semaine. L'identité vient
 * de sa session (le serveur n'accepte aucun autre enseignant) ; la vue et la date sont gardées dans l'adresse.
 */
export function MyTimetablePage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('vue') === 'jour' ? 'jour' : 'semaine';
  const today = todayOf(serverNow());
  const date = DATE_RE.test(params.get('date') ?? '') ? params.get('date')! : today;
  const days = view === 'jour' ? [date] : weekDays(weekStart(date));
  const timetable = useMyTimetable(days[0], days[days.length - 1]);
  const step = view === 'jour' ? 1 : 7;

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) next.set(k, v);
    setParams(next, { replace: true });
  };

  return (
    <Box sx={{ maxWidth: layout.readable, mx: 'auto' }}>
      <PageHeader title={t('Mon emploi du temps')} description={t('Vos séances : jour, heures, classe et niveau, matière et salle.')} />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', mb: 2 }}>
        <ToggleButtonGroup exclusive size="small" value={view} aria-label={t('Affichage')} onChange={(_e, v: string | null) => v && update({ vue: v })}>
          <ToggleButton value="jour">{t('Jour')}</ToggleButton>
          <ToggleButton value="semaine">{t('Semaine')}</ToggleButton>
        </ToggleButtonGroup>
        <Button size="small" startIcon={<ChevronLeft size={18} aria-hidden />} onClick={() => update({ date: addDays(days[0], -step) })}>
          {view === 'jour' ? t('Jour précédent') : t('Semaine précédente')}
        </Button>
        <Typography component="p" aria-live="polite" sx={{ fontWeight: 600, textTransform: view === 'jour' ? 'capitalize' : 'none' }}>
          {view === 'jour' ? dayLabel(date) : t('Semaine du {date}', { date: dateLabel(days[0]) })}
        </Typography>
        <Button size="small" endIcon={<ChevronRight size={18} aria-hidden />} onClick={() => update({ date: addDays(days[0], step) })}>
          {view === 'jour' ? t('Jour suivant') : t('Semaine suivante')}
        </Button>
        {date !== today && (
          <Button size="small" onClick={() => update({ date: today })}>
            {t('Aujourd’hui')}
          </Button>
        )}
      </Box>
      {timetable.isPending ? (
        <LoadingState label={t('Chargement de l’emploi du temps')} />
      ) : timetable.error ? (
        <ErrorState message={loadErrorMessage(timetable.error, t('l’emploi du temps'))} actionLabel={t('Réessayer')} onAction={() => void timetable.refetch()} />
      ) : (
        <SessionList days={days} sessions={timetable.data.sessions} />
      )}
    </Box>
  );
}
