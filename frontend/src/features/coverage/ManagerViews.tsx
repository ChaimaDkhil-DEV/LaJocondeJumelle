import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { School, UsersRound } from 'lucide-react';
import { Link as RouterLink } from 'react-router';
import { ApiError } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PriorityBadge } from '../../components/PriorityBadge';
import { SectionCard } from '../../components/SectionCard';
import { useToast } from '../../components/Toast';
import { Person } from '../../components/UserAvatar';
import { formatDateTime } from '../../components/format';
import { fontSize, tokensOf } from '../../design/tokens';
import { useCoverageList, useSetAvailability, useTeam } from './api';
import { AVAILABILITY_LABELS, CoverageDeadline, CoverageStatusBadge, Elapsed, UNAVAILABLE_REASONS, formatStart } from './labels';
import type { Availability, CoverageSummary } from './types';

/** Temps écoulé pertinent selon l'étape : depuis la diffusion, l'acceptation ou la présence. */
function stageElapsed(c: CoverageSummary) {
  const t = c.timestamps;
  if (['BROADCAST', 'UNFILLED'].includes(c.status) && t.broadcastAt) return <Elapsed since={t.broadcastAt} prefix="Diffusée il y a" />;
  if (['ACCEPTED', 'EN_ROUTE', 'LATE'].includes(c.status) && t.acceptedAt) return <Elapsed since={t.acceptedAt} prefix="Prise il y a" />;
  if (['ON_DUTY', 'RELIEF_PENDING'].includes(c.status) && t.presenceAt) return <Elapsed since={t.presenceAt} prefix="En classe depuis" />;
  return <span>{formatDateTime(t.createdAt)}</span>;
}

/** Ligne de couverture (liste des responsables, tableau du super administrateur). */
export function CoverageRow({ item }: { item: CoverageSummary }) {
  const alert = item.status === 'LATE' || item.status === 'UNFILLED' || item.overdueStage !== null || item.status === 'RELIEF_PENDING';
  return (
    <Box
      component={RouterLink}
      to={`/gardes/${item.id}`}
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1.2fr) auto' },
        gap: { xs: 1, md: 2 },
        alignItems: 'center',
        p: 2,
        color: 'inherit',
        textDecoration: 'none',
        borderLeft: `3px solid ${alert ? tokensOf(theme).error.main : 'transparent'}`,
        '&:hover': { bgcolor: 'action.hover' },
      })}
    >
      <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle2" noWrap>
            {item.class.name}
          </Typography>
          {item.reliefForId && (
            <Typography variant="caption" color="text.secondary">
              (relève)
            </Typography>
          )}
        </Box>
        <Typography variant="caption" color="text.secondary" noWrap>
          {[item.class.room, formatStart(item.startAt), item.groups.map((g) => g.name).join(', ')].filter(Boolean).join(' · ')}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <CoverageStatusBadge status={item.status} />
        <PriorityBadge priority={item.priority} />
      </Box>
      <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
        {item.assignee ? <Person name={item.assignee.displayName} id={item.assignee.id} size={24} /> : <Typography variant="body2" color="text.secondary">Sans preneur</Typography>}
      </Box>
      <Box sx={{ display: 'grid', gap: 0.5, justifyItems: { md: 'end' }, fontSize: fontSize.xs, color: 'text.secondary' }}>
        {stageElapsed(item)}
        <CoverageDeadline summary={item} />
      </Box>
    </Box>
  );
}

export function CoverageRows({ items, empty }: { items: CoverageSummary[]; empty: string }) {
  if (items.length === 0) {
    return (
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
        <EmptyState icon={School} title="Aucune demande de couverture" description={empty} />
      </Box>
    );
  }
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper', overflow: 'hidden' }}>
      {items.map((item) => (
        <Box component="li" key={item.id} sx={{ borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
          <CoverageRow item={item} />
        </Box>
      ))}
    </Box>
  );
}

/** Liste en direct des couvertures gérées (en cours ou terminées). */
export function ManagedCoverageTab({ finished }: { finished: boolean }) {
  const list = useCoverageList(finished ? 'status=CLOSED&status=CANCELLED' : '');
  if (list.isPending) return <LoadingState label="Chargement des demandes de couverture" />;
  if (list.error) return <ErrorState message="Impossible de charger les demandes de couverture." actionLabel="Réessayer" onAction={() => void list.refetch()} />;
  return (
    <CoverageRows
      items={list.data}
      empty={finished ? 'Les gardes clôturées et annulées apparaîtront ici.' : 'Diffusez une demande quand une enseignante est absente ou en retard.'}
    />
  );
}

/** Équipe : disponibilités (y compris « Absent », réservé aux responsables) et gardes en cours. */
export function TeamTab() {
  const toast = useToast();
  const team = useTeam();
  const setAvailability = useSetAvailability();
  if (team.isPending) return <LoadingState label="Chargement de l’équipe" />;
  if (team.error) return <ErrorState message="Impossible de charger l’équipe." actionLabel="Réessayer" onAction={() => void team.refetch()} />;
  if (team.data.length === 0) {
    return (
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
        <EmptyState icon={UsersRound} title="Aucun employé dans les groupes" description="Le super administrateur compose les groupes de remplacement dans l’administration." />
      </Box>
    );
  }
  return (
    <SectionCard title="Disponibilités" icon={UsersRound} flush>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {team.data.map((m) => (
          <Box
            component="li"
            key={m.id}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) 200px' },
              gap: 1.5,
              alignItems: 'center',
              p: 2,
              borderTop: 1,
              borderColor: 'divider',
              '&:first-of-type': { borderTop: 0 },
            }}
          >
            <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
              <Person name={m.displayName} id={m.id} size={32} secondary={m.groups.map((g) => g.name).join(', ')} />
              <Typography variant="caption" color={m.available ? 'text.secondary' : 'warning.main'}>
                {m.available ? 'Disponible maintenant' : UNAVAILABLE_REASONS[m.reason ?? 'UNAVAILABLE']}
                {m.guardRequestId && (
                  <>
                    {' · '}
                    <Box component={RouterLink} to={`/gardes/${m.guardRequestId}`} sx={{ color: 'inherit' }}>
                      voir la garde
                    </Box>
                  </>
                )}
              </Typography>
            </Box>
            <TextField
              select
              size="small"
              label={`Statut de ${m.displayName}`}
              value={m.availability}
              disabled={setAvailability.isPending}
              onChange={(e) =>
                setAvailability.mutate(
                  { userId: m.id, availability: e.target.value as Availability },
                  {
                    onSuccess: () => toast.success(`${m.displayName} : ${AVAILABILITY_LABELS[e.target.value as Availability].toLowerCase()}.`),
                    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Modification impossible.'),
                  },
                )
              }
            >
              {(Object.keys(AVAILABILITY_LABELS) as Availability[]).map((a) => (
                <MenuItem key={a} value={a}>
                  {AVAILABILITY_LABELS[a]}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        ))}
      </Box>
    </SectionCard>
  );
}
