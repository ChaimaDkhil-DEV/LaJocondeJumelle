import Box from '@mui/material/Box';
import { alpha, type Theme } from '@mui/material/styles';
import { MapPin } from 'lucide-react';
import { font, fontSize, icon, radius, sessionPalette, tokensOf, type SessionTint } from '../../design/tokens';
import { t } from '../../i18n';
import { dayOfMonth, weekdayShort } from './labels';
import { PresencePill, presenceAria, shownPresence } from './presence';
import type { TimetableSession } from './types';
import { hourRange, minutesOf, paletteIndex, tintKey } from './weekLayout';

const HOUR_HEIGHT = 50;
/** Séance détaillée : un peu plus haute, pour que l'heure, la matière, la classe et la salle tiennent sur deux heures. */
const DETAILED_HOUR_HEIGHT = 60;
/** Avec la présence : une séance d'une heure porte l'heure, la classe, le statut et le remplaçant. */
const PRESENCE_HOUR_HEIGHT = 84;
const GUTTER = 56;
/** Largeur minimale d'une colonne de jour : plus large pour la séance détaillée, dont la matière ne doit pas se couper. */
const DAY_MIN = 76;
const DETAILED_DAY_MIN = 136;
/** Avec la présence : la pastille du statut et le nom du remplaçant doivent tenir sans se couper. */
const PRESENCE_DAY_MIN = 152;
const HEAD_HEIGHT = 52;

/** Teinte d'une clé (une classe, ou une matière) dans le thème courant. */
export function tintOf(theme: Theme, key: string): SessionTint {
  return sessionPalette[theme.palette.mode][paletteIndex(key)];
}

interface WeekGridProps {
  days: string[];
  sessions: TimetableSession[];
  selectedId?: string | undefined;
  today: string;
  /** Absent : les séances sont seulement lues (ni boutons, ni sélection). */
  onSelect?: (session: TimetableSession) => void;
  /** Séance détaillée (emploi du temps de l'enseignant) : heure, matière, classe et salle. */
  detailed?: boolean;
  /** Teinte par classe (défaut) ou par matière. */
  tintBy?: 'class' | 'subject';
  /** Plage d'heures ajustée aux séances, au lieu de 8 h – 17 h au minimum. */
  fitHours?: boolean;
  /** Heure actuelle (heure locale de l'école) : trait posé dans la colonne du jour, s'il est dans la plage affichée. */
  now?: Date;
  /** Administration : le statut de présence de l'enseignant (pointage, retard, absence) et son remplaçant sur chaque séance. */
  showPresence?: boolean;
}

/**
 * Semaine en grille : une colonne par jour, une ligne par heure, chaque séance posée à son heure et à sa durée. Chaque
 * séance est un bouton nommé (heures et classe) ; la liste par jour (SessionList) reste le même contenu pour le
 * clavier avancé, le lecteur d'écran et le téléphone. Une séance annulée reste visible, barrée et dite « Annulée ».
 * La colonne du jour est teintée et, avec `now`, un trait marque l'heure actuelle.
 */
export function WeekGrid({ days, sessions, selectedId, today, onSelect, detailed = false, tintBy = 'class', fitHours = false, now, showPresence = false }: WeekGridProps) {
  const { start, end } = hourRange(sessions, fitHours);
  const hourHeight = detailed ? DETAILED_HOUR_HEIGHT : showPresence ? PRESENCE_HOUR_HEIGHT : HOUR_HEIGHT;
  const dayMin = detailed ? DETAILED_DAY_MIN : showPresence ? PRESENCE_DAY_MIN : DAY_MIN;
  const hours = Array.from({ length: end - start }, (_v, i) => start + i);
  const bodyHeight = hours.length * hourHeight;
  const nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : null;
  const showNow = nowMinutes !== null && nowMinutes >= start * 60 && nowMinutes <= end * 60;

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box
        role="group"
        aria-label={t('Séances de la semaine')}
        sx={{ display: 'grid', gridTemplateColumns: `${GUTTER}px repeat(${days.length}, minmax(${dayMin}px, 1fr))`, minWidth: detailed || showPresence ? GUTTER + days.length * dayMin : 640 }}
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
          {/* Une étiquette par ligne, plus l'heure de fin posée au bord bas de la grille. */}
          {[...hours, end].map((hour, i) => (
            <Box
              key={hour}
              component="span"
              data-hour-label=""
              sx={(theme) => ({
                position: 'absolute',
                top: i * hourHeight,
                right: 8,
                transform: i === 0 ? 'none' : i === hours.length ? 'translateY(-100%)' : 'translateY(-50%)',
                fontSize: fontSize.xs,
                color: tokensOf(theme).textMuted,
                fontVariantNumeric: 'tabular-nums',
              })}
            >
              {`${String(hour).padStart(2, '0')}:00`}
            </Box>
          ))}
        </Box>

        {days.map((day, index) => {
          const isToday = day === today;
          return (
            <Box
              key={day}
              data-today={isToday ? day : undefined}
              sx={(theme) => {
                const c = tokensOf(theme);
                return {
                  position: 'relative',
                  height: bodyHeight,
                  borderLeft: `1px solid ${c.border}`,
                  borderTop: `1px solid ${c.border}`,
                  ...(index === days.length - 1 && { borderRight: `1px solid ${c.border}` }),
                  bgcolor: isToday ? alpha(c.accent.main, 0.05) : index >= 5 ? c.surfaceMuted : 'transparent',
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${hourHeight - 1}px, ${c.border} ${hourHeight - 1}px, ${c.border} ${hourHeight}px)`,
                };
              }}
            >
              {isToday && showNow && (
                <Box
                  data-now-line=""
                  aria-hidden="true"
                  sx={(theme) => ({
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: ((nowMinutes! - start * 60) / 60) * hourHeight,
                    height: 0,
                    borderTop: `2px solid ${tokensOf(theme).error.main}`,
                    zIndex: 3,
                    pointerEvents: 'none',
                    '&::before': { content: '""', position: 'absolute', left: -4, top: -5, width: 8, height: 8, borderRadius: '50%', bgcolor: tokensOf(theme).error.main },
                  })}
                />
              )}
              {sessions
                .filter((s) => s.date === day)
                .map((s) => {
                  const from = minutesOf(s.startTime);
                  const to = minutesOf(s.endTime);
                  const cancelled = s.status === 'CANCELLED';
                  const selected = s.id === selectedId;
                  const withSubject = detailed && Boolean(s.subject);
                  const label = withSubject
                    ? t(cancelled ? 'Séance annulée de {start} à {end}, {subject}, {class}' : 'Séance de {start} à {end}, {subject}, {class}', {
                        start: s.startTime,
                        end: s.endTime,
                        subject: s.subject!,
                        class: s.class.name,
                      })
                    : cancelled
                      ? t('Séance annulée de {start} à {end}, {class}', { start: s.startTime, end: s.endTime, class: s.class.name })
                      : t('Séance de {start} à {end}, {class}', { start: s.startTime, end: s.endTime, class: s.class.name });
                  const presence = showPresence ? shownPresence(s) : null;
                  const interactive = Boolean(onSelect);
                  return (
                    <Box
                      key={s.id}
                      component={interactive ? 'button' : 'div'}
                      {...(interactive ? { type: 'button', 'aria-pressed': selected, onClick: () => onSelect!(s) } : { role: 'group' })}
                      aria-label={presence ? `${label}${presenceAria(presence)}` : label}
                      sx={(theme) => {
                        const c = tokensOf(theme);
                        const tint = tintOf(theme, tintBy === 'subject' ? tintKey(s) : s.class.id);
                        return {
                          position: 'absolute',
                          left: 3,
                          right: 3,
                          top: ((from - start * 60) / 60) * hourHeight + 1,
                          height: Math.max(((to - from) / 60) * hourHeight - 3, 26),
                          m: 0,
                          p: detailed ? '6px 8px' : '3px 5px',
                          overflow: 'hidden',
                          textAlign: 'left',
                          font: 'inherit',
                          fontSize: fontSize.xs,
                          lineHeight: 1.25,
                          cursor: interactive ? 'pointer' : 'default',
                          display: detailed ? 'flex' : 'block',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          borderRadius: detailed ? '10px' : '8px',
                          border: cancelled ? `1px dashed ${c.borderStrong}` : 0,
                          borderLeft: cancelled ? `1px dashed ${c.borderStrong}` : `3px solid ${tint.bar}`,
                          bgcolor: cancelled ? c.surfaceMuted : tint.bg,
                          color: cancelled ? c.textSecondary : tint.text,
                          outline: selected ? `2px solid ${c.accent.main}` : 'none',
                          outlineOffset: selected ? 0 : undefined,
                          zIndex: selected ? 1 : 0,
                          ...(interactive && { '&:hover': { filter: 'brightness(0.97)' } }),
                          '&:focus-visible': { outline: `3px solid ${c.focus}`, outlineOffset: 1, zIndex: 2 },
                        };
                      }}
                    >
                      <Box component="span" sx={{ display: 'block', minWidth: 0 }}>
                        <Box component="span" sx={{ display: 'block', fontSize: 11, whiteSpace: 'nowrap', fontWeight: font.semibold, fontVariantNumeric: 'tabular-nums' }}>
                          {t('{start} – {end}', { start: s.startTime, end: s.endTime })}
                        </Box>
                        {detailed && s.subject && (
                          <Box
                            component="span"
                            sx={{ display: 'block', fontSize: fontSize.sm, fontWeight: font.semibold, textDecoration: cancelled ? 'line-through' : 'none', overflowWrap: 'break-word' }}
                          >
                            {s.subject}
                          </Box>
                        )}
                        <Box
                          component="span"
                          sx={{ display: 'block', fontWeight: detailed ? font.regular : font.semibold, textDecoration: cancelled ? 'line-through' : 'none', overflowWrap: 'anywhere' }}
                        >
                          {s.class.name}
                        </Box>
                        {cancelled && (
                          <Box component="span" sx={{ display: 'block', fontWeight: font.regular }}>
                            {t('Annulée')}
                          </Box>
                        )}
                        {presence && (
                          <Box component="span" sx={{ display: 'block', mt: 0.25 }}>
                            <PresencePill presence={presence} />
                          </Box>
                        )}
                        {presence?.replacedBy && (
                          <Box component="span" sx={{ display: 'block', mt: 0.25, fontSize: 11, lineHeight: 1.2, fontWeight: font.semibold, overflowWrap: 'anywhere' }}>
                            {t('Remplacé(e) par {name}', { name: presence.replacedBy.displayName })}
                          </Box>
                        )}
                      </Box>
                      {detailed && s.room && (
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 11, minWidth: 0 }}>
                          <MapPin size={icon.sm - 2} strokeWidth={2} aria-hidden="true" />
                          <span>{s.room}</span>
                        </Box>
                      )}
                    </Box>
                  );
                })}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
