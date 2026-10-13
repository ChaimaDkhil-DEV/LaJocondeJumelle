import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Camera, RotateCcw, ShieldAlert } from 'lucide-react';
import { useEffect, useState, type ChangeEvent } from 'react';
import { ApiError } from '../../api/client';
import { uploadFile } from '../../api/uploads';
import { LoadingState } from '../../components/LoadingState';
import { icon, tokensOf } from '../../design/tokens';
import { FilePickerButton } from '../thread/FilePickerButton';
import { compressImage } from './compressImage';

export interface CapturedPhoto {
  id: string;
  previewUrl: string;
}

/** Rappel de protection des élèves, affiché à chaque prise de photo de présence. */
export function ChildProtectionNotice() {
  return (
    <Box
      role="note"
      sx={(theme) => ({
        display: 'flex',
        gap: 1,
        p: 1.5,
        borderRadius: 1,
        border: `1px solid ${tokensOf(theme).warning.border}`,
        bgcolor: tokensOf(theme).warning.soft,
        color: tokensOf(theme).warning.text,
      })}
    >
      <ShieldAlert size={icon.md} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
      <Typography variant="body2" sx={{ color: 'inherit' }}>
        Photographiez la porte ou l’intérieur de la classe, évitez de cadrer les visages des enfants.
      </Typography>
    </Box>
  );
}

/**
 * Photo de présence : capture directe par l'appareil photo (pas de choix dans la galerie), compression
 * côté client, envoi immédiat en fichier provisoire. L'heure retenue est celle du serveur à la
 * confirmation, jamais celle de la photo.
 */
export function CameraCapture({ value, onChange }: { value: CapturedPhoto | null; onChange: (photo: CapturedPhoto | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (value) URL.revokeObjectURL(value.previewUrl);
  }, [value]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const { blob, name } = await compressImage(file);
      const uploaded = await uploadFile('PHOTO', blob, name);
      onChange({ id: uploaded.id, previewUrl: URL.createObjectURL(blob) });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'La photo n’a pas pu être envoyée. Réessayez.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Stack spacing={1.5}>
      <ChildProtectionNotice />
      {value && (
        <Box
          component="img"
          src={value.previewUrl}
          alt="Photo de présence en classe"
          sx={{ width: '100%', maxWidth: 320, aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 1, border: 1, borderColor: 'divider' }}
        />
      )}
      <Box>
        <FilePickerButton
          label={value ? 'Reprendre la photo' : 'Prendre la photo'}
          icon={value ? <RotateCcw size={icon.md} aria-hidden="true" /> : <Camera size={icon.md} aria-hidden="true" />}
          accept="image/*"
          capture="environment"
          disabled={uploading}
          onChange={(e) => void handleFile(e)}
        />
      </Box>
      {uploading && <LoadingState label="Envoi de la photo…" variant="inline" />}
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
