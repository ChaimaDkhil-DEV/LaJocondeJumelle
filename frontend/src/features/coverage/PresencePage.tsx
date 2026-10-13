import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { DoorOpen, MapPin } from 'lucide-react';
import { useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router';
import { ApiError } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { icon, layout } from '../../design/tokens';
import { resolveQr, useCoverage, useCoverageAction } from './api';
import { CameraCapture, type CapturedPhoto } from './CameraCapture';
import { CoverageStatusBadge } from './labels';
import type { CoverageDetail } from './types';

/**
 * Page ouverte par le QR code de la classe (appareil photo natif du téléphone). L'ouverture ne valide
 * JAMAIS la présence : elle affiche la classe, demande la photo si la catégorie l'exige, puis la
 * présence est confirmée par un envoi explicite que le serveur revérifie (signature, version du QR,
 * classe, preneur de la garde).
 */
export function PresencePage() {
  const [params] = useSearchParams();
  const token = params.get('c') ?? '';
  const resolution = useQuery({
    queryKey: ['coverage', 'presence', token],
    queryFn: () => resolveQr(token),
    enabled: Boolean(token),
    retry: false,
    staleTime: 0,
  });
  const header = <PageHeader title="Confirmer ma présence" back={{ to: '/gardes?onglet=ma-garde', label: 'Ma garde' }} />;

  if (!token) return (<>{header}<ErrorState message="Lien de QR code incomplet. Scannez de nouveau le QR code de la classe." /></>);
  if (resolution.isPending) return (<>{header}<LoadingState label="Vérification du QR code" variant="detail" /></>);
  if (resolution.error) {
    return (
      <>
        {header}
        <ErrorState message={resolution.error instanceof ApiError ? resolution.error.message : 'QR code illisible.'} />
      </>
    );
  }
  const { class: schoolClass, coverage, otherClassGuard } = resolution.data;
  if (!coverage) {
    return (
      <>
        {header}
        <Alert severity="warning" sx={{ maxWidth: layout.readable }}>
          {otherClassGuard
            ? `Ce QR code correspond à la classe ${schoolClass.name}, qui n’est pas celle de votre garde.`
            : `Vous n’avez pas de garde en cours pour la classe ${schoolClass.name}.`}
        </Alert>
      </>
    );
  }
  return (
    <>
      {header}
      <ConfirmPresence coverageId={coverage.id} token={token} />
    </>
  );
}

function ConfirmPresence({ coverageId, token }: { coverageId: string; token: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const detail = useCoverage(coverageId);
  const action = useCoverageAction(coverageId);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (detail.isPending) return <LoadingState label="Chargement de votre garde" variant="detail" />;
  if (detail.error || detail.data.limited) return <ErrorState message="Impossible de charger votre garde." />;
  const d: CoverageDetail = detail.data;
  // Avant la présence : photo exigée sauf preuve « QR seul » ; pendant la garde, le QR suffit comme preuve supplémentaire.
  const onSite = d.status === 'ON_DUTY' || d.status === 'RELIEF_PENDING';
  const needsPhoto = !onSite && d.proofMode !== 'QR';
  const canConfirm = d.allowedActions.includes('CONFIRM_PRESENCE');

  function confirm(): void {
    setError(null);
    action.mutate(
      { action: 'CONFIRM_PRESENCE', version: d.version, qrToken: token, ...(photo ? { photoFileId: photo.id } : {}) },
      {
        onSuccess: () => {
          toast.success(`Présence confirmée en classe ${d.class.name}.`);
          navigate('/gardes?onglet=ma-garde', { replace: true });
        },
        onError: (e) => setError(e instanceof ApiError ? e.message : 'La présence n’a pas pu être confirmée. Réessayez.'),
      },
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 2.5, maxWidth: layout.readable }}>
      <Box sx={{ display: 'grid', gap: 1 }}>
        <Typography component="h2" variant="h6">
          Confirmer ma présence en classe {d.class.name}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          {d.class.room && (
            <Typography variant="body2" color="text.secondary" sx={{ display: 'inline-flex', gap: 0.5, alignItems: 'center' }}>
              <MapPin size={icon.sm} aria-hidden="true" /> {d.class.room}
            </Typography>
          )}
          <CoverageStatusBadge status={d.status} />
        </Box>
      </Box>
      {!canConfirm ? (
        <Alert severity="info">La présence ne peut plus être confirmée pour cette garde.</Alert>
      ) : (
        <>
          {needsPhoto && <CameraCapture value={photo} onChange={setPhoto} />}
          {error && <Alert severity="error">{error}</Alert>}
          <Button
            variant="contained"
            size="large"
            startIcon={<DoorOpen size={icon.md} aria-hidden="true" />}
            disabled={needsPhoto && !photo}
            loading={action.isPending}
            onClick={confirm}
            sx={{ minHeight: 48 }}
          >
            Confirmer ma présence
          </Button>
          <Typography variant="caption" color="text.secondary">
            L’heure enregistrée est celle du serveur au moment de la confirmation.
          </Typography>
        </>
      )}
      <Box>
        <Button component={RouterLink} to={`/gardes/${d.id}`} size="small">
          Voir la garde
        </Button>
      </Box>
    </Paper>
  );
}
