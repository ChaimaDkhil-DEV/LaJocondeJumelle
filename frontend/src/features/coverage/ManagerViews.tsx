import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { AlarmClock, School, UsersRound } from 'lucide-react';
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
import { AVAILABILITY_LABELS, CoverageDeadline, CoverageStatusBadge, Elapsed, TYPE_LABELS, UNAVAILABLE_REASONS, formatStart } from './labels';
import type { Availability, CoverageSummary } from './types';

/** Temps écoulé pertinent selon l'étape : depuis la création, l'assignation ou la présence. */
function stageElapsed(c: CoverageSummary) {
  const t = c.timestamps;
  if (c.mainStatus === 'PENDING') return <Elapsed since={t.createdAt} prefix="En attente depuis" />;
  if (c.mainStatus === 'ASSIGNED' && t.acceptedAt) return <Elapsed since={t.acceptedAt} prefix="Assignée il y a" />;
  if (c.mainStatus === 'IN_PROGRESS' && t.presenceAt) return <Elapsed since={t.presenceAt} prefix="En classe depuis" />;
  return <span>{formatDateTime(t.createdAt)}</span>;
}

/** Ligne d'affectation (file de l'admin, tableau du super administrateur). */
export function CoverageRow({ item }: { item: CoverageSummary }) {
  const takeoverExpired = item.alerts.includes('TAKEOVER_EXPIRED');
  const alert = takeoverExpired || item.subState === 'LATE' || item.subState === 'RELIEF_PENDING' || item.mainStatus === 'UNFILLED';
  const teacher = item.teacher?.displayName ?? item.absentTeacher;
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
          {item.type && (
            <Typography variant="caption" color="text.secondary">
              {TYPE_LABELS[item.type]}
            </Typography>
          )}
          {item.reliefForId && (
            <Typography variant="caption" color="text.secondary">
              (relève)
            </Typography>
          )}
        </Box>
        <Typography variant="caption" color="text.secondary" noWrap>
          {[item.class.room, item.floor?.name, formatStart(item.startAt), teacher && `Enseignant : ${teacher}`].filter(Boolean).join(' · ')}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <CoverageStatusBadge mainStatus={item.mainStatus} subState={item.subState} />
        <PriorityBadge priority={item.priority} />
      </Box>
      <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
        {item.assignee ? (
          <Person name={item.assignee.displayName} id={item.assignee.id} size={24} />
        ) : (
          <Typography variant="body2" color="text.secondary">
            Sans surveillant
          </Typography>
        )}
        {item.supports.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            Renfort : {item.supports.map((s) => s.user.displayName).join(', ')}
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'grid', gap: 0.5, justifyItems: { md: 'end' }, fontSize: fontSize.xs, color: 'text.secondary' }}>
        {stageElapsed(item)}
        {takeoverExpired ? (
          <Box component="span" sx={(theme) => ({ display: 'inline-flex', gap: 0.5, alignItems: 'center', color: tokensOf(theme).error.text })}>
            <AlarmClock size={14} aria-hidden="true" />
            <span>Délai d’assignation dépassé</span>
          </Box>
        ) : (
          <CoverageDeadline summary={item} />
        )}
      </Box>
    </Box>
  );
}

export function CoverageRows({ items, empty }: { items: CoverageSummary[]; empty: string }) {
  if (items.length === 0) {
    return (
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
        <EmptyState icon={School} title="Aucune affectation" description={empty} />
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

/** Liste en direct des affectations : en cours (en attente d'abord, délais expirés en tête) ou finales. */
export function ManagedCoverageTab({ finished }: { finished: boolean }) {
  const list = useCoverageList(finished ? 'mainStatus=DONE&mainStatus=CANCELLED&mainStatus=UNFILLED' : '');
  if (list.isPending) return <LoadingState label="Chargement des affectations" />;
  if (list.error) return <ErrorState message="Impossible de charger les affectations." actionLabel="Réessayer" onAction={() => void list.refetch()} />;
  return (
    <CoverageRows
      items={list.data}
      empty={
        finished
          ? 'Les affectations terminées, annulées ou non pourvues apparaîtront ici.'
          : 'Les retards et absences signalés et les classes vides déclarées apparaîtront ici.'
      }
    />
  );
}

/** Équipe : surveillants, étage, disponibilités (y compris « Absent », réservé aux admins) et affectations en cours. */
export function TeamTab() {
  const toast = useToast();
  const team = useTeam();
  const setAvailability = useSetAvailability();
  if (team.isPending) return <LoadingState label="Chargement de l’équipe" />;
  if (team.error) return <ErrorState message="Impossible de charger l’équipe." actionLabel="Réessayer" onAction={() => void team.refetch()} />;
  if (team.data.length === 0) {
    return (
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
        <EmptyState icon={UsersRound} title="Aucun surveillant" description="Le super administrateur compose le groupe Surveillants dans l’administration." />
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
              <Person name={m.displayName} id={m.id} size={32} secondary={m.floor?.name ?? 'Sans étage'} />
              <Typography variant="caption" color={m.available ? 'text.secondary' : 'warning.main'}>
                {m.available ? 'Disponible maintenant' : UNAVAILABLE_REASONS[m.reason ?? 'UNAVAILABLE']}
                {m.guardRequestId && (
                  <>
                    {' · '}
                    <Box component={RouterLink} to={`/gardes/${m.guardRequestId}`} sx={{ color: 'inherit' }}>
                      voir l’affectation
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
