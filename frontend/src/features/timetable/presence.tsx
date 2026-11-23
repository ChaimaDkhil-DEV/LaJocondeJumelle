import Box from '@mui/material/Box';
import { toneColors } from '../../components/Badge';
import { font } from '../../design/tokens';
import { t } from '../../i18n';
import { SESSION_STATUS } from '../attendance/sessionStatus';
import type { SessionPresence, TimetableSession } from './types';

/**
 * Présence de l'enseignant sur une séance de l'emploi du temps d'administration : le statut calculé par le serveur à
 * partir du pointage (le même que « Enseignants attendus »). Rien n'est recalculé ici : on l'affiche.
 */

/** Sur la séance elle-même : « À venir » est l'état de toutes les séances futures et ne s'écrit pas ; une annulée le dit déjà. */
export function shownPresence(session: Pick<TimetableSession, 'presence' | 'status'>): SessionPresence | null {
  const p = session.presence;
  if (!p || session.status === 'CANCELLED' || p.status === 'UPCOMING' || p.status === 'CANCELLED') return null;
  return p;
}

/** Suite du nom accessible d'une séance : « , En retard, 12 min, remplacé(e) par Bilel Professeur ». */
export function presenceAria(p: SessionPresence): string {
  const parts = [SESSION_STATUS[p.status].label];
  if (p.lateMinutes) parts.push(t('{minutes} min', { minutes: p.lateMinutes }));
  if (p.replacedBy) parts.push(t('remplacé(e) par {name}', { name: p.replacedBy.displayName }));
  return `, ${parts.join(', ')}`;
}

/** Petite pastille du statut (icône et libellé) et, pour un retard, sa durée. Tient sur une séance d'une heure. */
export function PresencePill({ presence }: { presence: SessionPresence }) {
  const { label, tone, icon: Icon } = SESSION_STATUS[presence.status];
  return (
    <Box
      component="span"
      data-presence={presence.status}
      sx={(theme) => {
        const c = toneColors(theme, tone);
        return {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          maxWidth: '100%',
          px: 0.5,
          height: 18,
          borderRadius: '999px',
          border: `1px solid ${c.border}`,
          bgcolor: c.soft,
          color: c.text,
          fontSize: 11,
          fontWeight: font.semibold,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          '& svg': { flex: 'none' },
        };
      }}
    >
      <Icon size={11} strokeWidth={2.25} aria-hidden="true" />
      <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </Box>
      {presence.lateMinutes ? <span>{t('{minutes} min', { minutes: presence.lateMinutes })}</span> : null}
    </Box>
  );
}
