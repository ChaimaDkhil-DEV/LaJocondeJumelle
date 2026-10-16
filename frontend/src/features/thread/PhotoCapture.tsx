import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { Camera, Images, X } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { ApiError } from '../../api/client';
import { uploadFile } from '../../api/uploads';
import { IconAction } from '../../components/IconAction';
import { LoadingState } from '../../components/LoadingState';
import { icon } from '../../design/tokens';
import { FilePickerButton } from './FilePickerButton';

export interface UploadedPhoto {
  id: string;
  previewUrl: string;
}

interface PhotoCaptureProps {
  value: UploadedPhoto[];
  onChange: (photos: UploadedPhoto[]) => void;
  /** Rattache directement la photo à une demande (sinon fichier provisoire). */
  requestId?: string;
  max?: number;
  /** Début du texte alternatif des aperçus (« Photo de preuve 1 »). */
  altPrefix?: string;
  /** Demande en lecture seule : ni prise de photo ni galerie. */
  disabled?: boolean;
}

/**
 * Prise de photo (appareil) ou choix dans la galerie, téléversement immédiat (kind=PHOTO).
 * Le serveur retire les métadonnées (dont la position GPS) et refuse les formats non acceptés.
 */
export function PhotoCapture({ value, onChange, requestId, max = 5, altPrefix = 'Photo de preuve', disabled = false }: PhotoCaptureProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const uploaded = await uploadFile('PHOTO', file, file.name, requestId);
      onChange([...value, { id: uploaded.id, previewUrl: URL.createObjectURL(file) }]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'La photo n’a pas pu être envoyée. Réessayez.');
    } finally {
      setUploading(false);
    }
  }

  function remove(index: number): void {
    URL.revokeObjectURL(value[index].previewUrl);
    onChange(value.filter((_, i) => i !== index));
  }

  const full = value.length >= max;

  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <FilePickerButton
          label="Prendre une photo"
          icon={<Camera size={icon.md} aria-hidden="true" />}
          accept="image/*"
          capture="environment"
          disabled={disabled || full || uploading}
          onChange={(e) => void handleFile(e)}
        />
        <FilePickerButton
          label="Choisir dans la galerie"
          icon={<Images size={icon.md} aria-hidden="true" />}
          accept="image/*"
          disabled={disabled || full || uploading}
          onChange={(e) => void handleFile(e)}
        />
      </Box>
      {uploading && <LoadingState label="Envoi de la photo…" variant="inline" />}
      {error && <Alert severity="error">{error}</Alert>}
      {value.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {value.map((photo, index) => (
            <Box key={photo.id} sx={{ position: 'relative' }}>
              <Box
                component="img"
                src={photo.previewUrl}
                alt={`${altPrefix} ${index + 1}`}
                sx={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 1, display: 'block', border: 1, borderColor: 'divider' }}
              />
              <IconAction
                icon={X}
                size="small"
                label={`Retirer la photo ${index + 1}`}
                tooltip="Retirer"
                onClick={() => remove(index)}
                sx={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  bgcolor: 'background.paper',
                  border: 1,
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'background.paper' },
                }}
              />
            </Box>
          ))}
        </Box>
      )}
    </Stack>
  );
}
