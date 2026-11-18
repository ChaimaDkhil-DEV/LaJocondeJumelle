import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  AlarmClock,
  Ban,
  CalendarClock,
  CircleCheck,
  FileCheck,
  Hourglass,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useSearchParams } from 'react-router';
import { loadErrorMessage } from '../../api/client';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import type { Tone } from '../../design/tokens';
import { t } from '../../i18n';
import { KpiCard } from '../admin/KpiCard';
import { formatTime } from '../coverage/labels';
import { useAdminClasses } from '../coverage/adminApi';
import { useTeacherClasses } from '../parent-communications/api';
import { useExpectedTeachers } from './api';
import type { ExpectedLine, SessionStatus } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Statut d'une séance : libellé, teinte et icône (jamais la couleur seule). */
export const SESSION_STATUS: Record<SessionStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  UPCOMING: { label: t('À venir'), tone: 'neutral', icon: CalendarClock },
  EXPECTED: { label: t('Attendu'), tone: 'info', icon: Hourglass },
  PRESENT: { label: t('Présent'), tone: 'success', icon: CircleCheck },
  LATE: { label: t('En retard'), tone: 'warning', icon: AlarmClock },
  NOT_ARRIVED: { label: t('Non arrivé'), tone: 'error', icon: UserRoundX },
  EXCUSED: { label: t('Absence justifiée'), tone: 'neutral', icon: FileCheck },
  CANCELLED: { label: t('Séance annulée'), tone: 'neutral', icon: Ban },
};
const STATUSES = Object.keys(SESSION_STATUS) as SessionStatus[];

/** Détail sous le statut : heure d'arrivée, minutes de retard, origine du retard, remplacement, motif d'annulation. */
function details(l: ExpectedLine): string[] {
  const out: string[] = [];
  if (l.arrivedAt && (l.status === 'PRESENT' || l.status === 'LATE')) {
    out.push(
      l.lateMinutes
        ? t('Arrivée à {time} · {minutes} min de retard', { time: formatTime(l.arrivedAt), minutes: l.lateMinutes })
        : t('Arrivée à {time}', { time: formatTime(l.arrivedAt) }),
    );
  }
  if (l.status === 'LATE' && l.lateReason === 'EMPTY_CLASS') out.push(t('Classe déclarée vide par un surveillant'));
  if (l.status === 'LATE' && l.lateReason === 'ANNOUNCED') out.push(t('Retard annoncé par l’enseignant'));
  if (l.status === 'LATE' && l.lateReason === 'QUALIFIED') out.push(t('Retard constaté par l’administration'));
  if (l.replacedBy) out.push(t('Remplacé(e) par {name}', { name: l.replacedBy.displayName }));
  if (l.replaces) out.push(t('Remplace {name}', { name: l.replaces.displayName }));
  if (l.status === 'CANCELLED' && l.cancelReason) out.push(t('Motif : {reason}', { reason: l.cancelReason }));
  return out;
}

/**
 * Enseignants attendus (020) : les séances d'un jour, l'enseignant attendu et son statut, calculé par le serveur à
 * partir des pointages existants. Quatre indicateurs et des filtres (date, enseignant, classe, statut) gardés dans
 * l'adresse. « Non arrivé » n'apparaît qu'après le délai de tolérance et n'enregistre aucune absence.
 */
export function ExpectedTeachersTab() {
  const [params, setParams] = useSearchParams();
  const date = DATE_RE.test(params.get('date') ?? '') ? params.get('date')! : undefined;
  // Identifiants repris tels quels : le serveur les valide (UUID) et refuse le reste.
  const teacherId = params.get('enseignant') || undefined;
  const classId = params.get('classe') || undefined;
  const status = STATUSES.includes(params.get('statut') as SessionStatus) ? (params.get('statut') as SessionStatus) : undefined;
  const expected = useExpectedTeachers({ date, teacherId, classId, status });
  const teachers = useTeacherClasses();
  const classes = useAdminClasses();

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const reset = () => {
    const next = new URLSearchParams(params);
    for (const key of ['date', 'enseignant', 'classe', 'statut']) next.delete(key);
    setParams(next, { replace: true });
  };

  const data = expected.data;
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Paper variant="elevated" sx={{ p: 2, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr) auto' }, alignItems: 'center' }}>
        <TextField
          type="date"
          size="small"
          label={t('Date')}
          value={date ?? data?.date ?? ''}
          onChange={(e) => update('date', e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField select size="small" label={t('Enseignant')} value={teacherId ?? ''} onChange={(e) => update('enseignant', e.target.value)}>
          <MenuItem value="">{t('Tous')}</MenuItem>
          {(teachers.data ?? []).map(({ teacher }) => (
            <MenuItem key={teacher.id} value={teacher.id}>
              {teacher.displayName}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label={t('Classe')} value={classId ?? ''} onChange={(e) => update('classe', e.target.value)}>
          <MenuItem value="">{t('Toutes')}</MenuItem>
          {(classes.data ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label={t('Statut')} value={status ?? ''} onChange={(e) => update('statut', e.target.value)}>
          <MenuItem value="">{t('Tous')}</MenuItem>
          {STATUSES.map((s) => (
            <MenuItem key={s} value={s}>
              {SESSION_STATUS[s].label}
            </MenuItem>
          ))}
        </TextField>
        <Button onClick={reset} disabled={!date && !teacherId && !classId && !status}>
          {t('Effacer les filtres')}
        </Button>
      </Paper>

      {expected.isPending ? (
        <LoadingState label={t('Chargement des enseignants attendus')} />
      ) : expected.error || !data ? (
        <ErrorState message={loadErrorMessage(expected.error, t('les enseignants attendus'))} actionLabel={t('Réessayer')} onAction={() => void expected.refetch()} />
      ) : (
        <>
          <Box component="ul" aria-label={t('Indicateurs du jour')} sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
            <li>
              <KpiCard label={t('Attendus')} value={data.counts.expected} icon={UsersRound} tone="info" />
            </li>
            <li>
              <KpiCard label={t('Présents')} value={data.counts.present} icon={UserRoundCheck} tone="success" />
            </li>
            <li>
              <KpiCard label={t('En retard')} value={data.counts.late} icon={AlarmClock} tone="warning" />
            </li>
            <li>
              <KpiCard label={t('Non arrivés')} value={data.counts.notArrived} icon={UserRoundX} tone="error" />
            </li>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {t('Tolérance : {tolerance} min ; retard au-delà de {threshold} min. « Non arrivé » n’enregistre aucune absence : il signale qu’aucun pointage n’a été fait.', {
              tolerance: data.settings.toleranceMinutes,
              threshold: data.settings.lateThresholdMinutes,
            })}
          </Typography>
          {data.lines.length === 0 ? (
            <Paper variant="elevated">
              <EmptyState
                icon={CalendarClock}
                title={status || teacherId || classId ? t('Aucune séance ne correspond.') : t('Aucune séance prévue ce jour-là.')}
                description={t('Les séances viennent des emplois du temps saisis par l’administration.')}
              />
            </Paper>
          ) : (
            <Paper variant="elevated" component="ul" aria-label={t('Séances du jour')} sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {data.lines.map((l) => {
                const s = SESSION_STATUS[l.status];
                return (
                  <Box
                    component="li"
                    key={`${l.sessionId}-${l.role}`}
                    sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 1, p: 2, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}
                  >
                    <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0, flex: '1 1 16rem' }}>
                      <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 500, overflowWrap: 'anywhere' }}>
                        {l.teacher.displayName}
                      </Typography>
                      <Typography variant="body2">
                        {t('{start} – {end}', { start: l.startTime, end: l.endTime })}
                        {' · '}
                        {l.class.name}
                        {l.level ? ` (${l.level.name})` : ''}
                        {l.subject ? ` · ${l.subject}` : ''}
                      </Typography>
                      {details(l).map((d) => (
                        <Typography key={d} variant="body2" color="text.secondary">
                          {d}
                        </Typography>
                      ))}
                    </Box>
                    <Badge tone={s.tone} icon={s.icon} iconTestId={`status-icon-${l.status}`}>
                      {s.label}
                    </Badge>
                  </Box>
                );
              })}
            </Paper>
          )}
        </>
      )}
    </Box>
  );
}
