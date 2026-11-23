import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Ban, UserRoundCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '../../components/Badge';
import { t } from '../../i18n';
import { dayLabel } from './labels';
import { PresencePill, shownPresence } from './presence';
import type { TimetableSession } from './types';

interface SessionListProps {
  /** Jours affichés, dans l'ordre (un jour pour la vue journalière, sept pour la semaine). */
  days: string[];
  sessions: TimetableSession[];
  /** Ce qui est rappelé sur chaque séance en plus de la classe : l'enseignant (vue par classe ou générale). */
  showTeacher?: boolean;
  /** Masque les jours sans séance (sauf s'il n'y en a qu'un). */
  hideEmptyDays?: boolean;
  actions?: (session: TimetableSession) => ReactNode;
}

/**
 * Séances groupées par jour, dans l'ordre des heures : une liste (et non une grille positionnée), lisible au
 * clavier, au lecteur d'écran et sur un écran de téléphone. Une séance annulée le dit en toutes lettres.
 */
export function SessionList({ days, sessions, showTeacher = false, hideEmptyDays = false, actions }: SessionListProps) {
  const byDay = new Map(days.map((d) => [d, [] as TimetableSession[]]));
  for (const s of [...sessions].sort((a, b) => a.startAt.localeCompare(b.startAt))) byDay.get(s.date)?.push(s);
  const shown = days.filter((d) => !hideEmptyDays || days.length === 1 || (byDay.get(d)?.length ?? 0) > 0);

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      {shown.map((day) => {
        const list = byDay.get(day) ?? [];
        return (
          <Box component="section" key={day} aria-labelledby={`day-${day}`}>
            <Typography id={`day-${day}`} component="h3" variant="subtitle1" sx={{ fontWeight: 600, textTransform: 'capitalize', mb: 1 }}>
              {dayLabel(day)}
            </Typography>
            {list.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('Aucune séance ce jour-là.')}
              </Typography>
            ) : (
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
                {list.map((s) => (
                  <Paper
                    component="li"
                    key={s.id}
                    variant="outlined"
                    aria-label={t('Séance de {start} à {end}, {class}', { start: s.startTime, end: s.endTime, class: s.class.name })}
                    sx={{ p: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', justifyContent: 'space-between', opacity: s.status === 'CANCELLED' ? 0.85 : 1 }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }}>
                        {t('{start} – {end}', { start: s.startTime, end: s.endTime })}
                        {' · '}
                        {s.class.name}
                        {s.level ? ` (${s.level.name})` : ''}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {[
                          s.subject ?? t('Matière non précisée'),
                          s.room ? t('Salle : {room}', { room: s.room }) : t('Salle non précisée'),
                          showTeacher ? s.teacher.displayName : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Typography>
                      {shownPresence(s) && (
                        <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                          <PresencePill presence={shownPresence(s)!} />
                          {shownPresence(s)!.replacedBy && (
                            <Typography variant="body2" color="text.secondary">
                              {t('Remplacé(e) par {name}', { name: shownPresence(s)!.replacedBy!.displayName })}
                            </Typography>
                          )}
                        </Box>
                      )}
                      {s.replaces && (
                        <Box sx={{ mt: 0.5 }}>
                          <Badge tone="info" icon={UserRoundCheck}>
                            {t('Remplacement de {name}', { name: s.replaces.displayName })}
                          </Badge>
                        </Box>
                      )}
                      {s.status === 'CANCELLED' && (
                        <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                          <Badge tone="neutral" icon={Ban}>
                            {t('Séance annulée')}
                          </Badge>
                          {s.cancelReason && (
                            <Typography variant="body2" color="text.secondary">
                              {t('Motif : {reason}', { reason: s.cancelReason })}
                            </Typography>
                          )}
                        </Box>
                      )}
                      {s.status === 'SCHEDULED' && s.announcedAbsence && (
                        <Box sx={{ mt: 0.5 }}>
                          <Badge tone="warning">{t('Absence annoncée')}</Badge>
                        </Box>
                      )}
                    </Box>
                    {actions && <Box sx={{ display: 'flex', gap: 1 }}>{actions(s)}</Box>}
                  </Paper>
                ))}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
