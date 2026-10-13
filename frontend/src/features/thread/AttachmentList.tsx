import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { Download, FileText } from 'lucide-react';
import { font, fontSize, icon, motion, tokensOf } from '../../design/tokens';
import type { Attachment } from './api';

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/** Pièces jointes d'un message : vignettes des photos (texte alternatif), fiches de téléchargement des documents. */
export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null;
  const photos = attachments.filter((a) => a.kind === 'PHOTO');
  const documents = attachments.filter((a) => a.kind !== 'PHOTO');

  return (
    <Box sx={{ display: 'grid', gap: 1, justifyItems: 'start' }}>
      {photos.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {photos.map((photo) => (
            <Link
              key={photo.fileId}
              href={`/api/files/${photo.fileId}`}
              target="_blank"
              rel="noopener"
              aria-label={`Ouvrir ${photo.originalName} en grand`}
              sx={{ display: 'block', borderRadius: 1, overflow: 'hidden', border: 1, borderColor: 'divider' }}
            >
              <Box
                component="img"
                src={`/api/files/${photo.fileId}`}
                alt={`Photo jointe : ${photo.originalName}`}
                sx={{ width: 112, height: 112, objectFit: 'cover', display: 'block' }}
              />
            </Link>
          ))}
        </Box>
      )}
      {documents.map((doc) => (
        <Link
          key={doc.fileId}
          href={`/api/files/${doc.fileId}`}
          underline="none"
          sx={(theme) => ({
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            maxWidth: '100%',
            minHeight: 40,
            px: 1.25,
            py: 0.75,
            borderRadius: 1,
            border: `1px solid ${tokensOf(theme).border}`,
            bgcolor: tokensOf(theme).surface,
            color: tokensOf(theme).text,
            fontSize: fontSize.sm,
            fontWeight: font.medium,
            transition: `background-color ${motion.fast}ms`,
            '&:hover': { bgcolor: tokensOf(theme).surfaceMuted },
          })}
        >
          <Box component="span" sx={{ display: 'flex', color: 'text.secondary' }}>
            <FileText size={icon.md} aria-hidden="true" />
          </Box>
          <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            Télécharger {doc.originalName}{' '}
            <Box component="span" sx={{ color: 'text.secondary', fontWeight: font.regular }}>
              ({formatSize(doc.sizeBytes)})
            </Box>
          </Box>
          <Box component="span" sx={{ display: 'flex', color: 'text.secondary' }}>
            <Download size={icon.sm} aria-hidden="true" />
          </Box>
        </Link>
      ))}
    </Box>
  );
}
