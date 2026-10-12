import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { ApiError } from '../../api/client';
import { formatDateTime } from '../../components/format';
import { useOutbox } from './useOutbox';

/** Demandes non envoyées, conservées sur l'appareil : « Réessayer » ou « Abandonner ». */
export function OutboxPanel() {
  const { entries, retry, abandon } = useOutbox();
  if (entries.length === 0) return null;

  const retryError = retry.error instanceof ApiError ? retry.error.message : null;

  return (
    <Alert severity="warning" sx={{ mb: 3 }} role="region" aria-label="Boîte d’envoi">
      <AlertTitle>
        Boîte d’envoi : {entries.length} envoi{entries.length > 1 ? 's' : ''} en attente
      </AlertTitle>
      {retryError && <Box sx={{ mb: 1 }}>{retryError}</Box>}
      <List dense disablePadding>
        {entries.map((entry) => (
          <ListItem
            key={entry.id}
            disableGutters
            sx={{ flexWrap: 'wrap', gap: 1 }}
          >
            <ListItemText
              primary={entry.type === 'message' ? `Message : ${entry.payload.text ?? 'message vocal'}` : entry.payload.title}
              secondary={`${entry.type === 'message' ? `Demande « ${entry.requestTitle} »` : entry.categoryName} · enregistré le ${formatDateTime(entry.savedAt)}`}
              sx={{ minWidth: 0, flex: '1 1 180px' }}
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                size="small"
                onClick={() => retry.mutate(entry)}
                loading={retry.isPending && retry.variables?.id === entry.id}
              >
                Réessayer
              </Button>
              <Button size="small" color="inherit" onClick={() => abandon.mutate(entry)}>
                Abandonner
              </Button>
            </Box>
          </ListItem>
        ))}
      </List>
    </Alert>
  );
}
