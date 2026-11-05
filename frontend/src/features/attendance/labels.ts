import { t } from '../../i18n';
import type { AttendanceItem, AttendanceMethod, AttendanceStatus } from './types';

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  ARRIVED: t('Arrivée enregistrée'),
  ON_TIME: t('Présent'),
  LATE: t('En retard'),
  ABSENT: t('Absent'),
};

export const METHOD_LABELS: Record<AttendanceMethod, string> = {
  QR: t('Scan du QR code'),
  MANUAL: t('Saisie de l’admin'),
};

/** Couleur du badge : « arrivée enregistrée » reste neutre, aucun jugement sans heure de référence. */
export const STATUS_COLORS: Record<AttendanceStatus, 'default' | 'success' | 'warning' | 'error'> = {
  ARRIVED: 'default',
  ON_TIME: 'success',
  LATE: 'warning',
  ABSENT: 'error',
};

/** Précision ajoutée au statut : retard annoncé, remplacement, anomalie. */
export function attendanceNotes(item: AttendanceItem): string[] {
  const notes: string[] = [];
  if (item.announcedType === 'LATENESS' && item.announcedLateMinutes !== null) {
    notes.push(t('Retard annoncé : {minutes} min après l’heure indiquée', { minutes: String(item.announcedLateMinutes) }));
  }
  if (item.substituteFor) notes.push(t('Remplacement de {name}', { name: item.substituteFor.displayName }));
  if (item.anomaly) notes.push(t('Absence annoncée : à vérifier'));
  return notes;
}
