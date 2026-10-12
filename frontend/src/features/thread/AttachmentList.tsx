import DownloadIcon from '@mui/icons-material/Download';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import type { Attachment } from './api';

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/** Pièces jointes d'un message : miniatures des photos (texte alternatif), liens de téléchargement des documents. */
export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null;
  const photos = attachments.filter((a) => a.kind === 'PHOTO');
  const documents = attachments.filter((a) => a.kind !== 'PHOTO');

  return (
    <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {photos.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {photos.map((photo) => (
            <Link
              key={photo.fileId}
              href={`/api/files/${photo.fileId}`}
              target="_blank"
              rel="noopener"
              aria-label={`Ouvrir ${photo.originalName} en grand`}
            >
              <Box
                component="img"
                src={`/api/files/${photo.fileId}`}
                alt={`Photo jointe : ${photo.originalName}`}
                sx={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 1, display: 'block' }}
              />
            </Link>
          ))}
        </Box>
      )}
      {documents.map((doc) => (
        <Link
          key={doc.fileId}
          href={`/api/files/${doc.fileId}`}
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, overflowWrap: 'anywhere' }}
        >
          <DownloadIcon fontSize="small" aria-hidden="true" />
          Télécharger {doc.originalName} ({formatSize(doc.sizeBytes)})
        </Link>
      ))}
    </Box>
  );
}
