import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Ban } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '../../components/Badge';
import { font, fontSize, tokensOf } from '../../design/tokens';
import { t } from '../../i18n';
import { dayLabel, WEEKDAY_LABELS } from './labels';
import type { TimetableSession } from './types';
import { tintOf } from './WeekGrid';
import { formatHours, type WeekStats } from './weekLayout';

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
