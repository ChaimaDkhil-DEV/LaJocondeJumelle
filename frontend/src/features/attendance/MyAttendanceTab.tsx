import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { Clock, MapPin, QrCode } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { SectionCard } from '../../components/SectionCard';
import { icon } from '../../design/tokens';
import { formatTime } from '../coverage/labels';
import { Fact } from '../coverage/EmployeeViews';
import { t } from '../../i18n';
import { useMyAttendance } from './api';
import { attendanceNotes, METHOD_LABELS, STATUS_COLORS, STATUS_LABELS } from './labels';
import { QrScannerDialog } from './QrScannerDialog';
import type { AttendanceItem } from './types';

/** Jour AAAA-MM-JJ présenté JJ/MM/AAAA (date calendaire, sans fuseau). */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year}`;
}

function AttendanceRow({ item }: { item: AttendanceItem }) {
  const notes = attendanceNotes(item);
  return (
    <Box component="li" sx={{ display: 'grid', gap: 0.75, p: 2, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 500 }}>
          {item.class.name}
        </Typography>
        <Chip size="small" color={STATUS_COLORS[item.status]} label={STATUS_LABELS[item.status]} />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}>
        <Fact icon={Clock}>
          {formatDay(item.date)}
          {item.arrivedAt ? ` · ${formatTime(item.arrivedAt)}` : ''}
        </Fact>
        {item.class.room && <Fact icon={MapPin}>{item.class.room}</Fact>}
        <Fact icon={QrCode}>{METHOD_LABELS[item.method]}</Fact>
      </Box>
      {notes.map((note) => (
        <Typography key={note} variant="body2">{note}</Typography>
      ))}
      {item.method === 'MANUAL' && (
        <Typography variant="body2" color="text.secondary">
          {t('Saisi par {name}', { name: item.recordedBy.displayName })}
          {item.comment ? ` — ${item.comment}` : ''}
        </Typography>
      )}
    </Box>
  );
}

/** « Mes présences » (enseignant) : historique de ses arrivées et accès au scan du QR code de la classe. */
export function MyAttendanceTab() {
  const navigate = useNavigate();
  const attendance = useMyAttendance();
  const [scanning, setScanning] = useState(false);

  return (
    <SectionCard
      title={t('Mes présences')}
      description={t('Scannez le QR code affiché dans la classe, avec cette application ou l’appareil photo de votre téléphone.')}
      actions={
        <Button variant="contained" startIcon={<QrCode size={icon.md} aria-hidden="true" />} onClick={() => setScanning(true)}>
          {t('Scanner QR Code')}
        </Button>
      }
      flush
    >
      {attendance.isPending ? (
        <LoadingState label={t('Chargement de vos présences')} variant="inline" />
      ) : attendance.error ? (
        <ErrorState message={t('Impossible de charger vos présences.')} actionLabel={t('Réessayer')} onAction={() => void attendance.refetch()} />
      ) : attendance.data.length === 0 ? (
        <EmptyState compact icon={QrCode} title={t('Aucune présence enregistrée')} description={t('Votre arrivée en classe apparaîtra ici après le scan du QR code.')} />
      ) : (
        <Box component="ul" aria-label={t('Mes présences')} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {attendance.data.map((item) => (
            <AttendanceRow key={item.id} item={item} />
          ))}
        </Box>
      )}
      {scanning && (
        <QrScannerDialog
          onClose={() => setScanning(false)}
          onToken={(token) => {
            setScanning(false);
            navigate(`/gardes/presence?c=${encodeURIComponent(token)}`);
          }}
        />
      )}
    </SectionCard>
  );
}
