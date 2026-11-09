import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Mail } from 'lucide-react';
import { Link as RouterLink } from 'react-router';
import { loadErrorMessage } from '../../api/client';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { t } from '../../i18n';
import { fullName, useParentMessages } from './api';

/** « Messages de l'école » : communications approuvées concernant les enfants du parent (015, US3). */
export function ParentMessagesPage() {
  const list = useParentMessages();
  return (
    <Box>
      <PageHeader
        title={t('Messages de l’école')}
        description={t('Messages des enseignants, publiés après validation par l’administration.')}
        breadcrumb={false}
      />
      {list.isPending ? (
        <LoadingState label={t('Chargement des messages')} />
      ) : list.error ? (
        <ErrorState
          message={loadErrorMessage(list.error, t('les messages'))}
          actionLabel={t('Réessayer')}
          onAction={() => void list.refetch()}
        />
      ) : list.data.length === 0 ? (
        <Paper variant="elevated">
          <EmptyState
            icon={Mail}
            title={t('Aucun message')}
            description={t('Aucun message de l’école pour le moment.')}
          />
        </Paper>
      ) : (
        <Box
          component="ul"
          aria-label={t('Messages de l’école')}
          sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}
        >
          {list.data.map((m) => (
            <Paper component="li" key={m.id} variant="elevated">
              <Box
                component={RouterLink}
                to={`/messages-ecole/${m.id}`}
                sx={{
                  display: 'grid',
                  gap: 0.5,
                  p: 2,
                  color: 'text.primary',
                  textDecoration: 'none',
                  '&:hover, &:focus-visible': { bgcolor: 'action.hover' },
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Typography component="span" sx={{ fontWeight: m.read ? 400 : 700 }}>
                    {m.teacher.displayName} — {fullName(m.student)}
                  </Typography>
                  <Badge tone={m.read ? 'neutral' : 'accent'}>
                    {m.read ? t('Lu') : t('Non lu')}
                  </Badge>
                </Box>
                <Typography component="span" variant="body2" color="text.secondary">
                  {formatDateTime(m.approvedAt)}
                </Typography>
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
