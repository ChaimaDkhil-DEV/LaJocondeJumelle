import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { DoorOpen, MapPin } from 'lucide-react';
import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { ApiError } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { formatDateTime } from '../../components/format';
import { icon, layout } from '../../design/tokens';
import { useCoverageProfile } from '../coverage/api';
import { formatTime } from '../coverage/labels';
import { t } from '../../i18n';
import { useArrive, useResolveArrival } from './api';
import { attendanceNotes, STATUS_COLORS, STATUS_LABELS } from './labels';
import type { ArrivalMatch, ArrivalResult } from './types';

/** Ce que l'enregistrement va faire, d'après la demande annoncée trouvée pour cette classe aujourd'hui. */
function previewMessage(match: ArrivalMatch): { severity: 'info' | 'warning'; text: string } {
  switch (match.kind) {
    case 'ANNOUNCED_LATENESS':
      return { severity: 'info', text: t('Vous avez annoncé un retard pour cette classe : votre arrivée y sera rattachée.') };
    case 'ANNOUNCED_ABSENCE':
      return {
        severity: 'warning',
        text: t('Vous avez annoncé une absence couvrant ce moment. Si vous êtes bien présent(e), l’admin sera prévenue.'),
      };
    case 'SUBSTITUTE':
      return { severity: 'info', text: t('Vous êtes le remplaçant autorisé : votre présence est enregistrée à votre nom.') };
    case 'NONE':
      return { severity: 'info', text: t('Votre arrivée sera enregistrée à l’heure du serveur.') };
  }
}

function Confirmation({ result }: { result: ArrivalResult }) {
  const { attendance, created } = result;
  const notes = attendanceNotes(attendance);
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 2, maxWidth: layout.readable }}>
      <Alert severity={attendance.anomaly ? 'warning' : 'success'} role="status">
        {created ? t('Votre arrivée est enregistrée.') : t('Votre arrivée était déjà enregistrée pour aujourd’hui.')}
      </Alert>
      <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 2, rowGap: 0.75, m: 0 }}>
        <Typography component="dt" variant="body2" color="text.secondary">{t('Enseignant')}</Typography>
        <Typography component="dd" sx={{ m: 0 }}>{attendance.teacher.displayName}</Typography>
        <Typography component="dt" variant="body2" color="text.secondary">{t('Classe')}</Typography>
        <Typography component="dd" sx={{ m: 0 }}>{attendance.class.name}</Typography>
        <Typography component="dt" variant="body2" color="text.secondary">{t('Heure du scan')}</Typography>
        <Typography component="dd" sx={{ m: 0 }}>{formatDateTime(attendance.arrivedAt ?? attendance.recordedAt)}</Typography>
        <Typography component="dt" variant="body2" color="text.secondary">{t('Statut')}</Typography>
        <Box component="dd" sx={{ m: 0 }}>
          <Chip size="small" color={STATUS_COLORS[attendance.status]} label={STATUS_LABELS[attendance.status]} />
        </Box>
      </Box>
      {notes.map((note) => (
        <Typography key={note} variant="body2">{note}</Typography>
      ))}
      <Typography variant="caption" color="text.secondary">
        {t('L’heure enregistrée est celle du serveur au moment du scan.')}
      </Typography>
      <Box>
        <Button component={RouterLink} to="/gardes?onglet=mes-presences" variant="contained">
          {t('Mes présences')}
        </Button>
      </Box>
    </Paper>
  );
}

/**
 * Page ouverte par le QR code de la classe pour un enseignant. L'ouverture n'enregistre rien : la classe
 * s'affiche, puis un appui enregistre l'arrivée (identité de la session, heure du serveur). Le résultat
 * est gardé dans la page : le rafraîchissement qui suit l'enregistrement ne doit pas le remplacer.
 */
export function ArrivalPage() {
  const [params] = useSearchParams();
  const token = params.get('c') ?? '';
  const resolution = useResolveArrival(token);
  const profile = useCoverageProfile();
  const arrive = useArrive();
  const [result, setResult] = useState<ArrivalResult | null>(null);
  const header = <PageHeader title={t('Enregistrer mon arrivée')} back={{ to: '/gardes?onglet=mes-presences', label: t('Mes présences') }} />;

  if (result) return (<>{header}<Confirmation result={result} /></>);
  if (!token) return (<>{header}<ErrorState message={t('Lien de QR code incomplet. Scannez de nouveau le QR code de la classe.')} /></>);
  if (resolution.isPending) return (<>{header}<LoadingState label={t('Vérification du QR code')} variant="detail" /></>);
  if (resolution.error) {
    return (
      <>
        {header}
        <ErrorState message={resolution.error instanceof ApiError ? resolution.error.message : t('QR code illisible.')} />
      </>
    );
  }

  const { class: schoolClass, attendance, preview } = resolution.data;
  if (attendance) return (<>{header}<Confirmation result={{ created: false, attendance, match: { kind: 'NONE' } }} /></>);

  const message = previewMessage(preview);
  const error = arrive.error instanceof ApiError ? arrive.error.message : arrive.error ? t('L’arrivée n’a pas pu être enregistrée. Réessayez.') : null;
  return (
    <>
      {header}
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 2, maxWidth: layout.readable }}>
        <Box sx={{ display: 'grid', gap: 0.5 }}>
          <Typography component="h2" variant="h6">{schoolClass.name}</Typography>
          {schoolClass.room && (
            <Typography variant="body2" color="text.secondary" sx={{ display: 'inline-flex', gap: 0.5, alignItems: 'center' }}>
              <MapPin size={icon.sm} aria-hidden="true" /> {schoolClass.room}
            </Typography>
          )}
        </Box>
        {/* Information statique : pas de rôle « alert » (annonce assertive) pour un simple aperçu. */}
        <Alert severity={message.severity} role="note">{message.text}</Alert>
        {error && <Alert severity="error" role="alert">{error}</Alert>}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <Button
            variant="contained"
            size="large"
            startIcon={<DoorOpen size={icon.md} aria-hidden="true" />}
            loading={arrive.isPending}
            onClick={() => arrive.mutate(token, { onSuccess: setResult })}
            sx={{ minHeight: 48 }}
          >
            {t('Enregistrer mon arrivée')}
          </Button>
          {profile.data?.isSupervisor && (
            <Button component={RouterLink} to={`/gardes/presence?c=${encodeURIComponent(token)}&as=surveillant`}>
              {t('Je suis ici en tant que surveillant')}
            </Button>
          )}
        </Box>
        <Typography variant="caption" color="text.secondary">
          {t('Heure actuelle du serveur : {time}', { time: formatTime(new Date()) })}
        </Typography>
      </Paper>
    </>
  );
}
