import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Camera, History, Info, QrCode, Users } from 'lucide-react';
import { Link as RouterLink, useParams } from 'react-router';
import { ApiError } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { SectionCard } from '../../components/SectionCard';
import { Person } from '../../components/UserAvatar';
import { formatDateTime } from '../../components/format';
import { fontSize, icon, tokensOf } from '../../design/tokens';
import { VoicePlayer } from '../voice/VoicePlayer';
import { SupportsList, TeacherField } from './AdminCoverageTools';
import { useCoverage, useCoverageProfile } from './api';
import { CoverageActions } from './CoverageActions';
import { EditCoverageButton } from './EditCoverageDialog';
import { ClassHeading } from './EmployeeViews';
import {
  COVERAGE_STATUS_LABELS,
  CoverageDeadline,
  Elapsed,
  PROOF_LABELS,
  SOURCE_LABELS,
  TYPE_LABELS,
  formatDuration,
  formatTime,
  schoolClock,
} from './labels';
import type { CoverageDetail, CoverageHistoryEntry, CoverageSource, CoverageStatus } from './types';

const EVENT_LABELS: Record<string, string> = {
  CREATED: 'Affectation créée',
  ASSIGNED: 'Surveillant assigné',
  REASSIGNED: 'Affectation réassignée',
  RELEASED: 'Surveillant libéré',
  RELIEF_REQUESTED: 'Relève demandée',
  PRESENCE_CONFIRMED: 'Présence confirmée',
  EXTENDED: 'Affectation prolongée',
  GROUP_ADDED: 'Demande élargie',
  OVERDUE: 'Délai dépassé',
  UPDATED: 'Affectation modifiée',
  TEACHER_SET: 'Enseignant corrigé',
  SUPPORT_JOINED: 'Renfort arrivé',
  SUPPORT_RELEASED: 'Renfort libéré',
  MERGE_PROPOSED: 'Doublon possible',
  MERGE_DECIDED: 'Doublon tranché',
  REMINDER_SENT: 'Rappel envoyé',
  ESCALATED: 'Alerte transmise au super administrateur',
  ANONYMIZED: 'Données personnelles anonymisées',
};

/**
 * Modification d'une affectation (spec 006) : seuls les éléments changés, à l'heure de l'école ;
 * les dates s'affichent quand le jour change.
 */
function updatedText(from: Record<string, unknown>, to: Record<string, unknown>, timeZone: string): string {
  const changes: string[] = [];
  if (typeof from.classId === 'string' && typeof to.classId === 'string' && from.classId !== to.classId) {
    changes.push(`classe ${String(from.className ?? '?')} → ${String(to.className ?? '?')}`);
  }
  if (typeof from.startAt === 'string' && typeof to.startAt === 'string') {
    const slot = (v: Record<string, unknown>) => {
      const start = schoolClock(String(v.startAt), timeZone);
      const end = typeof v.plannedEndAt === 'string' ? schoolClock(v.plannedEndAt, timeZone).time : '…';
      return { day: start.day, text: `${start.time}–${end}` };
    };
    const before = slot(from);
    const after = slot(to);
    if (before.day !== after.day) changes.push(`${before.day} ${before.text} → ${after.day} ${after.text}`);
    else if (before.text !== after.text) changes.push(`${before.text} → ${after.text}`);
  }
  return changes.length > 0 ? `${EVENT_LABELS.UPDATED} : ${changes.join(' ; ')}` : EVENT_LABELS.UPDATED;
}

function eventText(e: CoverageHistoryEntry, timeZone: string): string {
  const to = e.toValue ?? {};
  const from = e.fromValue ?? {};
  const teacherName = (v: Record<string, unknown>) =>
    v.teacherId ? String(v.teacherName ?? 'enseignant inconnu') : 'non précisé';
  switch (e.type) {
    case 'CREATED':
      return to.source
        ? `Affectation créée — ${SOURCE_LABELS[to.source as CoverageSource].toLowerCase()}`
        : EVENT_LABELS.CREATED;
    case 'STATUS_CHANGED':
      return `Statut : ${COVERAGE_STATUS_LABELS[to.status as CoverageStatus] ?? String(to.status)}`;
    case 'ASSIGNED':
      // Garde antérieure à 004 : prise par un volontaire ou affectation forcée.
      return to.selfAccepted
        ? `Garde prise par ${String(to.assigneeName ?? '')}`
        : `Assignée à ${String(to.assigneeName ?? '')}${to.forced ? ' (affectation forcée)' : ''}`;
    case 'REASSIGNED':
      return from.assigneeName
        ? `Réassignée de ${String(from.assigneeName)} à ${String(to.assigneeName ?? '')}`
        : `Réassignée à ${String(to.assigneeName ?? '')}${to.forced ? ' (affectation forcée)' : ''}`;
    case 'SUPPORT_JOINED':
      return `Renfort arrivé : ${String(to.userName ?? '')}`;
    case 'SUPPORT_RELEASED':
      return `Renfort libéré : ${String(to.userName ?? '')}`;
    case 'TEACHER_SET':
      return `Enseignant : ${teacherName(from)} → ${teacherName(to)}`;
    case 'MERGE_DECIDED':
      return to.decision === 'CONFIRM'
        ? 'Doublon tranché : rattachement confirmé'
        : 'Doublon tranché : affectations gardées distinctes';
    case 'UPDATED':
      return to.declaration
        ? 'Classe déclarée vide par un surveillant : demande prise en charge'
        : updatedText(from, to, timeZone);
    case 'RELEASED':
      return to.byManager ? 'Surveillant libéré par un admin' : 'Désistement (garde antérieure)';
    case 'PRESENCE_CONFIRMED':
      return `Présence confirmée (${((to.methods as string[] | undefined) ?? []).map((m) => (m === 'QR' ? 'QR code' : 'photo')).join(' + ')})`;
    case 'EXTENDED':
      return `Prolongée de ${String(to.minutes ?? '')} min`;
    case 'GROUP_ADDED':
      return `Élargie au groupe ${String(to.groupName ?? '')}`;
    case 'OVERDUE':
      return to.stage === 'ARRIVAL'
        ? 'Présence non confirmée à temps'
        : 'Délai de prise en charge dépassé';
    default:
      return EVENT_LABELS[e.type] ?? e.type;
  }
}

function Timeline({ entries }: { entries: CoverageHistoryEntry[] }) {
  // Fuseau de l'école pour les créneaux modifiés ; Europe/Paris en attendant le profil.
  const timeZone = useCoverageProfile().data?.schoolDates.timezone ?? 'Europe/Paris';
  return (
    <Box
      component="ol"
      aria-label="Historique de l’affectation"
      sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}
    >
      {entries.map((e) => (
        <Box
          component="li"
          key={e.id}
          sx={{ display: 'grid', gap: 0.25, pl: 2, borderLeft: 2, borderColor: 'divider' }}
        >
          <Typography variant="body2">{eventText(e, timeZone)}</Typography>
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
    ['Création', t.createdAt],
    ['Assignation', t.acceptedAt],
    ['Départ', t.departedAt],
    ['Présence confirmée', t.presenceAt],
    ['Fin', t.relievedAt],
    ['Clôture', t.closedAt],
    ['Annulation', t.cancelledAt],
  ];
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        columnGap: 2,
        rowGap: 0.75,
        fontSize: fontSize.sm,
      }}
    >
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
            Durée
          </Box>
          <Box component="dd" sx={{ m: 0 }}>
            {formatDuration(detail.durationMinutes)}
          </Box>
        </Box>
      )}
    </Box>
  );
}

/** Détail d'une affectation : vue selon l'acteur, actions selon les droits, preuves, historique horodaté (heure serveur). */
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
        <ErrorState
          message={
            notFound
              ? 'Cette garde n’existe pas ou vous n’y avez pas accès.'
              : 'Impossible de charger la garde.'
          }
        />
      </>
    );
  }
  const data = coverage.data;
  const d = data;
  return (
    <>
      <PageHeader title={`Garde — ${d.class.name}`} eyebrow={d.reference} back={back} />
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 360px' },
          alignItems: 'start',
        }}
      >
        <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <SectionCard>
            <ClassHeading summary={d} level={2} />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, fontSize: fontSize.sm }}>
              {d.timestamps.presenceAt && ['ON_DUTY', 'RELIEF_PENDING'].includes(d.status) && (
                <Elapsed since={d.timestamps.presenceAt} prefix="En classe depuis" />
              )}
              <CoverageDeadline summary={d} />
            </Box>
            {d.status === 'CANCELLED' && d.cancelReason && (
              <Alert severity="info">Annulée : {d.cancelReason}</Alert>
            )}
            {d.status === 'RELIEF_PENDING' && (
              <Alert severity="warning">
                Relève demandée : le surveillant reste en charge de la classe jusqu’à l’arrivée du
                remplaçant.
              </Alert>
            )}
            {d.alerts.includes('TAKEOVER_EXPIRED') && d.isManager && (
              <Alert severity="error">
                Délai d’assignation dépassé : assignez un surveillant disponible.
              </Alert>
            )}
            {d.alerts.includes('DOUBLE_ASSIGNMENT') && d.isManager && (
              <Alert severity="error">
                Ce surveillant a une autre affectation en cours sur ce créneau : réassignez l’une
                des deux si nécessaire.
              </Alert>
            )}
            {d.alerts.includes('POSSIBLE_DUPLICATE') && d.isManager && (
              <Alert
                severity="warning"
                action={
                  <Box
                    component={RouterLink}
                    to="/gardes?onglet=doublons"
                    sx={{ color: 'inherit', alignSelf: 'center', mr: 1 }}
                  >
                    Trancher
                  </Box>
                }
              >
                Doublon possible : une autre affectation concerne cette classe sur le même créneau.
              </Alert>
            )}
            {d.status === 'UNFILLED' && d.isManager && (
              <Alert severity="info">Créneau passé sans surveillant assigné.</Alert>
            )}
            {d.status === 'LATE' && d.isManager && (
              <Alert severity="error">
                Présence non confirmée dans le délai : contactez le surveillant ou réassignez
                l’affectation.
              </Alert>
            )}
            {d.reason && (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                Motif : {d.reason}
              </Typography>
            )}
            {d.note && (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {d.note}
              </Typography>
            )}
            {d.voice && (
              <VoicePlayer
                src={`/api/files/${d.voice.fileId}`}
                durationSeconds={d.voice.durationSeconds}
              />
            )}
            <CoverageActions detail={d} />
            <EditCoverageButton detail={d} />
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
                          sx={{
                            width: 200,
                            height: 150,
                            objectFit: 'cover',
                            borderRadius: 1,
                            border: 1,
                            borderColor: 'divider',
                            display: 'block',
                          }}
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
                        {p.method === 'QR' ? (
                          <QrCode size={icon.md} aria-hidden="true" />
                        ) : (
                          <Camera size={icon.md} aria-hidden="true" />
                        )}
                        <Typography variant="body2">
                          {p.method === 'QR' ? 'QR code de la classe scanné' : 'Photo transmise'}
                        </Typography>
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
                  Surveillant
                </Typography>
                {d.assignee ? (
                  <Person name={d.assignee.displayName} id={d.assignee.id} size={28} />
                ) : (
                  <Typography variant="body2">Aucun pour l’instant</Typography>
                )}
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Demandée par
                </Typography>
                <Person name={d.requester.displayName} id={d.requester.id} size={28} />
              </Box>
              {d.isManager && <TeacherField detail={d} />}
              {/* Toujours monté pour l'admin : la confirmation de libération du dernier renfort doit s'afficher. */}
              {d.isManager && <SupportsList detail={d} />}
              {!d.isManager && d.supports.length > 0 && (
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <Users size={icon.sm} aria-hidden="true" style={{ marginTop: 3 }} />
                  <Typography variant="body2">
                    Renfort : {d.supports.map((s) => s.user.displayName).join(', ')}
                  </Typography>
                </Box>
              )}
              <Typography variant="body2" color="text.secondary">
                {[d.source && SOURCE_LABELS[d.source], d.type && TYPE_LABELS[d.type], d.floor?.name]
                  .filter(Boolean)
                  .join(' · ')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Preuve demandée : {PROOF_LABELS[d.proofMode]}
                {d.finalValidation ? ' · validation finale par un admin' : ''}
              </Typography>
              {d.extensionCount > 0 && (
                <Typography variant="body2" color="text.secondary">
                  {`${d.extensionCount} prolongation${d.extensionCount > 1 ? 's' : ''}`}
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
