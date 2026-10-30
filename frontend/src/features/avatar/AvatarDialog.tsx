import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import { ImageUp, RotateCcw, ZoomIn } from 'lucide-react';
import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { ApiError } from '../../api/client';
import { useAvatarUrl } from '../../api/avatars';
import { illustrationUri } from '../../components/avatarIllustration';
import { useToast } from '../../components/Toast';
import { UserAvatar } from '../../components/UserAvatar';
import { font, fontSize, icon, tokensOf } from '../../design/tokens';
import { resetAvatar, uploadAvatar } from './avatarApi';
import { centeredCrop, clampCrop, MAX_ZOOM, MIN_ZOOM, renderCrop, renderUri, validateFile, zoomCrop, type Crop } from './cropImage';

/** Côté de la zone de recadrage affichée, en px. */
const VIEW = 240;
/** Avatars prédéfinis de la galerie : dessins DiceBear tirés de graines fixes. */
const PRESETS = ['Lumière', 'Craie', 'Cartable', 'Récré', 'Compas', 'Atlas', 'Encre', 'Préau'];

type Pending =
  | { kind: 'none' }
  | { kind: 'file'; url: string; image: HTMLImageElement; crop: Crop }
  | { kind: 'preset'; seed: string }
  | { kind: 'reset' };

interface AvatarDialogProps {
  open: boolean;
  /** Compte dont on change la photo (soi-même, ou un autre pour un super administrateur ou un admin). */
  user: { id: string; displayName: string };
  onClose: () => void;
}

/** Image chargée depuis un fichier local ; rejet si le navigateur ne sait pas la lire. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('illisible'));
    image.src = url;
  });
}

/**
 * « Changer la photo » : aperçu, envoi d'une photo (bouton ou glisser-déposer) avec recadrage
 * rond et zoom, galerie d'avatars prédéfinis, retour à l'avatar par défaut. Rien n'est envoyé
 * avant « Enregistrer » ; formats et poids sont vérifiés ici puis par le serveur.
 */
export function AvatarDialog({ open, user, onClose }: AvatarDialogProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const current = useAvatarUrl(user.id);
  const [pending, setPending] = useState<Pending>({ kind: 'none' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null);

  // L'adresse locale de la photo choisie est libérée quand elle n'est plus affichée.
  useEffect(() => {
    if (pending.kind !== 'file') return;
    return () => URL.revokeObjectURL(pending.url);
  }, [pending]);

  function close(): void {
    if (saving) return;
    setPending({ kind: 'none' });
    setError(null);
    onClose();
  }

  async function choose(file: File | undefined): Promise<void> {
    if (!file) return;
    const refused = validateFile(file);
    if (refused) {
      setError(refused);
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      setError(null);
      setPending({ kind: 'file', url, image, crop: centeredCrop(image.naturalWidth, image.naturalHeight, VIEW) });
    } catch {
      URL.revokeObjectURL(url);
      setError('Cette image est illisible ou endommagée. Choisissez une autre photo.');
    }
  }

  function updateCrop(next: (crop: Crop, image: HTMLImageElement) => Crop): void {
    setPending((p) => (p.kind === 'file' ? { ...p, crop: next(p.crop, p.image) } : p));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (pending.kind !== 'file') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, crop: pending.crop };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const start = drag.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    updateCrop((_, image) => clampCrop({ ...start.crop, x: start.crop.x + dx, y: start.crop.y + dy }, image.naturalWidth, image.naturalHeight, VIEW));
  }

  /** Clavier : flèches pour déplacer, + et − pour zoomer. */
  function onCropKey(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      updateCrop((crop, image) => clampCrop({ ...crop, x: crop.x + dx, y: crop.y + dy }, image.naturalWidth, image.naturalHeight, VIEW));
    } else if (event.key === '+' || event.key === '-') {
      event.preventDefault();
      updateCrop((crop, image) => zoomCrop(crop, crop.zoom + (event.key === '+' ? 0.1 : -0.1), image.naturalWidth, image.naturalHeight, VIEW));
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragOver(false);
    void choose(event.dataTransfer.files[0]);
  }

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      if (pending.kind === 'reset') {
        await resetAvatar(user.id);
        toast.success('Avatar par défaut rétabli.');
      } else if (pending.kind === 'file' || pending.kind === 'preset') {
        const image = pending.kind === 'file' ? await renderCrop(pending.image, pending.crop, VIEW) : await renderUri(illustrationUri(pending.seed));
        await uploadAvatar(user.id, image);
        toast.success('Photo mise à jour.');
      }
      setPending({ kind: 'none' });
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : caught instanceof Error && caught.message.startsWith('Votre navigateur') ? caught.message : 'La photo n’a pas pu être enregistrée. Réessayez.');
    } finally {
      setSaving(false);
    }
  }

  // Aperçu : choix en attente, sinon avatar actuel.
  const previewSrc = pending.kind === 'preset' ? illustrationUri(pending.seed) : pending.kind === 'reset' ? null : undefined;
  const hasCustom = Boolean(current);

  return (
    <Dialog open={open} onClose={close} aria-labelledby={titleId} fullWidth maxWidth="sm">
      <DialogTitle id={titleId}>Changer la photo</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2.5 }}>
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}

        {pending.kind === 'file' ? (
          <Box sx={{ display: 'grid', justifyItems: 'center', gap: 1.5 }}>
            {/* Zone de recadrage : glisser (souris, toucher) ou flèches ; cercle = partie conservée. */}
            <Box
              role="group"
              aria-label="Recadrage de la photo : glissez ou utilisez les flèches pour déplacer, + et − pour zoomer"
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={onCropKey}
              sx={(theme) => ({
                position: 'relative',
                width: VIEW,
                height: VIEW,
                overflow: 'hidden',
                borderRadius: '12px',
                cursor: 'grab',
                touchAction: 'none',
                bgcolor: tokensOf(theme).surfaceMuted,
                '&:active': { cursor: 'grabbing' },
                '&:focus-visible': { outline: `2px solid ${tokensOf(theme).focus}`, outlineOffset: 2 },
              })}
            >
              <Box
                component="img"
                src={pending.url}
                alt=""
                draggable={false}
                sx={{
                  position: 'absolute',
                  left: pending.crop.x,
                  top: pending.crop.y,
                  width: pending.image.naturalWidth * (VIEW / Math.min(pending.image.naturalWidth, pending.image.naturalHeight)) * pending.crop.zoom,
                  maxWidth: 'none',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              />
              <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: '0 0 0 9999px rgba(15, 15, 17, 0.55)', pointerEvents: 'none' }} />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: VIEW }}>
              <ZoomIn size={icon.sm} aria-hidden="true" />
              <Slider
                size="small"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.05}
                value={pending.crop.zoom}
                aria-label="Zoom"
                getAriaValueText={(v) => `${Math.round(v * 100)} %`}
                onChange={(_e, value) => updateCrop((crop, image) => zoomCrop(crop, value as number, image.naturalWidth, image.naturalHeight, VIEW))}
              />
            </Box>
            <Button size="small" onClick={() => inputRef.current?.click()}>
              Choisir une autre photo
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2.5 }}>
            <UserAvatar user={user} size={96} src={previewSrc} labelled />
            <Box
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              sx={(theme) => {
                const t = tokensOf(theme);
                return {
                  flex: '1 1 220px',
                  display: 'grid',
                  justifyItems: 'start',
                  gap: 1,
                  p: 2,
                  borderRadius: '12px',
                  border: `1.5px dashed ${dragOver ? t.accent.main : t.borderStrong}`,
                  bgcolor: dragOver ? t.accent.soft : 'transparent',
                  transition: 'background-color 150ms, border-color 150ms',
                };
              }}
            >
              <Button variant="outlined" startIcon={<ImageUp size={icon.sm} aria-hidden="true" />} onClick={() => inputRef.current?.click()}>
                Téléverser une photo
              </Button>
              <Typography variant="body2" color="text.secondary">
                ou glissez-la ici. JPG, PNG ou WebP, 2 Mo maximum.
              </Typography>
            </Box>
          </Box>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          aria-label="Photo de profil"
          onChange={(e) => {
            void choose(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <Box component="fieldset" sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
          <Typography component="legend" sx={{ fontSize: fontSize.sm, fontWeight: font.medium, mb: 1 }}>
            Ou choisissez un avatar
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {PRESETS.map((seed) => {
              const selected = pending.kind === 'preset' && pending.seed === seed;
              return (
                <ButtonBase
                  key={seed}
                  aria-pressed={selected}
                  aria-label={`Avatar « ${seed} »`}
                  onClick={() => {
                    setError(null);
                    setPending(selected ? { kind: 'none' } : { kind: 'preset', seed });
                  }}
                  sx={(theme) => ({
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    border: `2px solid ${selected ? tokensOf(theme).accent.main : 'transparent'}`,
                    '&.Mui-focusVisible': { outline: `2px solid ${tokensOf(theme).focus}`, outlineOffset: 2 },
                  })}
                >
                  <Box component="img" src={illustrationUri(seed)} alt="" width={44} height={44} sx={{ borderRadius: '50%', display: 'block' }} />
                </ButtonBase>
              );
            })}
          </Box>
        </Box>

        {(hasCustom || pending.kind !== 'none') && (
          <Box>
            <Button
              size="small"
              color="inherit"
              startIcon={<RotateCcw size={icon.sm} aria-hidden="true" />}
              aria-pressed={pending.kind === 'reset'}
              onClick={() => {
                setError(null);
                setPending(hasCustom ? { kind: 'reset' } : { kind: 'none' });
              }}
              sx={(theme) => ({ color: tokensOf(theme).textSecondary })}
            >
              Rétablir l’avatar par défaut
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={saving}>
          Annuler
        </Button>
        <Button variant="contained" loading={saving} disabled={pending.kind === 'none'} onClick={() => void save()}>
          Enregistrer
        </Button>
      </DialogActions>
    </Dialog>
  );
}
