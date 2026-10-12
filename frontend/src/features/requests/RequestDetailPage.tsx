import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { PriorityChip } from '../../components/PriorityChip';
import { StatusChip } from '../../components/StatusChip';
import { VoicePlayer } from '../voice/VoicePlayer';
import { useRequest } from './api';
import type { RequestDetail } from './types';

const STEP_LABELS: Array<[keyof RequestDetail['timestamps'], string]> = [
  ['createdAt', 'Création'],
  ['submittedAt', 'Envoi'],
  ['approvedAt', 'Approbation'],
  ['rejectedAt', 'Refus'],
  ['assignedAt', 'Affectation'],
  ['acceptedAt', 'Acceptation'],
  ['startedAt', 'Début'],
  ['doneAt', 'Fin'],
  ['finalValidatedAt', 'Validation finale'],
  ['closedAt', 'Clôture'],
  ['cancelledAt', 'Annulation'],
];

export function RequestDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash;
  const request = useRequest(id);

  if (request.isPending) return <LoadingState label="Chargement de la demande" />;
  if (request.error) {
    const notFound = request.error instanceof ApiError && request.error.status === 404;
    return (
      <ErrorState
        message={notFound ? 'Cette demande est introuvable ou vous n’y avez pas accès.' : 'Impossible de charger la demande.'}
        actionLabel={notFound ? 'Retour aux demandes' : 'Réessayer'}
        onAction={() => (notFound ? navigate('/') : void request.refetch())}
      />
    );
  }

  const r = request.data;
  const steps = STEP_LABELS.filter(([key]) => r.timestamps[key]);

  return (
    <>
      <Button component={RouterLink} to="/" startIcon={<ArrowBackIcon aria-hidden="true" />} sx={{ mb: 2 }}>
        Retour aux demandes
      </Button>
      {flash && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {flash}
        </Alert>
      )}

      <Typography component="h1" variant="h4" sx={{ overflowWrap: 'anywhere' }}>
        {r.title}
      </Typography>
      <Typography color="text.secondary" gutterBottom>
        {r.reference} · {r.category.name}
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 3 }}>
        <StatusChip status={r.status} />
        <PriorityChip priority={r.priority} />
      </Stack>

      <Stack spacing={3}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography>
            <strong>Demandeur :</strong> {r.requester.displayName}
          </Typography>
          <Typography>
            <strong>Réalisée par :</strong> {r.assignee ? r.assignee.displayName : 'en attente d’affectation'}
          </Typography>
        </Paper>

        {r.voice && (
          <Box component="section" aria-labelledby="titre-vocal">
            <Typography id="titre-vocal" component="h2" variant="h6" gutterBottom>
              Message vocal
            </Typography>
            <VoicePlayer key={r.voice.fileId} src={`/api/files/${r.voice.fileId}`} durationSeconds={r.voice.durationSeconds} />
          </Box>
        )}

        {r.description && (
          <Box component="section" aria-labelledby="titre-description">
            <Typography id="titre-description" component="h2" variant="h6" gutterBottom>
              Description
            </Typography>
            <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.description}</Typography>
          </Box>
        )}

        {r.rejectionReason && (
          <Alert severity="warning">
            <strong>Motif du refus :</strong> {r.rejectionReason}
          </Alert>
        )}

        <Box component="section" aria-labelledby="titre-etapes">
          <Typography id="titre-etapes" component="h2" variant="h6">
            Étapes
          </Typography>
          <List dense>
            {steps.map(([key, label]) => (
              <ListItem key={key} disableGutters>
                <ListItemText primary={label} secondary={formatDateTime(r.timestamps[key]!)} />
              </ListItem>
            ))}
          </List>
        </Box>
      </Stack>
    </>
  );
}
