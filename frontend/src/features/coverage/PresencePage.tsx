import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { DoorOpen, MapPin } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router';
import { ApiError } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { icon, layout } from '../../design/tokens';
import { resolveQr, useCoverage, useCoverageAction, useCoverageProfile, useDeclareEmptyClass } from './api';
import { outcomeMessage } from './EmptyClassPage';
import { CameraCapture, type CapturedPhoto } from './CameraCapture';
import { CoverageStatusBadge } from './labels';
import type { CoverageDetail, EmptyClassResult, SchoolClass } from './types';
import { t } from '../../i18n';

/**
 * Page ouverte par le QR code de la classe (appareil photo natif du téléphone). L'ouverture ne valide
 * JAMAIS la présence : elle affiche la classe, demande la photo si la catégorie l'exige, puis la
 * présence est confirmée par un envoi explicite que le serveur revérifie (signature, version du QR,
 * classe, preneur de la garde).
 */
export function PresencePage() {
  const [params] = useSearchParams();
  const token = params.get('c') ?? '';
  // La déclaration invalide la résolution du QR (l'affectation créée devient « ma garde ») : le résultat
  // est gardé ici pour rester affiché au lieu de basculer sur « Confirmer ma présence ».
  // La mutation vit aussi ici : le rafraîchissement qui suit démonte l'enfant avant son `onSuccess`.
  const declare = useDeclareEmptyClass();
  const [declared, setDeclared] = useState<{ value: EmptyClassResult; className: string } | null>(null);
  const resolution = useQuery({
    queryKey: ['coverage', 'presence', token],
    queryFn: () => resolveQr(token),
    enabled: Boolean(token),
    retry: false,
    staleTime: 0,
  });
  const header = <PageHeader title={t('Confirmer ma présence')} back={{ to: '/gardes?onglet=mes-affectations', label: t('Mes affectations') }} />;

  if (declared) return (<>{header}<DeclaredResult value={declared.value} className={declared.className} /></>);
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
  const { class: schoolClass, coverage, otherClassGuard } = resolution.data;
  if (!coverage) {
    return (
      <>
        {header}
        <DeclareEmptyFromQr schoolClass={schoolClass} token={token} otherClassGuard={otherClassGuard} declare={declare} onDeclared={(value) => setDeclared({ value, className: schoolClass.name })} />
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

  if (detail.isPending) return <LoadingState label={t('Chargement de votre garde')} variant="detail" />;
  if (detail.error) return <ErrorState message={t('Impossible de charger votre garde.')} />;
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
          toast.success(t('Présence confirmée en classe {name}.', { name: d.class.name }));
          navigate('/gardes?onglet=mes-affectations', { replace: true });
        },
        onError: (e) => setError(e instanceof ApiError ? e.message : t('La présence n’a pas pu être confirmée. Réessayez.')),
      },
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 2.5, maxWidth: layout.readable }}>
      <Box sx={{ display: 'grid', gap: 1 }}>
        <Typography component="h2" variant="h6">
          {t('Confirmer ma présence en classe {name}', { name: d.class.name })}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          {d.class.room && (
            <Typography variant="body2" color="text.secondary" sx={{ display: 'inline-flex', gap: 0.5, alignItems: 'center' }}>
              <MapPin size={icon.sm} aria-hidden="true" /> {d.class.room}
            </Typography>
          )}
          <CoverageStatusBadge mainStatus={d.mainStatus} subState={d.subState} />
        </Box>
      </Box>
      {!canConfirm ? (
        <Alert severity="info">{t('La présence ne peut plus être confirmée pour cette garde.')}</Alert>
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
            {t('Confirmer ma présence')}
          </Button>
          <Typography variant="caption" color="text.secondary">
            {t('L’heure enregistrée est celle du serveur au moment de la confirmation.')}
          </Typography>
        </>
      )}
      <Box>
        <Button component={RouterLink} to={`/gardes/${d.id}`} size="small">
          {t('Voir la garde')}
        </Button>
      </Box>
    </Paper>
  );
}

/**
 * Classe scannée sans garde en cours : « Déclarer cette classe vide » en un seul geste. Le QR prouve
 * la présence devant la classe (R10) ; l'ouverture de la page n'enregistre rien, seul ce bouton envoie.
 */
function DeclareEmptyFromQr({ schoolClass, token, otherClassGuard, declare, onDeclared }: { schoolClass: Pick<SchoolClass, 'id' | 'name' | 'room'>; token: string; otherClassGuard: boolean; declare: ReturnType<typeof useDeclareEmptyClass>; onDeclared: (value: EmptyClassResult) => void }) {
  const profile = useCoverageProfile();
  const clientId = useRef(crypto.randomUUID());

  if (profile.isPending) return <LoadingState label={t('Chargement de la classe')} variant="detail" />;
  const canDeclare = profile.data?.capabilities?.declareEmptyClass ?? profile.data?.isSupervisor ?? false;

  const error = declare.error instanceof ApiError ? declare.error.message : declare.error ? t('Déclaration impossible. Réessayez.') : null;
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 2, maxWidth: layout.readable }}>
      <Box sx={{ display: 'grid', gap: 0.5 }}>
        <Typography component="h2" variant="h6">
          {schoolClass.name}
        </Typography>
        {schoolClass.room && (
          <Typography variant="body2" color="text.secondary" sx={{ display: 'inline-flex', gap: 0.5, alignItems: 'center' }}>
            <MapPin size={icon.sm} aria-hidden="true" /> {schoolClass.room}
          </Typography>
        )}
      </Box>
      {otherClassGuard && (
        <Alert severity="info">{t('Ce QR code correspond à la classe {name}, qui n’est pas celle de votre garde.', { name: schoolClass.name })}</Alert>
      )}
      {canDeclare ? (
        <>
          <Typography>{t('Cette classe est sans enseignant ? Déclarez-la : l’affectation est à votre nom et l’admin est prévenue tout de suite.')}</Typography>
          {error && <Alert severity="error" role="alert">{error}</Alert>}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<DoorOpen size={icon.md} aria-hidden="true" />}
              loading={declare.isPending}
              onClick={() =>
                declare.mutate(
                  { clientId: clientId.current, classId: schoolClass.id, teacherId: null, qrToken: token },
                  { onSuccess: onDeclared },
                )
              }
              sx={{ minHeight: 48 }}
            >
              {t('Déclarer cette classe vide')}
            </Button>
            <Button component={RouterLink} to={`/gardes/classe-vide?classe=${encodeURIComponent(schoolClass.id)}&c=${encodeURIComponent(token)}`}>
              {t('Préciser l’enseignant')}
            </Button>
          </Box>
        </>
      ) : (
        !otherClassGuard && <Alert severity="info">{t('Vous n’avez pas de garde en cours pour la classe {name}.', { name: schoolClass.name })}</Alert>
      )}
    </Paper>
  );
}

/** Résultat de la déclaration (mêmes messages que le formulaire complet). */
function DeclaredResult({ value, className }: { value: EmptyClassResult; className: string }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 2, maxWidth: layout.readable }}>
      <Alert severity={value.outcome === 'ALREADY_ASSIGNED' || value.outcome === 'SUPPORT' ? 'info' : 'success'} role="status">
        {outcomeMessage(value, className)}
      </Alert>
      {value.doubleAssignment && (
        <Alert severity="warning">{t('Vous aviez déjà une affectation en cours : l’admin est alertée et réassignera l’une des deux.')}</Alert>
      )}
      {value.coverage && (
        <Box>
          <Button component={RouterLink} to={`/gardes/${value.coverage.id}`} variant="contained">
            {t('Voir l’affectation')}
          </Button>
        </Box>
      )}
    </Paper>
  );
}
