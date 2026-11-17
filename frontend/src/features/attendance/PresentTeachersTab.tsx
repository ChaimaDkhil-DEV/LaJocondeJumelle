import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { LogOut, Undo2, UsersRound } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { ApiError } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { SectionCard } from '../../components/SectionCard';
import { useToast } from '../../components/Toast';
import { icon } from '../../design/tokens';
import { formatTime } from '../coverage/labels';
import { t } from '../../i18n';
import { useMarkReturned, usePresentTeachers, useRecordDeparture } from './api';
import { METHOD_LABELS } from './labels';
import type { DepartedTeacher, PresentTeacher } from './types';

const errorText = (error: unknown, fallback: string): string => (error instanceof ApiError ? error.message : fallback);

/** « 1 présent », « 2 présents » : zéro et un au singulier, comme en français. */
const presentCount = (count: number) => (count > 1 ? t('{count} présents', { count: String(count) }) : t('{count} présent', { count: String(count) }));
const departedCount = (count: number) => (count > 1 ? t('{count} repartis', { count: String(count) }) : t('{count} reparti', { count: String(count) }));

/** Heure d'arrivée et dernière classe : la même ligne pour un présent et pour un reparti. */
function arrivalLine(row: PresentTeacher): string {
  const arrival = row.firstArrivalAt ? t('Arrivée à {time}', { time: formatTime(row.firstArrivalAt) }) : t('Heure d’arrivée non précisée');
  const place = row.lastClass.room ? `${row.lastClass.name} (${row.lastClass.room})` : row.lastClass.name;
  return `${arrival} · ${t('Dernière classe : {name}', { name: place })}`;
}

function Row({ name, children, action }: { name: string; children: ReactNode; action: ReactNode }) {
  return (
    <Box
      component="li"
      sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 1, p: 2, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}
    >
      <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0, flex: '1 1 14rem' }}>
        <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 500, overflowWrap: 'anywhere' }}>{name}</Typography>
        {children}
      </Box>
      <Box sx={{ flex: 'none' }}>{action}</Box>
    </Box>
  );
}

/** Départ d'un enseignant parti sans scanner : l'heure réelle et le commentaire sont facultatifs. */
function DepartureDialog({ row, onClose }: { row: PresentTeacher; onClose: () => void }) {
  const titleId = useId();
  const toast = useToast();
  const record = useRecordDeparture();
  const [departedTime, setDepartedTime] = useState('');
  const [comment, setComment] = useState('');

  const save = () =>
    record.mutate(
      { teacherId: row.teacher.id, ...(departedTime ? { departedTime } : {}), ...(comment.trim() ? { comment: comment.trim() } : {}) },
      {
        onSuccess: () => {
          toast.success(t('Départ enregistré.'));
          onClose();
        },
      },
    );

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="xs">
      <DialogTitle id={titleId}>{t('Enregistrer un départ')}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        <Typography variant="body2" color="text.secondary">
          {t('Pour {name}, qui a quitté l’établissement sans scanner. L’opération est conservée dans le journal d’audit.', { name: row.teacher.displayName })}
        </Typography>
        <TextField
          id="depart-heure"
          type="time"
          label={t('Heure réelle du départ (facultatif)')}
          value={departedTime}
          onChange={(e) => setDepartedTime(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          helperText={t('Sans heure, le départ est enregistré à l’heure de la saisie.')}
        />
        <TextField
          id="depart-commentaire"
          label={t('Commentaire (facultatif)')}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          multiline
          minRows={2}
          slotProps={{ htmlInput: { maxLength: 500 } }}
        />
        {record.isError && <Alert severity="error" role="alert">{errorText(record.error, t('Enregistrement impossible.'))}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Annuler')}</Button>
        <Button variant="contained" onClick={save} loading={record.isPending}>{t('Enregistrer')}</Button>
      </DialogActions>
    </Dialog>
  );
}

function DepartedRow({ row }: { row: DepartedTeacher }) {
  const toast = useToast();
  const markReturned = useMarkReturned();
  const { departure } = row;
  return (
    <Row
      name={row.teacher.displayName}
      action={
        <Button
          size="small"
          startIcon={<Undo2 size={icon.sm} aria-hidden="true" />}
          loading={markReturned.isPending}
          onClick={() =>
            markReturned.mutate(departure.id, {
              onSuccess: () => toast.success(t('{name} est de nouveau noté présent.', { name: row.teacher.displayName })),
              onError: (e) => toast.error(errorText(e, t('Enregistrement impossible.'))),
            })
          }
        >
          {t('Marquer de retour')}
        </Button>
      }
    >
      <Typography variant="body2">
        {t('Parti à {time}', { time: formatTime(departure.departedAt) })} · {METHOD_LABELS[departure.method]}
        {departure.method === 'MANUAL' ? ` (${departure.recordedBy.displayName})` : ''}
      </Typography>
      <Typography variant="body2" color="text.secondary">{arrivalLine(row)}</Typography>
      {departure.comment && <Typography variant="body2" color="text.secondary">{departure.comment}</Typography>}
    </Row>
  );
}

/**
 * « Enseignants présents » (019) : qui est dans l'établissement maintenant, d'après les scans du jour. Une
 * ligne par enseignant, quel que soit le nombre de classes scannées. La liste se relit toute seule quand le
 * serveur signale un scan (`attendance:updated`).
 *
 * Deux limites dites à l'écran : sans emploi du temps, un enseignant qui n'a pas scanné n'apparaît pas et
 * n'est pas pour autant absent ; sans scan de départ, il reste affiché présent jusqu'à la fin de la journée.
 */
export function PresentTeachersTab() {
  const list = usePresentTeachers();
  const [leaving, setLeaving] = useState<PresentTeacher | null>(null);

  if (list.isPending) return <LoadingState label={t('Chargement des enseignants présents')} variant="detail" />;
  if (list.error) {
    return <ErrorState message={t('Impossible de charger les enseignants présents.')} actionLabel={t('Réessayer')} onAction={() => void list.refetch()} />;
  }
  const { present, departed } = list.data;

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <SectionCard
        title={t('Enseignants présents')}
        icon={UsersRound}
        description={t(
          'D’après les scans du jour. Un enseignant qui n’a pas scanné n’apparaît pas : ce n’est pas une absence. Sans scan de départ, il reste affiché présent jusqu’à la fin de la journée.',
        )}
        actions={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }} role="status">
            <Chip color="success" label={presentCount(present.length)} />
            {departed.length > 0 && <Chip variant="outlined" label={departedCount(departed.length)} />}
          </Box>
        }
        flush
      >
        {present.length === 0 ? (
          <EmptyState
            compact
            icon={UsersRound}
            title={t('Aucun enseignant présent pour le moment')}
            description={t('La liste se remplit à mesure que les enseignants scannent le QR code de leur classe.')}
          />
        ) : (
          <Box component="ul" aria-label={t('Enseignants présents')} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {present.map((row) => (
              <Row
                key={row.teacher.id}
                name={row.teacher.displayName}
                action={
                  <Button size="small" startIcon={<LogOut size={icon.sm} aria-hidden="true" />} onClick={() => setLeaving(row)}>
                    {t('Enregistrer un départ')}
                  </Button>
                }
              >
                <Typography variant="body2" color="text.secondary">{arrivalLine(row)}</Typography>
              </Row>
            ))}
          </Box>
        )}
      </SectionCard>

      {departed.length > 0 && (
        <SectionCard title={t('Repartis aujourd’hui')} icon={LogOut} flush>
          <Box component="ul" aria-label={t('Repartis aujourd’hui')} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {departed.map((row) => (
              <DepartedRow key={row.departure.id} row={row} />
            ))}
          </Box>
        </SectionCard>
      )}

      {leaving && <DepartureDialog row={leaving} onClose={() => setLeaving(null)} />}
    </Box>
  );
}
