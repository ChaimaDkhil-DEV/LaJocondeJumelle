import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import jsQR from 'jsqr';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { t } from '../../i18n';
import { tokenFromScan } from './qrToken';

interface QrScannerDialogProps {
  /** Reçoit le jeton du QR de la classe ; la page de confirmation le revérifie côté serveur. */
  onToken: (token: string) => void;
  onClose: () => void;
}

/**
 * Lecteur de QR code intégré (caméra arrière). La caméra n'est qu'une commodité : sans elle (refus,
 * appareil sans caméra, lecteur d'écran), on colle le lien ou le code du QR code. Le scan n'enregistre
 * rien : il ouvre la page de confirmation de la classe.
 */
export function QrScannerDialog({ onToken, onClose }: QrScannerDialogProps) {
  const titleId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [notAClass, setNotAClass] = useState(false);
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let frame = 0;
    let cancelled = false;
    let found = false;
    const canvas = document.createElement('canvas');

    async function start(): Promise<void> {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(t('La caméra n’est pas disponible sur cet appareil : collez le lien ou le code du QR code ci-dessous.'));
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch {
        setCameraError(t('L’accès à la caméra n’est pas autorisé : collez le lien ou le code du QR code ci-dessous.'));
        return;
      }
      const video = videoRef.current;
      if (cancelled || !video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      const tick = (): void => {
        if (cancelled || found) return;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (context) {
            context.drawImage(video, 0, 0);
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
            if (code) {
              const token = tokenFromScan(code.data);
              if (token) {
                found = true;
                onTokenRef.current(token);
                return;
              }
              setNotAClass(true);
            }
          }
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }

    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

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
        <Box component="form" noValidate onSubmit={submitManual} sx={{ display: 'grid', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('Sans caméra, collez le lien ou le code du QR code.')}
          </Typography>
          <TextField
            id="qr-code-saisi"
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Fermer')}</Button>
      </DialogActions>
    </Dialog>
  );
}
