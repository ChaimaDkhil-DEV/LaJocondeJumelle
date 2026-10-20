import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { Building2, Clock, DoorOpen, History, MapPin, Mic, NotebookText, Tag, Timer, UserRound } from 'lucide-react';
import { Link as RouterLink } from 'react-router';
import { ApiError } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PriorityBadge } from '../../components/PriorityBadge';
import { SectionCard } from '../../components/SectionCard';
import { useToast } from '../../components/Toast';
import { formatDateTime } from '../../components/format';
import { font, fontSize, icon, tokensOf } from '../../design/tokens';
import { VoicePlayer } from '../voice/VoicePlayer';
import { useCoverageHistory, useMyGuards, useSetOwnAvailability } from './api';
import { CoverageActions } from './CoverageActions';
import { AVAILABILITY_LABELS, CoverageDeadline, CoverageStatusBadge, Elapsed, TYPE_LABELS, formatDuration, formatStart, formatTime } from './labels';
import type { CoverageProfile, CoverageSummary } from './types';

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

/** Carte d'une classe : nom très lisible, statut, type, salle, étage, début, durée et enseignant. */
export function ClassHeading({ summary, level = 3 }: { summary: CoverageSummary; level?: 2 | 3 }) {
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography component={`h${level}`} sx={{ fontSize: fontSize.lg, fontWeight: font.medium, lineHeight: 1.3 }}>
          {summary.class.name}
        </Typography>
        <PriorityBadge priority={summary.priority} />
        <CoverageStatusBadge mainStatus={summary.mainStatus} subState={summary.subState} />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.75 }}>
        {summary.type && <Fact icon={Tag}>{TYPE_LABELS[summary.type]}</Fact>}
        {summary.class.room && <Fact icon={MapPin}>{summary.class.room}</Fact>}
        {summary.floor && <Fact icon={Building2}>{summary.floor.name}</Fact>}
        <Fact icon={Clock}>{formatStart(summary.startAt)}</Fact>
        <Fact icon={Timer}>{formatDuration(summary.estimatedMinutes)}</Fact>
        {(summary.teacher || summary.absentTeacher) && (
          <Fact icon={UserRound}>Remplace {summary.teacher?.displayName ?? summary.absentTeacher}</Fact>
        )}
        {summary.hasNote && <Fact icon={NotebookText}>Consigne</Fact>}
        {summary.hasVoice && <Fact icon={Mic}>Message vocal</Fact>}
      </Box>
    </Box>
  );
}

/** Interrupteur de disponibilité ; « Absent » ne peut être levé que par un admin. */
export function AvailabilitySwitch({ profile }: { profile: CoverageProfile }) {
  const toast = useToast();
  const mutation = useSetOwnAvailability();
  if (profile.availability === 'ABSENT') {
    return (
      <Alert severity="info">Vous êtes déclaré absent. Seul un admin peut modifier ce statut.</Alert>
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
      label={available ? 'Je suis disponible pour les affectations' : 'Je suis indisponible'}
    />
  );
}

/** Onglet « Mes affectations » : affectations et renforts du surveillant, chronomètre et actions. */
export function MyGuardTab() {
  const mine = useMyGuards();
  if (mine.isPending) return <LoadingState label="Chargement de vos affectations" variant="detail" />;
  if (mine.error) return <ErrorState message="Impossible de charger vos affectations." actionLabel="Réessayer" onAction={() => void mine.refetch()} />;
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <AvailabilitySwitch profile={mine.data.availability} />
      {mine.data.items.length === 0 && (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
          <EmptyState icon={DoorOpen} title="Aucune affectation en cours" description="Quand l’admin vous assigne une classe, elle apparaît ici avec les étapes à suivre." />
        </Box>
      )}
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
              <Elapsed since={guard.timestamps.acceptedAt} prefix="Assignée il y a" />
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
          {guard.view === 'SUPERVISOR' && guard.supports.length > 0 && guard.allowedActions.length === 0 && (
            <Alert severity="info">Vous êtes en renfort dans cette classe jusqu’à la décision de l’admin.</Alert>
          )}
          {guard.status === 'DONE' && <Alert severity="info">Affectation terminée, en attente de validation par l’admin.</Alert>}
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

/** Onglet « Historique » : affectations effectuées ou annulées. */
export function PersonalHistoryTab() {
  const history = useCoverageHistory();
  if (history.isPending) return <LoadingState label="Chargement de l’historique" />;
  if (history.error) return <ErrorState message="Impossible de charger l’historique." actionLabel="Réessayer" onAction={() => void history.refetch()} />;
  const { guards } = history.data;
  if (guards.length === 0) {
    return (
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
        <EmptyState icon={History} title="Aucune affectation pour l’instant" description="Vos affectations terminées ou annulées apparaîtront ici." />
      </Box>
    );
  }
  return (
    <SectionCard title="Mes affectations" icon={History} flush>
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
              <CoverageStatusBadge mainStatus={g.mainStatus} subState={g.subState} />
            </Box>
          </Box>
        ))}
      </Box>
    </SectionCard>
  );
}
