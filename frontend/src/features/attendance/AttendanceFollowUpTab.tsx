import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ClipboardCheck, Pencil, UserRoundCheck } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { ApiError } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { SectionCard } from '../../components/SectionCard';
import { useToast } from '../../components/Toast';
import { icon } from '../../design/tokens';
import { useCoverageClasses, useCoverageTeachers } from '../coverage/api';
import { formatTime, TYPE_LABELS } from '../coverage/labels';
import { t } from '../../i18n';
import { useAttendanceDay, useCorrectAttendance, useRecordManual, useSetSubstitute } from './api';
import { attendanceNotes, METHOD_LABELS, STATUS_COLORS, STATUS_LABELS } from './labels';
import { formatDay } from './MyAttendanceTab';
import type { AnnouncedItem, AttendanceItem, ManualStatus } from './types';

const NONE = 'none';

const errorText = (error: unknown, fallback: string): string => (error instanceof ApiError ? error.message : fallback);

/** Ligne de liste : contenu à gauche, actions à droite. */
function Row({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <Box component="li" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, p: 2, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
      <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>{children}</Box>
      {actions && <Box sx={{ flex: 'none' }}>{actions}</Box>}
    </Box>
  );
}

function ManualDialog({ date, onClose }: { date: string; onClose: () => void }) {
  const titleId = useId();
  const toast = useToast();
  const teachers = useCoverageTeachers();
  const classes = useCoverageClasses();
  const record = useRecordManual();
  const [teacherId, setTeacherId] = useState('');
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState<ManualStatus>('ON_TIME');
  const [arrivedTime, setArrivedTime] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  function save(): void {
    if (!teacherId || !classId) {
      setError(t('Choisissez l’enseignant et la classe.'));
      return;
    }
    setError(null);
    record.mutate(
      {
        teacherId,
        classId,
        date,
        status,
        ...(status !== 'ABSENT' && arrivedTime ? { arrivedTime } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast.success(t('Présence enregistrée.'));
          onClose();
        },
        onError: (e) => setError(errorText(e, t('Enregistrement impossible.'))),
      },
    );
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="xs">
      <DialogTitle id={titleId}>{t('Régulariser une présence')}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        <Typography variant="body2" color="text.secondary">
          {t('Pour un enseignant présent qui a oublié de scanner. Le jour concerné : {day}.', { day: formatDay(date) })}
        </Typography>
        <TextField select id="regul-enseignant" label={t('Enseignant')} value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
          {(teachers.data ?? []).map((person) => (
            <MenuItem key={person.id} value={person.id}>{person.displayName}</MenuItem>
          ))}
        </TextField>
        <TextField select id="regul-classe" label={t('Classe')} value={classId} onChange={(e) => setClassId(e.target.value)} required>
          {(classes.data ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
          ))}
        </TextField>
        <RadioGroup row aria-label={t('Situation')} value={status} onChange={(e) => setStatus(e.target.value as ManualStatus)}>
          <FormControlLabel value="ON_TIME" control={<Radio />} label={t('Marquer présent')} />
          <FormControlLabel value="LATE" control={<Radio />} label={t('Marquer en retard')} />
          <FormControlLabel value="ABSENT" control={<Radio />} label={t('Marquer absent')} />
        </RadioGroup>
        {status !== 'ABSENT' && (
          <TextField
            id="regul-heure"
            type="time"
            label={t('Heure réelle d’arrivée (facultatif)')}
            value={arrivedTime}
            onChange={(e) => setArrivedTime(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            helperText={t('Distincte de l’heure de saisie, enregistrée par le serveur.')}
          />
        )}
        <TextField
          id="regul-motif"
          label={status === 'ABSENT' ? t('Motif de l’absence') : t('Commentaire (facultatif)')}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          required={status === 'ABSENT'}
          multiline
          minRows={2}
          slotProps={{ htmlInput: { maxLength: 500 } }}
        />
        {error && <Alert severity="error" role="alert">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Annuler')}</Button>
        <Button variant="contained" onClick={save} loading={record.isPending}>{t('Enregistrer')}</Button>
      </DialogActions>
    </Dialog>
  );
}

function CorrectDialog({ item, onClose }: { item: AttendanceItem; onClose: () => void }) {
  const titleId = useId();
  const toast = useToast();
  const correct = useCorrectAttendance();
  const [status, setStatus] = useState<ManualStatus | typeof NONE>(NONE);
  const [arrivedTime, setArrivedTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Un scan est une preuve : pas d'absence, et son heure (celle du serveur) ne se modifie pas.
  const isScan = item.method === 'QR';

  function save(): void {
    if (!reason.trim()) {
      setError(t('Indiquez le motif de la correction.'));
      return;
    }
    if (status === NONE && !arrivedTime) {
      setError(t('Indiquez ce qui change : le statut ou l’heure d’arrivée.'));
      return;
    }
    setError(null);
    correct.mutate(
      {
        id: item.id,
        reason: reason.trim(),
        ...(status !== NONE ? { status } : {}),
        ...(arrivedTime ? { arrivedTime } : {}),
      },
      {
        onSuccess: () => {
          toast.success(t('Présence corrigée.'));
          onClose();
        },
        onError: (e) => setError(errorText(e, t('Correction impossible.'))),
      },
    );
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="xs">
      <DialogTitle id={titleId}>{t('Corriger : {name}', { name: item.teacher.displayName })}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        <Typography variant="body2" color="text.secondary">
          {item.class.name} · {formatDay(item.date)} · {STATUS_LABELS[item.status]}
        </Typography>
        <TextField select id="correction-statut" label={t('Nouveau statut')} value={status} onChange={(e) => setStatus(e.target.value as ManualStatus | typeof NONE)}>
          <MenuItem value={NONE}>{t('Inchangé')}</MenuItem>
          <MenuItem value="ON_TIME">{t('Présent')}</MenuItem>
          <MenuItem value="LATE">{t('En retard')}</MenuItem>
          {!isScan && <MenuItem value="ABSENT">{t('Absent')}</MenuItem>}
        </TextField>
        {!isScan && status !== 'ABSENT' && (
          <TextField
            id="correction-heure"
            type="time"
            label={t('Nouvelle heure d’arrivée')}
            value={arrivedTime}
            onChange={(e) => setArrivedTime(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        )}
        <TextField
          id="correction-motif"
          label={t('Motif de la correction')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          multiline
          minRows={2}
          helperText={t('Conservé dans le journal d’audit avec l’ancien et le nouveau statut.')}
          slotProps={{ htmlInput: { maxLength: 300 } }}
        />
        {error && <Alert severity="error" role="alert">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Annuler')}</Button>
        <Button variant="contained" onClick={save} loading={correct.isPending}>{t('Enregistrer')}</Button>
      </DialogActions>
    </Dialog>
  );
}

function SubstituteDialog({ item, onClose }: { item: AnnouncedItem; onClose: () => void }) {
  const titleId = useId();
  const toast = useToast();
  const teachers = useCoverageTeachers();
  const setSubstitute = useSetSubstitute();
  const [teacherId, setTeacherId] = useState(item.substituteTeacher?.id ?? NONE);
  const [error, setError] = useState<string | null>(null);

  function save(): void {
    setError(null);
    setSubstitute.mutate(
      { requestId: item.requestId, teacherId: teacherId === NONE ? null : teacherId },
      {
        onSuccess: () => {
          toast.success(teacherId === NONE ? t('Remplaçant retiré.') : t('Remplaçant désigné.'));
          onClose();
        },
        onError: (e) => setError(errorText(e, t('Enregistrement impossible.'))),
      },
    );
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="xs">
      <DialogTitle id={titleId}>{t('Remplaçant de {name}', { name: item.teacher?.displayName ?? t('l’enseignant') })}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        <Typography variant="body2" color="text.secondary">
          {t('Le remplaçant pointe sous son propre compte ; le titulaire reste identifié sur la demande.')}
        </Typography>
        <TextField
          select
          id="remplacant"
          label={t('Enseignant remplaçant')}
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          error={Boolean(error)}
          helperText={error ?? undefined}
        >
          <MenuItem value={NONE}>{t('Aucun remplaçant')}</MenuItem>
          {(teachers.data ?? [])
            .filter((person) => person.id !== item.teacher?.id)
            .map((person) => (
              <MenuItem key={person.id} value={person.id}>{person.displayName}</MenuItem>
            ))}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Annuler')}</Button>
        <Button variant="contained" onClick={save} loading={setSubstitute.isPending}>{t('Enregistrer')}</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * « Présences » (admin) : pointages du jour, demandes annoncées, classes vides et état des classes.
 * Sans emploi du temps, il n'existe pas de liste d'enseignants « attendus » : « aucun scan enregistré »
 * n'est jamais une absence. Une absence n'est posée que par une personne (régularisation).
 */
export function AttendanceFollowUpTab() {
  const [date, setDate] = useState('');
  const day = useAttendanceDay(date);
  const [manual, setManual] = useState(false);
  const [correcting, setCorrecting] = useState<AttendanceItem | null>(null);
  const [substituteFor, setSubstituteFor] = useState<AnnouncedItem | null>(null);

  if (day.isPending) return <LoadingState label={t('Chargement des présences')} variant="detail" />;
  if (day.error) return <ErrorState message={t('Impossible de charger les présences.')} actionLabel={t('Réessayer')} onAction={() => void day.refetch()} />;
  const data = day.data;

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <SectionCard
        title={t('Suivi des présences')}
        icon={ClipboardCheck}
        description={t('Les arrivées sont enregistrées automatiquement au scan. Intervenez seulement pour un oubli de scan : un défaut de scan n’est jamais une absence.')}
        actions={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              id="suivi-jour"
              type="date"
              size="small"
              label={t('Jour')}
              value={date || data.date}
              onChange={(e) => setDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Button variant="contained" startIcon={<UserRoundCheck size={icon.md} aria-hidden="true" />} onClick={() => setManual(true)}>
              {t('Régulariser une présence')}
            </Button>
          </Box>
        }
        flush
      >
        {data.attendances.length === 0 ? (
          <EmptyState compact icon={ClipboardCheck} title={t('Aucune arrivée enregistrée ce jour')} />
        ) : (
          <Box component="ul" aria-label={t('Arrivées enregistrées')} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {data.attendances.map((item) => (
              <Row
                key={item.id}
                actions={
                  <Button size="small" startIcon={<Pencil size={icon.sm} aria-hidden="true" />} onClick={() => setCorrecting(item)}>
                    {t('Corriger')}
                  </Button>
                }
              >
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 500 }}>
                    {item.teacher.displayName} — {item.class.name}
                  </Typography>
                  <Chip size="small" color={STATUS_COLORS[item.status]} label={STATUS_LABELS[item.status]} />
                  {item.anomaly && <Chip size="small" color="warning" variant="outlined" label={t('Absence annoncée')} />}
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {METHOD_LABELS[item.method]}
                  {item.arrivedAt ? ` · ${t('arrivée à {time}', { time: formatTime(item.arrivedAt) })}` : ''}
                  {item.method === 'MANUAL' ? ` · ${t('saisi par {name} à {time}', { name: item.recordedBy.displayName, time: formatTime(item.recordedAt) })}` : ''}
                </Typography>
                {attendanceNotes(item).map((note) => (
                  <Typography key={note} variant="body2">{note}</Typography>
                ))}
                {item.comment && <Typography variant="body2" color="text.secondary">{item.comment}</Typography>}
              </Row>
            ))}
          </Box>
        )}
      </SectionCard>

      <SectionCard title={t('Retards et absences annoncés')} flush>
        {data.announced.length === 0 ? (
          <EmptyState compact title={t('Aucune demande annoncée ce jour')} />
        ) : (
          <Box component="ul" aria-label={t('Retards et absences annoncés')} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {data.announced.map((item) => (
              <Row
                key={item.requestId}
                actions={
                  item.type === 'ABSENCE' ? (
                    <Button size="small" onClick={() => setSubstituteFor(item)}>
                      {item.substituteTeacher ? t('Changer le remplaçant') : t('Désigner un remplaçant')}
                    </Button>
                  ) : undefined
                }
              >
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 500 }}>
                    {item.teacher?.displayName ?? t('Enseignant non précisé')} — {item.class.name}
                  </Typography>
                  {item.type && <Chip size="small" variant="outlined" label={TYPE_LABELS[item.type]} />}
                  <Chip
                    size="small"
                    color={item.attendanceId ? 'success' : 'default'}
                    label={item.attendanceId ? t('Arrivée scannée') : t('Aucun scan enregistré')}
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {t('À partir de {start}', { start: formatTime(item.startAt) })}
                  {item.plannedEndAt ? ` ${t('jusqu’à {end}', { end: formatTime(item.plannedEndAt) })}` : ''}
                </Typography>
                {item.substituteTeacher && (
                  <Typography variant="body2">{t('Remplaçant autorisé : {name}', { name: item.substituteTeacher.displayName })}</Typography>
                )}
              </Row>
            ))}
          </Box>
        )}
      </SectionCard>

      <SectionCard title={t('État des classes')} flush>
        {data.classStates.length === 0 ? (
          <EmptyState compact title={t('Aucun événement de classe ce jour')} />
        ) : (
          <Box component="ul" aria-label={t('État des classes')} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {data.classStates.map((state) => (
              <Row key={state.class.id}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 500 }}>{state.class.name}</Typography>
                  {state.current && (
                    <Chip size="small" color={state.current === 'EMPTY' ? 'warning' : 'success'} label={state.current === 'EMPTY' ? t('Vide') : t('Occupée')} />
                  )}
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {state.events
                    .map((event) => `${event.kind === 'EMPTY' ? t('Classe vide') : t('Arrivée')} ${formatTime(event.at)}`)
                    .join(' → ')}
                </Typography>
              </Row>
            ))}
          </Box>
        )}
      </SectionCard>

      {manual && <ManualDialog date={date || data.date} onClose={() => setManual(false)} />}
      {correcting && <CorrectDialog item={correcting} onClose={() => setCorrecting(null)} />}
      {substituteFor && <SubstituteDialog item={substituteFor} onClose={() => setSubstituteFor(null)} />}
    </Box>
  );
}
