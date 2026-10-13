import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Camera, Hand, History, Info, QrCode, Users } from 'lucide-react';
import { useParams } from 'react-router';
import { ApiError } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { SectionCard } from '../../components/SectionCard';
import { Person } from '../../components/UserAvatar';
import { formatDateTime } from '../../components/format';
import { fontSize, icon, tokensOf } from '../../design/tokens';
import { VoicePlayer } from '../voice/VoicePlayer';
import { useCoverage } from './api';
import { CoverageActions } from './CoverageActions';
import { ClassHeading } from './EmployeeViews';
import { COVERAGE_STATUS_LABELS, CoverageDeadline, Elapsed, PROOF_LABELS, formatDuration, formatTime } from './labels';
import type { CoverageDetail, CoverageHistoryEntry, CoverageStatus } from './types';

const EVENT_LABELS: Record<string, string> = {
  CREATED: 'Demande créée',
  ASSIGNED: 'Garde prise',
  REASSIGNED: 'Garde réaffectée',
  RELEASED: 'Désistement',
  RELIEF_REQUESTED: 'Relève demandée',
  PRESENCE_CONFIRMED: 'Présence confirmée',
  EXTENDED: 'Garde prolongée',
  GROUP_ADDED: 'Demande élargie',
  OVERDUE: 'Délai dépassé',
};

function eventText(e: CoverageHistoryEntry): string {
  const to = e.toValue ?? {};
  switch (e.type) {
    case 'STATUS_CHANGED':
      return `Statut : ${COVERAGE_STATUS_LABELS[to.status as CoverageStatus] ?? String(to.status)}`;
    case 'ASSIGNED':
      return to.selfAccepted ? `Garde prise par ${String(to.assigneeName ?? '')}` : `Affectée à ${String(to.assigneeName ?? '')}${to.forced ? ' (affectation forcée)' : ''}`;
    case 'REASSIGNED':
      return `Réaffectée à ${String(to.assigneeName ?? '')}${to.forced ? ' (affectation forcée)' : ''}`;
    case 'RELEASED':
      return to.byManager ? 'Employé libéré par un responsable' : 'Désistement de l’employé';
    case 'PRESENCE_CONFIRMED':
      return `Présence confirmée (${((to.methods as string[] | undefined) ?? []).map((m) => (m === 'QR' ? 'QR code' : 'photo')).join(' + ')})`;
    case 'EXTENDED':
      return `Prolongée de ${String(to.minutes ?? '')} min`;
    case 'GROUP_ADDED':
      return `Élargie au groupe ${String(to.groupName ?? '')}`;
    case 'OVERDUE':
      return to.stage === 'ARRIVAL' ? 'Présence non confirmée à temps' : 'Aucun preneur dans le délai';
    default:
      return EVENT_LABELS[e.type] ?? e.type;
  }
}

function Timeline({ entries }: { entries: CoverageHistoryEntry[] }) {
  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
      {entries.map((e) => (
        <Box component="li" key={e.id} sx={{ display: 'grid', gap: 0.25, pl: 2, borderLeft: 2, borderColor: 'divider' }}>
          <Typography variant="body2">{eventText(e)}</Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDateTime(e.createdAt)} · {e.actor ? e.actor.displayName : 'Système'}
            {e.comment && ` — « ${e.comment} »`}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function Times({ detail }: { detail: CoverageDetail }) {
  const t = detail.timestamps;
  const rows: Array<[string, string | null]> = [
    ['Diffusion', t.broadcastAt],
    ['Acceptation', t.acceptedAt],
    ['Départ', t.departedAt],
    ['Présence confirmée', t.presenceAt],
    ['Relève', t.relievedAt],
    ['Clôture', t.closedAt],
    ['Annulation', t.cancelledAt],
  ];
  return (
    <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.75, fontSize: fontSize.sm }}>
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <Box key={label} sx={{ display: 'contents' }}>
            <Box component="dt" sx={{ color: 'text.secondary' }}>
              {label}
            </Box>
            <Box component="dd" sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(value!)}
            </Box>
          </Box>
        ))}
      {detail.durationMinutes !== null && (
        <Box sx={{ display: 'contents' }}>
          <Box component="dt" sx={{ color: 'text.secondary' }}>
            Durée de garde
          </Box>
          <Box component="dd" sx={{ m: 0 }}>
            {formatDuration(detail.durationMinutes)}
          </Box>
        </Box>
      )}
    </Box>
  );
}

/** Détail d'une couverture : actions selon les droits, preuves, historique horodaté (heure serveur). */
export function CoverageDetailPage() {
  const { id = '' } = useParams();
  const coverage = useCoverage(id);
  const back = { to: '/gardes', label: 'Gardes' };

  if (coverage.isPending) return <LoadingState label="Chargement de la garde" variant="detail" />;
  if (coverage.error) {
    const notFound = coverage.error instanceof ApiError && coverage.error.status === 404;
    return (
      <>
        <PageHeader title="Garde" back={back} />
        <ErrorState message={notFound ? 'Cette garde n’existe pas ou vous n’y avez pas accès.' : 'Impossible de charger la garde.'} />
      </>
    );
  }
  const data = coverage.data;
  if (data.limited) {
    return (
      <>
        <PageHeader title="Garde" eyebrow={data.reference} back={back} />
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
          <EmptyState
            icon={Hand}
            title={data.takenBy ? `Déjà prise par ${data.takenBy}` : 'Cette garde n’est plus disponible'}
            description="Merci ! Une autre personne s’en occupe."
          />
        </Box>
      </>
    );
  }

  const d = data;
  return (
    <>
      <PageHeader title={`Garde — ${d.class.name}`} eyebrow={d.reference} back={back} />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 360px' }, alignItems: 'start' }}>
        <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <SectionCard>
            <ClassHeading summary={d} level={2} />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, fontSize: fontSize.sm }}>
              {d.timestamps.presenceAt && ['ON_DUTY', 'RELIEF_PENDING'].includes(d.status) && (
                <Elapsed since={d.timestamps.presenceAt} prefix="En classe depuis" />
              )}
              <CoverageDeadline summary={d} />
            </Box>
            {d.status === 'CANCELLED' && d.cancelReason && <Alert severity="info">Annulée : {d.cancelReason}</Alert>}
            {d.status === 'RELIEF_PENDING' && <Alert severity="warning">Relève demandée : l’employé reste responsable jusqu’à l’arrivée du remplaçant.</Alert>}
            {d.status === 'UNFILLED' && d.isManager && (
              <Alert severity="error">Personne n’a pris cette garde dans le délai : élargissez à un autre groupe ou affectez quelqu’un.</Alert>
            )}
            {d.status === 'LATE' && d.isManager && (
              <Alert severity="error">Présence non confirmée dans le délai : contactez l’employé ou réaffectez la garde.</Alert>
            )}
            {d.note && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{d.note}</Typography>}
            {d.voice && <VoicePlayer src={`/api/files/${d.voice.fileId}`} durationSeconds={d.voice.durationSeconds} />}
            <CoverageActions detail={d} />
          </SectionCard>

          {d.presences.length > 0 && (
            <SectionCard title="Preuves de présence" icon={Camera}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {d.presences.map((p) => (
                  <Box key={`${p.method}-${p.at}`} sx={{ display: 'grid', gap: 0.75 }}>
                    {p.method === 'PHOTO' && p.fileId ? (
                      <Box
                        component="a"
                        href={`/api/files/${p.fileId}`}
                        target="_blank"
                        rel="noopener"
                        aria-label={`Ouvrir la photo de présence de ${p.by.displayName}`}
                      >
                        <Box
                          component="img"
                          src={`/api/files/${p.fileId}`}
                          alt={`Photo de présence prise par ${p.by.displayName}`}
                          sx={{ width: 200, height: 150, objectFit: 'cover', borderRadius: 1, border: 1, borderColor: 'divider', display: 'block' }}
                        />
                      </Box>
                    ) : (
                      <Box
                        sx={(theme) => ({
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 1,
                          px: 1.5,
                          py: 1,
                          borderRadius: 1,
                          bgcolor: tokensOf(theme).surfaceMuted,
                        })}
                      >
                        {p.method === 'QR' ? <QrCode size={icon.md} aria-hidden="true" /> : <Camera size={icon.md} aria-hidden="true" />}
                        <Typography variant="body2">{p.method === 'QR' ? 'QR code de la classe scanné' : 'Photo transmise'}</Typography>
                      </Box>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      {p.by.displayName} · {formatTime(p.at)} (heure serveur)
                    </Typography>
                  </Box>
                ))}
              </Box>
            </SectionCard>
          )}

          {d.history && (
            <SectionCard title="Historique" icon={History}>
              <Timeline entries={d.history} />
            </SectionCard>
          )}
        </Box>

        <Box sx={{ display: 'grid', gap: 2 }}>
          <SectionCard title="Informations" icon={Info}>
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Preneur
                </Typography>
                {d.assignee ? <Person name={d.assignee.displayName} id={d.assignee.id} size={28} /> : <Typography variant="body2">Aucun pour l’instant</Typography>}
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Demandée par
                </Typography>
                <Person name={d.requester.displayName} id={d.requester.id} size={28} />
              </Box>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <Users size={icon.sm} aria-hidden="true" style={{ marginTop: 3 }} />
                <Typography variant="body2">{d.groups.map((g) => g.name).join(', ')}</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Preuve demandée : {PROOF_LABELS[d.proofMode]}
                {d.finalValidation ? ' · validation finale par l’administration' : ''}
              </Typography>
              {(d.releaseCount > 0 || d.extensionCount > 0) && (
                <Typography variant="body2" color="text.secondary">
                  {d.releaseCount > 0 && `${d.releaseCount} désistement${d.releaseCount > 1 ? 's' : ''}`}
                  {d.releaseCount > 0 && d.extensionCount > 0 && ' · '}
                  {d.extensionCount > 0 && `${d.extensionCount} prolongation${d.extensionCount > 1 ? 's' : ''}`}
                </Typography>
              )}
            </Box>
          </SectionCard>
          <SectionCard title="Horodatages">
            <Times detail={d} />
          </SectionCard>
        </Box>
      </Box>
    </>
  );
}
