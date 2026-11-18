import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import { useEffect, useRef } from 'react';
import { t } from '../../i18n';
import { formatTime } from '../coverage/labels';
import { dateLabel } from './labels';
import type { TimetableConflict } from './types';

/**
 * Conflits d'horaires renvoyés par le serveur : chaque séance existante en cause, et comment corriger. Le message
 * reçoit le focus à son apparition, pour être lu tout de suite au lecteur d'écran.
 */
export function ConflictList({ conflicts }: { conflicts: TimetableConflict[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [conflicts]);
  return (
    <Alert severity="error" ref={ref} tabIndex={-1} role="alert" sx={{ outline: 'none' }}>
      <AlertTitle>{t('Conflit d’horaires : rien n’a été enregistré')}</AlertTitle>
      <Box component="ul" sx={{ m: 0, pl: 2 }}>
        {conflicts.map((c, i) => {
          const values = {
            date: dateLabel(c.date),
            start: formatTime(c.startAt),
            end: formatTime(c.endAt),
            teacher: c.teacher.displayName,
            class: c.class.name,
          };
          return (
            <li key={`${c.sessionId}-${c.kind}-${i}`}>
              {c.kind === 'TEACHER'
                ? t('{date}, {start} – {end} : {teacher} a déjà une séance en {class}.', values)
                : t('{date}, {start} – {end} : la classe {class} a déjà une séance avec {teacher}.', values)}
            </li>
          );
        })}
      </Box>
      {t('Choisissez un autre horaire, ou annulez d’abord la séance existante.')}
    </Alert>
  );
}
