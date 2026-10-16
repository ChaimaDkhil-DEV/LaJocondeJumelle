import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { AlignLeft, Camera, Info, Lock, Mic } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiError } from '../../api/client';
import { Countdown } from '../../components/Countdown';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { PriorityBadge } from '../../components/PriorityBadge';
import { SectionCard } from '../../components/SectionCard';
import { StatusBadge } from '../../components/StatusBadge';
import { Person } from '../../components/UserAvatar';
import { icon } from '../../design/tokens';
import { ThreadPanel } from '../thread/ThreadPanel';
import { VoicePlayer } from '../voice/VoicePlayer';
import { useRequest } from './api';
import { HistoryTimeline } from './HistoryTimeline';
import { isReadOnlyStatus, readOnlyNotice } from './readOnly';
import { RequestActions } from './RequestActions';

const BACK = { to: '/', label: 'Retour aux demandes' };

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gap: 0.5 }}>
      <Typography component="dt" variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
        {children}
      </Typography>
    </Box>
  );
}

export function RequestDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const request = useRequest(id);

  if (request.isPending) return <LoadingState label="Chargement de la demande" variant="detail" />;
  if (request.error) {
    const notFound = request.error instanceof ApiError && request.error.status === 404;
    return (
      <>
        <PageHeader title="Demande" back={BACK} />
        <ErrorState
          message={notFound ? 'Cette demande est introuvable ou vous n’y avez pas accès.' : 'Impossible de charger la demande.'}
          actionLabel={notFound ? 'Retour aux demandes' : 'Réessayer'}
          onAction={() => (notFound ? navigate('/') : void request.refetch())}
        />
      </>
    );
  }

  const r = request.data;
  const readOnly = isReadOnlyStatus(r.status);

  return (
    <>
      <PageHeader back={BACK} eyebrow={r.category.name} title={r.title}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          <StatusBadge status={r.status} />
          <PriorityBadge priority={r.priority} />
          {!readOnly && <Countdown stage={r.currentStage} dueAt={r.currentDueAt} warnAt={r.warnAt} overdueStage={r.overdueStage} />}
        </Box>
      </PageHeader>

      {readOnly && (
        <Alert severity="info" variant="outlined" icon={<Lock size={icon.md} aria-hidden="true" />} sx={{ mb: 2 }}>
          {readOnlyNotice(r.status)}
        </Alert>
      )}
      <Box sx={{ mb: 3 }}>
        <RequestActions request={r} />
      </Box>
      {r.autoCloseAt && r.status === 'DONE' && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Cette demande sera clôturée automatiquement le {formatDateTime(r.autoCloseAt)}, sauf si elle est renvoyée à
          corriger d’ici là.
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          alignItems: 'start',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 320px' },
          gridTemplateAreas: { xs: '"info" "main" "history"', lg: '"main info" "main history"' },
          gridTemplateRows: { lg: 'auto 1fr' },
        }}
      >
        <Box sx={{ gridArea: 'main', display: 'grid', gap: 3, minWidth: 0 }}>
          {r.rejectionReason && (
            <Alert severity="warning">
              <strong>Motif du refus :</strong> {r.rejectionReason}
            </Alert>
          )}

          {r.voice && (
            <SectionCard title="Message vocal" icon={Mic} titleId="titre-vocal">
              <VoicePlayer key={r.voice.fileId} src={`/api/files/${r.voice.fileId}`} durationSeconds={r.voice.durationSeconds} />
            </SectionCard>
          )}

          {r.description && (
            <SectionCard title="Description" icon={AlignLeft} titleId="titre-description">
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.description}</Typography>
            </SectionCard>
          )}

          {r.proofPhotos.length > 0 && (
            <SectionCard title="Photos de preuve" icon={Camera} titleId="titre-preuves">
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {r.proofPhotos.map((photo, index) => (
                  <Box
                    key={photo.fileId}
                    component="a"
                    href={`/api/files/${photo.fileId}`}
                    target="_blank"
                    rel="noopener"
                    aria-label={`Ouvrir la photo de preuve ${index + 1} en grand`}
                    sx={{ display: 'block', borderRadius: 1, overflow: 'hidden', border: 1, borderColor: 'divider' }}
                  >
                    <Box
                      component="img"
                      src={`/api/files/${photo.fileId}`}
                      alt={`Photo de preuve ${index + 1}`}
                      sx={{ width: 140, height: 140, objectFit: 'cover', display: 'block' }}
                    />
                  </Box>
                ))}
              </Box>
            </SectionCard>
          )}

          <ThreadPanel requestId={r.id} requestTitle={r.title} canWrite={r.canWriteInThread} readOnly={readOnly} />
        </Box>

        <Box sx={{ gridArea: 'info', minWidth: 0 }}>
          <SectionCard title="Informations" icon={Info}>
            <Box component="dl" sx={{ m: 0, display: 'grid', gap: 2 }}>
              <InfoRow label="Demandeur">
                <Person name={r.requester.displayName} id={r.requester.id} />
              </InfoRow>
              <InfoRow label="Réalisée par">
                {r.assignee ? (
                  <Person name={r.assignee.displayName} id={r.assignee.id} />
                ) : (
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    En attente d’affectation
                  </Box>
                )}
              </InfoRow>
              <InfoRow label="Créée le">
                <time dateTime={r.createdAt}>{formatDateTime(r.createdAt)}</time>
              </InfoRow>
            </Box>
          </SectionCard>
        </Box>

        <Box sx={{ gridArea: 'history', minWidth: 0 }}>
          <HistoryTimeline requestId={r.id} />
        </Box>
      </Box>
    </>
  );
}
