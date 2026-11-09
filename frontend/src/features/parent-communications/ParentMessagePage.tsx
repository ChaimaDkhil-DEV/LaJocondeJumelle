import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useParams } from 'react-router';
import { loadErrorMessage } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { t } from '../../i18n';
import { fullName, useParentMessage } from './api';
import { RemarkAndVoice } from './CommunicationParts';

/** Lecture d'un message de l'école : remarque, vocal, enseignant et date ; la lecture est notée par le serveur. */
export function ParentMessagePage() {
  const { id = '' } = useParams();
  const message = useParentMessage(id);
  const back = { to: '/messages-ecole', label: t('Messages de l’école') };
  if (message.isPending) return <LoadingState label={t('Chargement du message')} />;
  if (message.error)
    return (
      <ErrorState
        message={loadErrorMessage(message.error, t('le message'))}
        actionLabel={t('Réessayer')}
        onAction={() => void message.refetch()}
      />
    );
  const m = message.data;
  return (
    <Box>
      <PageHeader
        title={t('Message concernant {name}', { name: fullName(m.student) })}
        back={back}
        breadcrumb={false}
      />
      <Paper
        variant="elevated"
        sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 2, maxWidth: 720 }}
      >
        <Typography color="text.secondary">
          {t('De {teacher}, le {date}', {
            teacher: m.teacher.displayName,
            date: formatDateTime(m.approvedAt),
          })}
        </Typography>
        <RemarkAndVoice
          text={m.text}
          voiceFileId={m.voiceFileId}
          durationSeconds={m.durationSeconds}
        />
      </Paper>
    </Box>
  );
}
