import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { t } from '../../i18n';
import { createQrReader, readQrPhoto, type QrReader } from './qrReader';
import { tokenFromScan } from './qrToken';

interface QrScannerDialogProps {
  /** Reçoit le jeton du QR de la classe ; la page de confirmation le revérifie côté serveur. */
  onToken: (token: string) => void;
  onClose: () => void;
}

/** Intervalle entre deux lectures de l'image de la caméra : assez court pour un scan immédiat, sans
 * occuper le téléphone en continu. */
const SCAN_INTERVAL_MS = 150;

/** Jeton du premier QR de classe parmi les textes lus ; null si aucun n'en est un. */
function firstClassToken(texts: string[]): string | null {
  for (const text of texts) {
    const token = tokenFromScan(text);
    if (token) return token;
  }
  return null;
}

/** Pourquoi la caméra ne peut pas s'ouvrir dans la page, avant même de la demander ; null si elle peut. */
function cameraUnavailable(): string | null {
  if (window.isSecureContext === false) {
    return t('La caméra ne s’ouvre que sur une adresse sécurisée (https) : prenez une photo du QR code, ou ouvrez l’application par son adresse https.');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return t('La caméra n’est pas disponible dans ce navigateur : prenez une photo du QR code, ou ouvrez le lien dans Safari ou Chrome.');
  }
  return null;
}

/** Message selon le refus de getUserMedia : la cause, puis la marche à suivre. */
function cameraErrorMessage(error: unknown): string {
  switch (error instanceof DOMException ? error.name : '') {
    case 'NotAllowedError':
    case 'SecurityError':
      return t('L’accès à la caméra est refusé : autorisez la caméra pour ce site dans les réglages du navigateur, ou prenez une photo du QR code.');
    case 'NotFoundError':
    case 'OverconstrainedError':
      return t('Aucune caméra n’a été trouvée sur cet appareil : choisissez une photo du QR code, ou collez son lien ou son code.');
    case 'NotReadableError':
    case 'AbortError':
      return t('La caméra est déjà utilisée par une autre application : fermez-la, puis rouvrez le scan, ou prenez une photo du QR code.');
    default:
      return t('La caméra n’a pas pu s’ouvrir : prenez une photo du QR code, ou collez son lien ou son code.');
  }
}

/**
 * Lecteur de QR code intégré (caméra arrière) : le QR est lu dans l'image, sans rien saisir. Sans caméra
 * dans la page (adresse http, refus, appareil sans caméra), un message dit pourquoi et quoi faire ; une photo
 * du QR code (appareil photo du téléphone) ou son lien collé prennent le relais. Le lecteur s'arrête au
 * premier QR de classe lu et passe son jeton à l'appelant, qui décide : pointage des enseignants (ouvre la
 * page de confirmation de la classe), déclaration d'une classe vide (envoyée aussitôt, 013).
 */
export function QrScannerDialog({ onToken, onClose }: QrScannerDialogProps) {
  const titleId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);
  /** Un seul jeton par ouverture, qu'il vienne de la caméra ou d'une photo. */
  const foundRef = useRef(false);
  const readerRef = useRef<Promise<QrReader> | null>(null);

  const [camera, setCamera] = useState<'starting' | 'on' | 'off'>('starting');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [notAClass, setNotAClass] = useState(false);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    if (manualOpen) fieldRef.current?.focus();
  }, [manualOpen]);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer = 0;
    let cancelled = false;

    async function start(): Promise<void> {
      const unavailable = cameraUnavailable();
      if (unavailable) {
        setCameraError(unavailable);
        setCamera('off');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (error) {
        if (!cancelled) {
          setCameraError(cameraErrorMessage(error));
          setCamera('off');
        }
        return;
      }
      const video = videoRef.current;
      if (cancelled || !video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      setCamera('on');
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const qrReader = await (readerRef.current ??= createQrReader());

      const tick = async (): Promise<void> => {
        if (cancelled || foundRef.current) return;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          const texts = await qrReader.read(video, video.videoWidth, video.videoHeight).catch((): string[] => []);
          if (cancelled || foundRef.current) return;
          const token = firstClassToken(texts);
          if (token) {
            foundRef.current = true;
            onTokenRef.current(token);
            return;
          }
          if (texts.length > 0) setNotAClass(true);
        }
        timer = window.setTimeout(() => void tick(), SCAN_INTERVAL_MS);
      };
      void tick();
    }

    void start();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function readPhoto(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoError(null);
    setNotAClass(false);
    setReadingPhoto(true);
    try {
      const texts = await readQrPhoto(file, await (readerRef.current ??= createQrReader()));
      if (foundRef.current) return;
      const token = firstClassToken(texts);
      if (token) {
        foundRef.current = true;
        onToken(token);
      } else if (texts.length > 0) setNotAClass(true);
      else setPhotoError(t('Aucun QR code n’a été trouvé sur la photo : reprenez-la de plus près, avec le QR code entier et net.'));
    } catch {
      setPhotoError(t('Cette photo n’a pas pu être lue : reprenez-la, ou collez le lien ou le code du QR code.'));
    } finally {
      setReadingPhoto(false);
    }
  }

  function submitManual(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const token = tokenFromScan(manual);
    if (!token) {
      setManualError(t('Ce lien ou ce code n’est pas celui d’un QR code de classe.'));
      return;
    }
    setManualError(null);
    onToken(token);
  }

  const showManual = camera === 'off' || manualOpen;

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="xs">
      <DialogTitle id={titleId}>{t('Scanner le QR code de la classe')}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        {cameraError ? (
          <Alert severity="info">{cameraError}</Alert>
        ) : (
          <Box sx={{ position: 'relative', borderRadius: 1.5, overflow: 'hidden', bgcolor: 'common.black', aspectRatio: '1 / 1' }}>
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label={t('Image de la caméra : placez le QR code de la classe dans le cadre')}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </Box>
        )}
        {notAClass && (
          <Alert severity="warning" role="status">
            {t('Ce QR code n’est pas celui d’une classe.')}
          </Alert>
        )}
        {readingPhoto && (
          <Typography variant="body2" role="status">
            {t('Lecture de la photo…')}
          </Typography>
        )}
        {photoError && (
          <Alert severity="warning" role="status">
            {photoError}
          </Alert>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Button
            variant={camera === 'off' ? 'contained' : 'outlined'}
            onClick={() => photoRef.current?.click()}
            disabled={readingPhoto}
          >
            {t('Prendre une photo du QR code')}
          </Button>
          <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void readPhoto(e)} />
          {camera === 'on' && (
            <Button variant="text" aria-expanded={manualOpen} onClick={() => setManualOpen((open) => !open)}>
              {t('Saisir le lien ou le code du QR code')}
            </Button>
          )}
        </Box>
        {showManual && (
          <Box component="form" noValidate onSubmit={submitManual} sx={{ display: 'grid', gap: 1 }}>
            <TextField
              id="qr-code-saisi"
              inputRef={fieldRef}
              label={t('Lien ou code du QR code')}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              error={Boolean(manualError)}
              helperText={manualError ?? undefined}
              size="small"
              slotProps={{ htmlInput: { maxLength: 300, autoComplete: 'off', spellCheck: false } }}
            />
            <Box>
              <Button type="submit" variant="outlined">
                {t('Continuer')}
              </Button>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Fermer')}</Button>
      </DialogActions>
    </Dialog>
  );
}
