import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { Clock, DoorOpen, Hand, History, MapPin, Mic, NotebookText, School, Timer, UserRound } from 'lucide-react';
import { Link as RouterLink } from 'react-router';
import { ApiError } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PriorityBadge } from '../../components/PriorityBadge';
import { RelativeTime } from '../../components/RelativeTime';
import { SectionCard } from '../../components/SectionCard';
import { useToast } from '../../components/Toast';
import { formatDateTime } from '../../components/format';
import { font, fontSize, icon, tokensOf } from '../../design/tokens';
import { VoicePlayer } from '../voice/VoicePlayer';
import { useCoverageAction, useCoverageHistory, useMyGuards, useOpenCoverage, useSetOwnAvailability } from './api';
import { CoverageActions } from './CoverageActions';
import { AVAILABILITY_LABELS, CoverageDeadline, CoverageStatusBadge, Elapsed, formatDuration, formatStart, formatTime } from './labels';
import type { CoverageProfile, CoverageSummary, OpenCoverage } from './types';

/** Ligne d'information : icône + texte. */
export function Fact({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <Box
      component="span"
      sx={(theme) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        fontSize: fontSize.sm,
        color: tokensOf(theme).textSecondary,
        '& svg': { flex: 'none', color: tokensOf(theme).textMuted },
      })}
    >
      <Icon size={icon.sm} aria-hidden="true" />
      {children}
    </Box>
  );
}

/** Carte d'une classe : nom très lisible, salle, priorité, début et durée. */
export function ClassHeading({ summary, level = 3 }: { summary: CoverageSummary; level?: 2 | 3 }) {
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography component={`h${level}`} sx={{ fontSize: fontSize.lg, fontWeight: font.medium, lineHeight: 1.3 }}>
          {summary.class.name}
        </Typography>
        <PriorityBadge priority={summary.priority} />
        <CoverageStatusBadge status={summary.status} />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.75 }}>
        {summary.class.room && <Fact icon={MapPin}>{summary.class.room}</Fact>}
        <Fact icon={Clock}>{formatStart(summary.startAt)}</Fact>
        <Fact icon={Timer}>{formatDuration(summary.estimatedMinutes)}</Fact>
        {summary.absentTeacher && <Fact icon={UserRound}>Remplace {summary.absentTeacher}</Fact>}
        {summary.hasNote && <Fact icon={NotebookText}>Consigne</Fact>}
        {summary.hasVoice && <Fact icon={Mic}>Message vocal</Fact>}
      </Box>
    </Box>
  );
}

/** Interrupteur de disponibilité ; « Absent » ne peut être levé que par un responsable. */
export function AvailabilitySwitch({ profile }: { profile: CoverageProfile }) {
  const toast = useToast();
  const mutation = useSetOwnAvailability();
  if (profile.availability === 'ABSENT') {
    return (
      <Alert severity="info">Vous êtes déclaré absent. Seul un responsable peut modifier ce statut.</Alert>
    );
  }
  const available = profile.availability === 'AVAILABLE';
  return (
    <FormControlLabel
      control={
        <Switch
          checked={available}
          disabled={mutation.isPending}
          onChange={(e) =>
            mutation.mutate(e.target.checked ? 'AVAILABLE' : 'UNAVAILABLE', {
              onSuccess: (p) => toast.success(`Vous êtes ${AVAILABILITY_LABELS[p.availability].toLowerCase()}.`),
              onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Modification impossible.'),
            })
          }
        />
      }
      label={available ? 'Je suis disponible pour les gardes' : 'Je suis indisponible'}
    />
  );
}

function OpenCoverageCard({ item }: { item: OpenCoverage }) {
  const toast = useToast();
  const accept = useCoverageAction(item.id);
  return (
    <Box
      component="article"
      aria-labelledby={`garde-${item.id}`}
      sx={(theme) => ({
        display: 'grid',
        gap: 2,
        p: 2,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: item.priority === 'URGENT' ? tokensOf(theme).error.border : 'divider',
        borderRadius: 1.5,
      })}
    >
      <Box id={`garde-${item.id}`}>
        <ClassHeading summary={item} />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'grid', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {item.timestamps.broadcastAt && <Elapsed since={item.timestamps.broadcastAt} prefix="Diffusée il y a" />}
          </Typography>
          <CoverageDeadline summary={item} />
        </Box>
        <Button
          variant="contained"
          size="large"
          startIcon={<Hand size={icon.md} aria-hidden="true" />}
          disabled={!item.canAccept}
          loading={accept.isPending}
          onClick={() =>
            accept.mutate(
              { action: 'ACCEPT' },
              {
                onSuccess: () => toast.success(`Garde prise : ${item.class.name}. Rendez-vous en classe.`),
                onError: (e) => toast.error(e instanceof ApiError ? e.message : 'La prise en charge a échoué. Réessayez.'),
              },
            )
          }
          sx={{ minHeight: 48, minWidth: { xs: '100%', sm: 200 }, fontSize: fontSize.md }}
        >
          Je prends
        </Button>
      </Box>
      {!item.canAccept && (
        <Typography variant="caption" color="text.secondary">
          Vous avez déjà une garde sur ce créneau ou vous êtes indisponible.
        </Typography>
      )}
    </Box>
  );
}

/** Onglet « À prendre » : mis à jour en direct (événements temps réel). */
export function OpenCoverageTab() {
  const open = useOpenCoverage();
  if (open.isPending) return <LoadingState label="Chargement des gardes à prendre" />;
  if (open.error) return <ErrorState message="Impossible de charger les gardes à prendre." actionLabel="Réessayer" onAction={() => void open.refetch()} />;
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <AvailabilitySwitch profile={open.data.availability} />
      {open.data.items.length === 0 ? (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
          <EmptyState icon={School} title="Aucune garde à prendre" description="Les nouvelles demandes de votre groupe apparaîtront ici dès leur diffusion." />
        </Box>
      ) : (
        open.data.items.map((item) => <OpenCoverageCard key={item.id} item={item} />)
      )}
    </Box>
  );
}

/** Onglet « Ma garde » : classe, chronomètre et actions. */
export function MyGuardTab() {
  const mine = useMyGuards();
  if (mine.isPending) return <LoadingState label="Chargement de votre garde" variant="detail" />;
  if (mine.error) return <ErrorState message="Impossible de charger votre garde." actionLabel="Réessayer" onAction={() => void mine.refetch()} />;
  if (mine.data.items.length === 0) {
    return (
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
        <EmptyState icon={DoorOpen} title="Aucune garde en cours" description="Quand vous prenez une garde, elle apparaît ici avec les étapes à suivre." />
      </Box>
    );
  }
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      {mine.data.items.map((guard) => (
        <SectionCard key={guard.id} component="article">
          <ClassHeading summary={guard} level={2} />
          <Box
            sx={(theme) => ({
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              p: 1.5,
              borderRadius: 1,
              bgcolor: tokensOf(theme).surfaceMuted,
              fontSize: fontSize.md,
              fontWeight: font.medium,
            })}
          >
            {guard.timestamps.presenceAt ? (
              <Elapsed since={guard.timestamps.presenceAt} prefix="En classe depuis" />
            ) : guard.timestamps.acceptedAt ? (
              <Elapsed since={guard.timestamps.acceptedAt} prefix="Prise il y a" />
            ) : null}
            <CoverageDeadline summary={guard} />
          </Box>
          {guard.note && (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {guard.note}
            </Typography>
          )}
          {guard.voice && <VoicePlayer src={`/api/files/${guard.voice.fileId}`} durationSeconds={guard.voice.durationSeconds} />}
          {guard.status === 'RELIEF_PENDING' && (
            <Alert severity="warning">Relève demandée : restez en classe jusqu’à ce que votre remplaçant confirme sa présence.</Alert>
          )}
          {guard.status === 'DONE' && <Alert severity="info">Garde terminée, en attente de validation par l’administration.</Alert>}
          <CoverageActions detail={guard} />
          <Box>
            <Button component={RouterLink} to={`/gardes/${guard.id}`} size="small">
              Voir le détail et l’historique
            </Button>
          </Box>
        </SectionCard>
      ))}
    </Box>
  );
}

/** Onglet « Historique » : gardes effectuées ou annulées, et désistements. */
export function PersonalHistoryTab() {
  const history = useCoverageHistory();
  if (history.isPending) return <LoadingState label="Chargement de l’historique" />;
  if (history.error) return <ErrorState message="Impossible de charger l’historique." actionLabel="Réessayer" onAction={() => void history.refetch()} />;
  const { guards, releases } = history.data;
  if (guards.length === 0 && releases.length === 0) {
    return (
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
        <EmptyState icon={History} title="Aucune garde pour l’instant" description="Vos gardes terminées et vos désistements apparaîtront ici." />
      </Box>
    );
  }
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      {guards.length > 0 && (
        <SectionCard title="Mes gardes" icon={History} flush>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {guards.map((g) => (
              <Box component="li" key={g.id} sx={{ borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
                <Box
                  component={RouterLink}
                  to={`/gardes/${g.id}`}
                  sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', justifyContent: 'space-between', p: 2, color: 'inherit', textDecoration: 'none', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <Box sx={{ display: 'grid', gap: 0.25 }}>
                    <Typography variant="subtitle2">{g.class.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDateTime(g.timestamps.createdAt)}
                      {g.timestamps.presenceAt && ` · en classe à ${formatTime(g.timestamps.presenceAt)}`}
                      {g.durationMinutes !== null && ` · ${formatDuration(g.durationMinutes)}`}
                    </Typography>
                  </Box>
                  <CoverageStatusBadge status={g.status} />
                </Box>
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}
      {releases.length > 0 && (
        <SectionCard title="Désistements et libérations" flush>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {releases.map((r) => (
              <Box component="li" key={r.id} sx={{ p: 2, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
                <Typography variant="subtitle2">{r.class?.name ?? r.reference}</Typography>
                <Typography variant="caption" color="text.secondary">
                  <RelativeTime value={r.at} /> · {r.byManager ? 'Libéré par un responsable' : 'Désistement'}
                  {r.reason && ` : ${r.reason}`}
                </Typography>
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}
    </Box>
  );
}
