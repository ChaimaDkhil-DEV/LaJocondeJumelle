import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useParams } from 'react-router';
import { ApiError, loadErrorMessage } from '../../api/client';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { t } from '../../i18n';
import { ReasonDialog } from '../requests/ReasonDialog';
import { fullName, useDecision, useValidationDetail, type Decision } from './api';
import {
  CommunicationHistory,
  CommunicationStatusBadge,
  DeliveryList,
  RemarkAndVoice,
} from './CommunicationParts';

const SUCCESS: Record<Decision, string> = {
  APPROVE: t('Communication approuvée et publiée au parent.'),
  RETURN: t('Communication retournée à l’enseignant.'),
  REJECT: t('Communication rejetée.'),
};

/** Examen d'une communication : la décision porte sur exactement la version affichée (015, FR-004). */
export function ValidationDetailPage() {
  const { id = '' } = useParams();
  const detail = useValidationDetail(id);
  const decision = useDecision(id);
  const toast = useToast();
  const [open, setOpen] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (detail.isPending) return <LoadingState label={t('Chargement de la communication')} />;
  if (detail.error)
    return (
      <ErrorState
        message={loadErrorMessage(detail.error, t('la communication'))}
        actionLabel={t('Réessayer')}
        onAction={() => void detail.refetch()}
      />
    );
  const d = detail.data;
  const examined = d.revisions.find((r) => r.number === d.currentRevision) ?? d.revisions.at(-1);
  const pending = d.status === 'PENDING_ADMIN_VALIDATION';

  function decide(action: Decision, reason?: string): void {
    if (!examined) return;
    setError(null);
    decision.mutate(
      { action, revision: examined.number, version: d.version, ...(reason ? { reason } : {}) },
      {
        onSuccess: () => {
          setOpen(null);
          toast.success(SUCCESS[action]);
        },
        onError: (e) => {
          setOpen(null);
          setError(
            e instanceof ApiError
              ? e.message
              : t('La décision n’a pas pu être enregistrée. Réessayez.'),
          );
          void detail.refetch();
        },
      },
    );
  }

  return (
    <Box>
      <PageHeader
        title={t('Communication pour {name}', { name: fullName(d.student) })}
        back={{ to: '/communications-a-valider', label: t('Communications à valider') }}
        breadcrumb={false}
      />
      <Box sx={{ display: 'grid', gap: 2, maxWidth: 760 }}>
        <Paper variant="elevated" sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <CommunicationStatusBadge status={d.status} />
            {examined && (
              <Typography color="text.secondary">
                {t('version {number}', { number: examined.number })}
              </Typography>
            )}
          </Box>
          <Typography>
            {t('Enseignant : {name}', { name: d.teacher.displayName })}
            <br />
            {t('Élève : {name} — {className}', {
              name: fullName(d.student),
              className: d.student.class.name,
            })}
            <br />
            {t('Destinataire : {name}', {
              name: `${fullName(d.guardian)}${d.guardian.relationship ? ` (${d.guardian.relationship})` : ''}`,
            })}
            {d.submittedAt && (
              <>
                <br />
                {t('Soumise le {date}', { date: formatDateTime(d.submittedAt) })}
              </>
            )}
          </Typography>
          {examined && (
            <RemarkAndVoice
              text={examined.text}
              voiceFileId={examined.voiceFileId}
              durationSeconds={examined.durationSeconds}
            />
          )}
          {error && (
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          )}
          {pending && examined && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Button variant="contained" onClick={() => setOpen('APPROVE')}>
                {t('Approuver et publier')}
              </Button>
              <Button variant="outlined" onClick={() => setOpen('RETURN')}>
                {t('Retourner pour correction')}
              </Button>
              <Button color="error" onClick={() => setOpen('REJECT')}>
                {t('Rejeter')}
              </Button>
            </Box>
          )}
          {d.decisionReason && !pending && (
            <Alert severity="info">
              <strong>{t('Motif :')}</strong> {d.decisionReason}
            </Alert>
          )}
        </Paper>
        {d.status === 'APPROVED' && (
          <Paper variant="elevated" sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
              {t('Notifications externes')}
            </Typography>
            <DeliveryList deliveries={d.deliveries} />
          </Paper>
        )}
        <Paper variant="elevated" sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
            {t('Historique')}
          </Typography>
          <CommunicationHistory events={d.events} />
        </Paper>
      </Box>
      <ConfirmDialog
        open={open === 'APPROVE'}
        title={t('Approuver et publier cette communication ?')}
        confirmLabel={t('Approuver et publier')}
        pending={decision.isPending}
        onConfirm={() => decide('APPROVE')}
        onClose={() => setOpen(null)}
      >
        {t(
          'Le parent pourra lire la remarque et écouter le vocal de cette version. La publication est définitive.',
        )}
      </ConfirmDialog>
      <ReasonDialog
        open={open === 'RETURN'}
        title={t('Retourner pour correction')}
        label={t('Motif du retour')}
        requiredMessage={t('Indiquez ce que l’enseignant doit corriger.')}
        confirmLabel={t('Retourner')}
        pending={decision.isPending}
        onConfirm={(reason) => decide('RETURN', reason)}
        onClose={() => setOpen(null)}
      />
      <ReasonDialog
        open={open === 'REJECT'}
        title={t('Rejeter la communication')}
        label={t('Motif du rejet')}
        requiredMessage={t('Indiquez le motif du rejet.')}
        confirmLabel={t('Rejeter')}
        pending={decision.isPending}
        onConfirm={(reason) => decide('REJECT', reason)}
        onClose={() => setOpen(null)}
      />
    </Box>
  );
}
