import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { MessageSquarePlus, Users } from 'lucide-react';
import { Link as RouterLink } from 'react-router';
import { loadErrorMessage } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { icon } from '../../design/tokens';
import { t } from '../../i18n';
import { fullName, useMyCommunications } from './api';
import { CommunicationStatusBadge } from './CommunicationParts';

/** « Communication avec les parents » : communications de l'enseignant et leur statut (015, US1). */
export function TeacherCommunicationsPage() {
  const list = useMyCommunications();
  const create = (
    <Button
      component={RouterLink}
      to="/communications-parents/nouvelle"
      variant="contained"
      startIcon={<MessageSquarePlus size={icon.sm} aria-hidden="true" />}
    >
      {t('Nouvelle communication')}
    </Button>
  );
  return (
    <Box>
      <PageHeader
        title={t('Communication avec les parents')}
        description={t(
          'Remarque écrite et message vocal, publiés au parent après validation par l’administration.',
        )}
        actions={create}
      />
      {list.isPending ? (
        <LoadingState label={t('Chargement des communications')} />
      ) : list.error ? (
        <ErrorState
          message={loadErrorMessage(list.error, t('les communications'))}
          actionLabel={t('Réessayer')}
          onAction={() => void list.refetch()}
        />
      ) : list.data.length === 0 ? (
        <Paper variant="elevated">
          <EmptyState
            icon={Users}
            title={t('Aucune communication')}
            description={t('Créez une communication pour l’un de vos élèves.')}
          />
        </Paper>
      ) : (
        <Box
          component="ul"
          aria-label={t('Mes communications')}
          sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}
        >
          {list.data.map((c) => (
            <Paper
              component="li"
              key={c.id}
              variant="elevated"
              sx={{ p: 2, display: 'grid', gap: 0.75 }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 1,
                  justifyContent: 'space-between',
                }}
              >
                <Box
                  component={RouterLink}
                  to={`/communications-parents/${c.id}`}
                  sx={{ fontWeight: 600, color: 'text.primary' }}
                >
                  {fullName(c.student)} — {c.student.class.name}
                </Box>
                <CommunicationStatusBadge status={c.status} />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {t('Pour {name}', { name: fullName(c.guardian) })} ·{' '}
                {t('Modifiée le {date}', { date: formatDateTime(c.updatedAt) })}
              </Typography>
              {c.decisionReason && (
                <Typography variant="body2">
                  {t('Motif : {reason}', { reason: c.decisionReason })}
                </Typography>
              )}
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
