import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { DoorOpen, LogOut, MapPin, Undo2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
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
import { useArrive, useComeBack, useDepart, useResolveArrival } from './api';
import { attendanceNotes, STATUS_COLORS, STATUS_LABELS } from './labels';
import type { ArrivalMatch, ArrivalResult, OwnPresence, PresenceResult } from './types';

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

const errorText = (error: unknown, fallback: string): string | null => (error instanceof ApiError ? error.message : error ? fallback : null);

function MyAttendanceLink() {
  return (
    <Button component={RouterLink} to="/gardes?onglet=mes-presences" variant="outlined">
      {t('Mes présences')}
    </Button>
  );
}

/** Pointage de la classe ; `actions` : ce que le scan permet encore (départ, retour). */
function Confirmation({ result, actions, error }: { result: ArrivalResult; actions?: ReactNode; error?: string | null }) {
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
      {error && <Alert severity="error" role="alert">{error}</Alert>}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {actions}
        {actions ? <MyAttendanceLink /> : (
          <Button component={RouterLink} to="/gardes?onglet=mes-presences" variant="contained">
            {t('Mes présences')}
          </Button>
        )}
      </Box>
    </Paper>
  );
}

/** Résultat d'un départ ou d'un retour (019) : gardé dans la page, comme celui de l'arrivée. */
function Movement({ kind, result }: { kind: 'depart' | 'return'; result: PresenceResult }) {
  const { presence, created } = result;
  const message =
    kind === 'depart'
      ? created
        ? t('Votre départ est enregistré.')
        : t('Votre départ était déjà enregistré.')
      : t('Votre retour est enregistré.');
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 2, maxWidth: layout.readable }}>
      <Alert severity="success" role="status">{message}</Alert>
      {kind === 'depart' && presence.departedAt && (
        <Typography>{t('Heure du départ : {time}', { time: formatTime(presence.departedAt) })}</Typography>
      )}
      <Typography variant="body2" color="text.secondary">
        {kind === 'depart'
          ? t('Vous n’êtes plus compté(e) parmi les enseignants présents. Si vous revenez, scannez de nouveau le QR code d’une classe.')
          : t('Vous êtes de nouveau compté(e) parmi les enseignants présents.')}
      </Typography>
      <Box><MyAttendanceLink /></Box>
    </Paper>
  );
}

/**
 * Page ouverte par le QR code de la classe pour un enseignant. L'ouverture n'enregistre rien : la classe
 * s'affiche, puis un appui enregistre l'arrivée (identité de la session, heure du serveur). Le résultat
 * est gardé dans la page : le rafraîchissement qui suit l'enregistrement ne doit pas le remplacer.
 *
 * Second scan (019) : un enseignant déjà arrivé peut enregistrer son départ de l'établissement ; parti, il
 * peut enregistrer son retour. L'arrivée dans une autre classe après un départ vaut retour.
 */
export function ArrivalPage() {
  const [params] = useSearchParams();
  const token = params.get('c') ?? '';
  const resolution = useResolveArrival(token);
  const profile = useCoverageProfile();
  const arrive = useArrive();
  const depart = useDepart();
  const comeBack = useComeBack();
  const [result, setResult] = useState<ArrivalResult | null>(null);
  const [moved, setMoved] = useState<{ kind: 'depart' | 'return'; result: PresenceResult } | null>(null);
  const back = { to: '/gardes?onglet=mes-presences', label: t('Mes présences') };
  const header = <PageHeader title={t('Enregistrer mon arrivée')} back={back} />;
  // Second scan (départ, retour) : le titre ne parle plus d'arrivée.
  const presenceHeader = <PageHeader title={t('Ma présence dans l’établissement')} back={back} />;

  if (moved) return (<>{presenceHeader}<Movement {...moved} /></>);
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
  const presence: OwnPresence = resolution.data.presence;
  const departButton = (
    <Button
      variant={attendance ? 'contained' : 'outlined'}
      size="large"
      startIcon={<LogOut size={icon.md} aria-hidden="true" />}
      loading={depart.isPending}
      onClick={() => depart.mutate(token, { onSuccess: (r) => setMoved({ kind: 'depart', result: r }) })}
      sx={{ minHeight: 48 }}
    >
      {t('Enregistrer mon départ')}
    </Button>
  );
  const departError = errorText(depart.error, t('Le départ n’a pas pu être enregistré. Réessayez.'));

  // Déjà pointé dans cette classe aujourd'hui : le scan sert au départ, ou au retour après un départ.
  if (attendance) {
    const existing: ArrivalResult = { created: false, attendance, match: { kind: 'NONE' } };
    if (presence.state === 'DEPARTED') {
      const returnError = errorText(comeBack.error, t('Le retour n’a pas pu être enregistré. Réessayez.'));
      return (
        <>
          {presenceHeader}
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 2, maxWidth: layout.readable }}>
            <Typography component="h2" variant="h6">{schoolClass.name}</Typography>
            <Alert severity="info" role="note">
              {presence.departedAt
                ? t('Votre départ est enregistré depuis {time}.', { time: formatTime(presence.departedAt) })
                : t('Votre départ est enregistré.')}
            </Alert>
            {returnError && <Alert severity="error" role="alert">{returnError}</Alert>}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Button
                variant="contained"
                size="large"
                startIcon={<Undo2 size={icon.md} aria-hidden="true" />}
                loading={comeBack.isPending}
                onClick={() => comeBack.mutate(token, { onSuccess: (r) => setMoved({ kind: 'return', result: r }) })}
                sx={{ minHeight: 48 }}
              >
                {t('Enregistrer mon retour')}
              </Button>
              <MyAttendanceLink />
            </Box>
          </Paper>
        </>
      );
    }
    return (<>{presenceHeader}<Confirmation result={existing} actions={departButton} error={departError} /></>);
  }

  const message = previewMessage(preview);
  const error = errorText(arrive.error, t('L’arrivée n’a pas pu être enregistrée. Réessayez.')) ?? departError;
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
        {presence.state === 'DEPARTED' && (
          <Alert severity="info" role="note">
            {t('Votre départ est enregistré : votre arrivée dans cette classe vaudra retour dans l’établissement.')}
          </Alert>
        )}
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
          {/* Déjà présent, arrivé par une autre classe : ce QR peut aussi servir à partir. */}
          {presence.state === 'PRESENT' && departButton}
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
