import Box from '@mui/material/Box';
import type { Theme } from '@mui/material/styles';
import { font, fontSize, radius, sessionPalette, tokensOf, type SessionTint } from '../../design/tokens';
import { t } from '../../i18n';
import { dayOfMonth, weekdayShort } from './labels';
import type { TimetableSession } from './types';
import { hourRange, minutesOf, paletteIndex } from './weekLayout';

const HOUR_HEIGHT = 50;
const GUTTER = 56;
const HEAD_HEIGHT = 52;

/** Teinte d'une classe dans le thème courant. */
export function tintOf(theme: Theme, classId: string): SessionTint {
  return sessionPalette[theme.palette.mode][paletteIndex(classId)];
}

interface WeekGridProps {
  days: string[];
  sessions: TimetableSession[];
  selectedId: string | undefined;
  today: string;
  onSelect: (session: TimetableSession) => void;
}

/**
 * Semaine en grille : une colonne par jour, une ligne par heure, chaque séance posée à son heure et à sa durée. Chaque
 * séance est un bouton nommé (heures et classe) ; la liste par jour (SessionList) reste le même contenu pour le
 * clavier avancé, le lecteur d'écran et le téléphone. Une séance annulée reste visible, barrée et dite « Annulée ».
 */
export function WeekGrid({ days, sessions, selectedId, today, onSelect }: WeekGridProps) {
  const { start, end } = hourRange(sessions);
  const hours = Array.from({ length: end - start }, (_v, i) => start + i);
  const bodyHeight = hours.length * HOUR_HEIGHT;

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box
        role="group"
        aria-label={t('Séances de la semaine')}
        sx={{ display: 'grid', gridTemplateColumns: `${GUTTER}px repeat(${days.length}, minmax(76px, 1fr))`, minWidth: 640 }}
      >
        <Box />
        {days.map((day, index) => {
          const isToday = day === today;
          return (
            <Box
              key={day}
              aria-current={isToday ? 'date' : undefined}
              sx={(theme) => ({
                height: HEAD_HEIGHT,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.25,
                color: tokensOf(theme).textSecondary,
                bgcolor: index >= 5 ? tokensOf(theme).surfaceMuted : 'transparent',
              })}
            >
              <Box component="span" sx={{ fontSize: fontSize.xs, fontWeight: font.medium, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {weekdayShort(day)}
              </Box>
              <Box
                component="span"
                sx={(theme) => ({
                  minWidth: 30,
                  height: 30,
                  px: 0.5,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: `${radius.round}px`,
                  fontSize: fontSize.lg,
                  fontWeight: font.semibold,
                  lineHeight: 1,
                  ...(isToday
                    ? { bgcolor: tokensOf(theme).accent.main, color: tokensOf(theme).accent.contrastText }
                    : { color: tokensOf(theme).text }),
                })}
              >
                {dayOfMonth(day)}
              </Box>
            </Box>
          );
        })}

        <Box sx={{ position: 'relative', height: bodyHeight }} aria-hidden="true">
          {hours.map((hour, i) => (
            <Box
              key={hour}
              component="span"
              sx={(theme) => ({
                position: 'absolute',
                top: i * HOUR_HEIGHT,
                right: 8,
                transform: i === 0 ? 'none' : 'translateY(-50%)',
                fontSize: fontSize.xs,
                color: tokensOf(theme).textMuted,
                fontVariantNumeric: 'tabular-nums',
              })}
            >
              {`${String(hour).padStart(2, '0')}:00`}
            </Box>
          ))}
        </Box>

        {days.map((day, index) => (
          <Box
            key={day}
            sx={(theme) => {
              const c = tokensOf(theme);
              return {
                position: 'relative',
                height: bodyHeight,
                borderLeft: `1px solid ${c.border}`,
                borderTop: `1px solid ${c.border}`,
                ...(index === days.length - 1 && { borderRight: `1px solid ${c.border}` }),
                bgcolor: index >= 5 ? c.surfaceMuted : 'transparent',
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_HEIGHT - 1}px, ${c.border} ${HOUR_HEIGHT - 1}px, ${c.border} ${HOUR_HEIGHT}px)`,
              };
            }}
          >
            {sessions
              .filter((s) => s.date === day)
              .map((s) => {
                const from = minutesOf(s.startTime);
                const to = minutesOf(s.endTime);
                const cancelled = s.status === 'CANCELLED';
                const selected = s.id === selectedId;
                const label = cancelled
                  ? t('Séance annulée de {start} à {end}, {class}', { start: s.startTime, end: s.endTime, class: s.class.name })
                  : t('Séance de {start} à {end}, {class}', { start: s.startTime, end: s.endTime, class: s.class.name });
                return (
                  <Box
                    key={s.id}
                    component="button"
                    type="button"
                    aria-label={label}
                    aria-pressed={selected}
                    onClick={() => onSelect(s)}
                    sx={(theme) => {
                      const c = tokensOf(theme);
                      const tint = tintOf(theme, s.class.id);
                      return {
                        position: 'absolute',
                        left: 3,
                        right: 3,
                        top: ((from - start * 60) / 60) * HOUR_HEIGHT + 1,
                        height: Math.max(((to - from) / 60) * HOUR_HEIGHT - 3, 26),
                        m: 0,
                        p: '3px 5px',
                        overflow: 'hidden',
                        textAlign: 'left',
                        font: 'inherit',
                        fontSize: fontSize.xs,
                        lineHeight: 1.25,
                        cursor: 'pointer',
                        borderRadius: '8px',
                        border: cancelled ? `1px dashed ${c.borderStrong}` : 0,
                        borderLeft: cancelled ? `1px dashed ${c.borderStrong}` : `3px solid ${tint.bar}`,
                        bgcolor: cancelled ? c.surfaceMuted : tint.bg,
                        color: cancelled ? c.textSecondary : tint.text,
                        outline: selected ? `2px solid ${c.accent.main}` : 'none',
                        outlineOffset: selected ? 0 : undefined,
                        zIndex: selected ? 1 : 0,
                        '&:hover': { filter: 'brightness(0.97)' },
                        '&:focus-visible': { outline: `3px solid ${c.focus}`, outlineOffset: 1, zIndex: 2 },
                      };
                    }}
                  >
                    <Box component="span" sx={{ display: 'block', fontSize: 11, whiteSpace: 'nowrap', fontWeight: font.semibold, fontVariantNumeric: 'tabular-nums' }}>
                      {t('{start} – {end}', { start: s.startTime, end: s.endTime })}
                    </Box>
                    <Box
                      component="span"
                      sx={{ display: 'block', fontWeight: font.semibold, textDecoration: cancelled ? 'line-through' : 'none', overflowWrap: 'anywhere' }}
                    >
                      {s.class.name}
                    </Box>
                    {cancelled && (
                      <Box component="span" sx={{ display: 'block', fontWeight: font.regular }}>
                        {t('Annulée')}
                      </Box>
                    )}
                  </Box>
                );
              })}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
