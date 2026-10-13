import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { CloudOff, RefreshCw } from 'lucide-react';
import { ApiError } from '../../api/client';
import { formatDateTime } from '../../components/format';
import { font, icon, tokensOf } from '../../design/tokens';
import { useOutbox } from './useOutbox';

/** Demandes non envoyées, conservées sur l'appareil : « Réessayer » ou « Abandonner ». */
export function OutboxPanel() {
  const { entries, retry, abandon } = useOutbox();
  if (entries.length === 0) return null;

  const retryError = retry.error instanceof ApiError ? retry.error.message : null;

  return (
    <Box
      role="region"
      aria-label="Boîte d’envoi"
      sx={(theme) => ({
        mb: 3,
        p: 2,
        borderRadius: 1.5,
        border: `1px solid ${tokensOf(theme).warning.border}`,
        bgcolor: tokensOf(theme).warning.soft,
        color: tokensOf(theme).warning.text,
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Box component="span" sx={(theme) => ({ display: 'flex', color: tokensOf(theme).warning.main })}>
          <CloudOff size={icon.md} aria-hidden="true" />
        </Box>
        <Typography component="h2" variant="subtitle2" sx={{ color: 'inherit' }}>
          Boîte d’envoi : {entries.length} envoi{entries.length > 1 ? 's' : ''} en attente
        </Typography>
      </Box>
      {retryError && (
        <Typography variant="body2" sx={{ mb: 1, color: 'inherit' }}>
          {retryError}
        </Typography>
      )}
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
        {entries.map((entry) => (
          <Box
            component="li"
            key={entry.id}
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 1.5,
              p: 1.5,
              borderRadius: 1,
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
            }}
          >
            <Box sx={{ minWidth: 0, flex: '1 1 180px' }}>
              <Typography variant="body2" sx={{ fontWeight: font.medium, color: 'text.primary', overflowWrap: 'anywhere' }}>
                {entry.type === 'message' ? `Message : ${entry.payload.text ?? 'message vocal'}` : entry.payload.title}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                {entry.type === 'message' ? `Demande « ${entry.requestTitle} »` : entry.categoryName} · enregistré le {formatDateTime(entry.savedAt)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<RefreshCw size={icon.sm} aria-hidden="true" />}
                onClick={() => retry.mutate(entry)}
                loading={retry.isPending && retry.variables?.id === entry.id}
              >
                Réessayer
              </Button>
              <Button size="small" onClick={() => abandon.mutate(entry)}>
                Abandonner
              </Button>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
