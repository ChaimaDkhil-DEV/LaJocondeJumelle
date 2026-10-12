import CloseIcon from '@mui/icons-material/Close';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import { useState, type ChangeEvent } from 'react';
import { ApiError, apiFetch } from '../../api/client';
import { LoadingState } from '../../components/LoadingState';
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
}

/**
 * Prise de photo (appareil) ou choix dans la galerie, téléversement immédiat (kind=PHOTO).
 * Le serveur retire les métadonnées (dont la position GPS) et refuse les formats non acceptés.
 */
export function PhotoCapture({ value, onChange, requestId, max = 5 }: PhotoCaptureProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('kind', 'PHOTO');
      if (requestId) form.append('requestId', requestId);
      form.append('file', file, file.name);
      const uploaded = await apiFetch<{ id: string }>('/api/files', { method: 'POST', body: form });
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
          icon={<PhotoCameraIcon aria-hidden="true" />}
          accept="image/*"
          capture="environment"
          disabled={full || uploading}
          onChange={(e) => void handleFile(e)}
        />
        <FilePickerButton
          label="Choisir dans la galerie"
          icon={<PhotoLibraryIcon aria-hidden="true" />}
          accept="image/*"
          disabled={full || uploading}
          onChange={(e) => void handleFile(e)}
        />
      </Box>
      {uploading && <LoadingState label="Envoi de la photo…" />}
      {error && <Alert severity="error">{error}</Alert>}
      {value.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {value.map((photo, index) => (
            <Box key={photo.id} sx={{ position: 'relative' }}>
              <Box
                component="img"
                src={photo.previewUrl}
                alt={`Photo de preuve ${index + 1}`}
                sx={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 1, display: 'block' }}
              />
              <IconButton
                size="small"
                aria-label={`Retirer la photo ${index + 1}`}
                onClick={() => remove(index)}
                sx={{ position: 'absolute', top: 0, right: 0, bgcolor: 'background.paper' }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}
    </Stack>
  );
}
