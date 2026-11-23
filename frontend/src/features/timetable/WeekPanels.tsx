import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Ban, BookOpen, CalendarDays, Clock, MapPin, School } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '../../components/Badge';
import { font, fontSize, icon, radius, tokensOf } from '../../design/tokens';
import { t } from '../../i18n';
import { KpiCard } from '../admin/KpiCard';
import { SESSION_STATUS } from '../attendance/sessionStatus';
import { formatTime } from '../coverage/labels';
import { dayLabel, WEEKDAY_LABELS } from './labels';
import type { TimetableSession } from './types';
import { tintOf } from './WeekGrid';
import { formatHours, type NextSession, type WeekStats } from './weekLayout';

/** Les quatre chiffres de la semaine, au-dessus du calendrier. */
export function StatTiles({ stats }: { stats: WeekStats }) {
  const tiles: { label: string; value: string; color: (c: ReturnType<typeof tokensOf>) => string }[] = [
    { label: t('Séances cette semaine'), value: String(stats.sessions), color: (c) => c.text },
    { label: t('Classes'), value: String(stats.classes), color: (c) => c.accent.main },
    { label: t('Heures / semaine'), value: formatHours(stats.minutes), color: (c) => c.success.main },
    { label: t('Annulées'), value: String(stats.cancelled), color: (c) => (stats.cancelled > 0 ? c.error.text : c.textMuted) },
  ];
  return (
    <Box component="section" aria-label={t('Chiffres de la semaine')} sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, mb: 2 }}>
      {tiles.map((tile) => (
        <Paper key={tile.label} variant="elevated" sx={{ p: 2, minWidth: 0 }}>
          <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
            {tile.label}
          </Typography>
          <Box component="span" sx={(theme) => ({ display: 'block', mt: 0.5, fontSize: fontSize.xxl, fontWeight: font.semibold, lineHeight: 1.2, color: tile.color(tokensOf(theme)) })}>
            {tile.value}
          </Box>
        </Paper>
      ))}
    </Box>
  );
}

/** Ce que le pointage dit de la séance : statut, heure du pointage, retard, remplaçant et son propre pointage. */
function PresenceDetails({ presence: p }: { presence: NonNullable<TimetableSession['presence']> }) {
  const { label, tone, icon: Icon } = SESSION_STATUS[p.status];
  const lines: string[] = [];
  if (p.arrivedAt && (p.status === 'PRESENT' || p.status === 'LATE')) lines.push(t('Pointage à {time}', { time: formatTime(p.arrivedAt) }));
  if (p.lateMinutes) lines.push(t('Retard : {minutes} min', { minutes: p.lateMinutes }));
  if (p.status === 'LATE' && p.lateReason === 'EMPTY_CLASS') lines.push(t('Classe déclarée vide par un surveillant'));
  if (p.status === 'LATE' && p.lateReason === 'ANNOUNCED') lines.push(t('Retard annoncé par l’enseignant'));
  if (p.status === 'LATE' && p.lateReason === 'QUALIFIED') lines.push(t('Retard constaté par l’administration'));
  if (p.replacedBy) lines.push(t('Remplacé(e) par {name}', { name: p.replacedBy.displayName }));
  const sub = p.substitute;
  if (sub) {
    lines.push(
      sub.arrivedAt && (sub.status === 'PRESENT' || sub.status === 'LATE')
        ? sub.lateMinutes
          ? t('Remplaçant arrivé à {time} · {minutes} min de retard', { time: formatTime(sub.arrivedAt), minutes: sub.lateMinutes })
          : t('Remplaçant arrivé à {time}', { time: formatTime(sub.arrivedAt) })
        : t('Remplaçant : {status}', { status: SESSION_STATUS[sub.status].label }),
    );
  }
  return (
    <Box sx={{ mt: 1.5, display: 'grid', gap: 0.5, justifyItems: 'start' }}>
      <Badge tone={tone} icon={Icon}>
        {label}
      </Badge>
      {lines.map((line) => (
        <Typography key={line} variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {line}
        </Typography>
      ))}
    </Box>
  );
}

/** Détail de la séance choisie dans la grille, avec ses actions (modifier, annuler) quand elles sont permises. */
export function SelectedSessionCard({ session, actions }: { session: TimetableSession; actions: ReactNode }) {
  const cancelled = session.status === 'CANCELLED';
  const meta = [session.subject ?? t('Matière non précisée'), session.room ? t('Salle : {room}', { room: session.room }) : t('Salle non précisée')].join(' · ');
  return (
    <Paper component="section" variant="elevated" aria-labelledby="selected-session-title" sx={{ p: 2 }}>
      <Typography id="selected-session-title" component="h2" variant="h6" sx={{ mb: 0.5 }}>
        {t('Séance sélectionnée')}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {`${dayLabel(session.date).replace(/^./, (c) => c.toLocaleUpperCase())} · ${t('{start} – {end}', { start: session.startTime, end: session.endTime })}`}
      </Typography>
      <Typography sx={{ mt: 1.5, fontWeight: font.semibold, overflowWrap: 'anywhere' }}>{session.class.name}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
        {meta}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
        {t('Enseignant : {name}', { name: session.teacher.displayName })}
      </Typography>
      {!cancelled && session.presence && <PresenceDetails presence={session.presence} />}
      {cancelled ? (
        <Box sx={{ mt: 1.5, display: 'grid', gap: 0.75, justifyItems: 'start' }}>
          <Badge tone="neutral" icon={Ban}>
            {t('Séance annulée')}
          </Badge>
          {session.cancelReason && (
            <Typography variant="body2" color="text.secondary">
              {t('Motif : {reason}', { reason: session.cancelReason })}
            </Typography>
          )}
        </Box>
      ) : (
        <Box sx={{ mt: 2, display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '1fr', gap: 1 }}>{actions}</Box>
      )}
    </Paper>
  );
}

/** Les séances tenues de la semaine, dans l'ordre, teintées comme dans la grille ; un clic les sélectionne. */
export function WeekClassesCard({ sessions, selectedId, onSelect }: { sessions: TimetableSession[]; selectedId: string | undefined; onSelect: (s: TimetableSession) => void }) {
  return (
    <Paper component="section" variant="elevated" aria-labelledby="week-classes-title" sx={{ p: 2 }}>
      <Typography id="week-classes-title" component="h2" variant="h6" sx={{ mb: 1.5 }}>
        {t('Classes de la semaine')}
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.75 }}>
        {sessions.map((s) => (
          <Box component="li" key={s.id}>
            <Box
              component="button"
              type="button"
              aria-pressed={s.id === selectedId}
              onClick={() => onSelect(s)}
              sx={(theme) => {
                const c = tokensOf(theme);
                const tint = tintOf(theme, s.class.id);
                return {
                  width: '100%',
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 1,
                  m: 0,
                  p: '8px 12px',
                  font: 'inherit',
                  fontSize: fontSize.sm,
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: 0,
                  borderLeft: `3px solid ${tint.bar}`,
                  borderRadius: '8px',
                  bgcolor: tint.bg,
                  color: tint.text,
                  outline: s.id === selectedId ? `2px solid ${c.accent.main}` : 'none',
                  '&:hover': { filter: 'brightness(0.97)' },
                  '&:focus-visible': { outline: `3px solid ${c.focus}`, outlineOffset: 1 },
                };
              }}
            >
              <Box component="span" sx={{ fontWeight: font.semibold, minWidth: 0, overflowWrap: 'anywhere' }}>
                {s.class.name}
              </Box>
              <Box component="span" sx={{ flex: 'none', fontSize: fontSize.xs, fontVariantNumeric: 'tabular-nums' }}>
                {`${WEEKDAY_LABELS[s.weekday]} ${s.startTime}`}
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

/** Les quatre chiffres de la semaine de l'enseignant : mêmes tuiles teintées que le tableau de bord. */
export function TeacherStatTiles({ stats }: { stats: WeekStats }) {
  return (
    <Box component="section" aria-label={t('Chiffres de la semaine')} sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, mb: 2 }}>
      <KpiCard bar label={t('Séances cette semaine')} value={stats.sessions} icon={CalendarDays} accent="indigo" />
      <KpiCard bar label={t('Classes')} value={stats.classes} icon={School} accent="cyan" />
      <KpiCard bar label={t('Heures / semaine')} value={formatHours(stats.minutes)} icon={Clock} accent="green" />
      <KpiCard bar label={t('Matières')} value={stats.subjects} icon={BookOpen} accent="orange" />
    </Box>
  );
}

/** La séance en cours, sinon la prochaine : jour, heures, matière, classe et salle ; « En cours » quand elle a commencé. */
export function NextSessionCard({ next }: { next: NextSession | null }) {
  const session = next?.session;
  return (
    <Paper component="section" variant="elevated" aria-labelledby="next-session-title" sx={{ p: 2 }}>
      <Typography id="next-session-title" component="h2" variant="h6" sx={{ mb: 1.5 }}>
        {t('Prochaine séance')}
      </Typography>
      {!session ? (
        <Typography variant="body2" color="text.secondary">
          {t('Aucune séance à venir cette semaine.')}
        </Typography>
      ) : (
        <Box
          sx={(theme) => {
            const tint = tintOf(theme, session.subject ?? '');
            return { display: 'grid', gap: 0.25, p: 1.5, borderRadius: `${radius.control}px`, borderLeft: `3px solid ${tint.bar}`, bgcolor: tint.bg, color: tint.text };
          }}
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography component="span" variant="body2" sx={{ fontWeight: font.medium, fontVariantNumeric: 'tabular-nums' }}>
              {`${dayLabel(session.date).replace(/^./, (c) => c.toLocaleUpperCase())} · ${t('{start} – {end}', { start: session.startTime, end: session.endTime })}`}
            </Typography>
            {next.inProgress && <Badge tone="success">{t('En cours')}</Badge>}
          </Box>
          <Typography component="span" sx={{ fontWeight: font.semibold, fontSize: fontSize.lg, color: 'text.primary', overflowWrap: 'anywhere' }}>
            {session.subject ?? t('Matière non précisée')}
          </Typography>
          <Typography component="span" variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            {session.class.name}
          </Typography>
          {(session.room ?? session.class.room) && (
            <Typography component="span" variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <MapPin size={icon.sm - 2} strokeWidth={2} aria-hidden="true" />
              {session.room ?? session.class.room}
            </Typography>
          )}
        </Box>
      )}
    </Paper>
  );
}

/** Les matières de la semaine avec leurs heures, la plus longue d'abord ; la pastille reprend la teinte de la grille. */
export function SubjectsCard({ subjects }: { subjects: Array<{ subject: string | null; minutes: number }> }) {
  return (
    <Paper component="section" variant="elevated" aria-labelledby="week-subjects-title" sx={{ p: 2 }}>
      <Typography id="week-subjects-title" component="h2" variant="h6" sx={{ mb: 1.5 }}>
        {t('Matières de la semaine')}
      </Typography>
      <Box component="ul" sx={(theme) => ({ listStyle: 'none', m: 0, p: 0, '& > li + li': { borderTop: `1px solid ${tokensOf(theme).border}` } })}>
        {subjects.map((row) => (
          <Box component="li" key={row.subject ?? ''} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1 }}>
            <Box
              component="span"
              aria-hidden="true"
              sx={(theme) => ({ width: 10, height: 10, borderRadius: '3px', flex: 'none', bgcolor: tintOf(theme, row.subject ?? '').bar })}
            />
            <Box component="span" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
              {row.subject ?? t('Matière non précisée')}
            </Box>
            <Box component="span" sx={{ fontWeight: font.semibold, fontVariantNumeric: 'tabular-nums' }}>
              {formatHours(row.minutes)}
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
