import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ScrollText, SearchX, UserRound } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { fieldIcon } from '../../components/fieldIcon';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { SectionHeader } from '../../components/SectionHeader';
import { UserAvatar } from '../../components/UserAvatar';
import { font, fontSize, tokensOf } from '../../design/tokens';
import { useAdminUsers, useAuditLog, type AuditEntry, type AuditFilters } from './api';
import { AUDIT_ACTION_LABELS } from './labels';

const EMPTY: AuditFilters = { actorId: '', action: '', from: '', to: '' };

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Détails techniques (liste blanche côté serveur : aucun secret ni contenu de message). */
function DetailsSummary({ entry }: { entry: AuditEntry }) {
  const parts = Object.entries(entry.details ?? {}).map(([key, value]) => `${key} : ${formatValue(value)}`);
  if (entry.targetType) parts.unshift(`cible : ${entry.targetType}${entry.targetId ? ` ${entry.targetId}` : ''}`);
  if (entry.ip) parts.push(`IP : ${entry.ip}`);
  if (parts.length === 0) return null;
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, overflowWrap: 'anywhere', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: fontSize.xs }}>
      {parts.join(' · ')}
    </Typography>
  );
}

/** Journal d'audit (FR-030) : consultation seule, filtres par auteur, action et période. */
export function AuditLogPage() {
  const [filters, setFilters] = useState<AuditFilters>(EMPTY);
  const users = useAdminUsers();
  const audit = useAuditLog(filters);
  const set = (patch: Partial<AuditFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const entries = audit.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Box component="section" aria-labelledby="titre-journal">
      <SectionHeader
        id="titre-journal"
        title="Journal d’audit"
        description="Consultation seule : les entrées ne peuvent être ni modifiées ni supprimées."
      />

      <Paper
        variant="outlined"
        sx={{ p: 2, mb: 2, borderRadius: 1, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } }}
      >
        <TextField
          select
          id="journal-auteur"
          label="Auteur"
          size="small"
          value={filters.actorId}
          onChange={(e) => set({ actorId: e.target.value })}
          slotProps={{ input: fieldIcon(UserRound) }}
        >
          <MenuItem value="">Tous</MenuItem>
          {(users.data ?? []).map((u) => (
            <MenuItem key={u.id} value={u.id}>
              {u.displayName}
            </MenuItem>
          ))}
        </TextField>
        <TextField select id="journal-action" label="Action" size="small" value={filters.action} onChange={(e) => set({ action: e.target.value })}>
          <MenuItem value="">Toutes</MenuItem>
          {Object.entries(AUDIT_ACTION_LABELS).map(([action, label]) => (
            <MenuItem key={action} value={action}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          id="journal-du"
          label="Du"
          type="date"
          size="small"
          value={filters.from}
          onChange={(e) => set({ from: e.target.value })}
        />
        <TextField
          id="journal-au"
          label="Au"
          type="date"
          size="small"
          value={filters.to}
          onChange={(e) => set({ to: e.target.value })}
        />
      </Paper>

      {audit.isPending ? (
        <LoadingState label="Chargement du journal" />
      ) : audit.error ? (
        <ErrorState message="Impossible de charger le journal d’audit." actionLabel="Réessayer" onAction={() => void audit.refetch()} />
      ) : entries.length === 0 ? (
        <Paper variant="outlined">
          <EmptyState icon={SearchX} title="Aucune entrée" description="Aucune entrée ne correspond à ces filtres." />
        </Paper>
      ) : (
        <>
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box
              component="ul"
              aria-label="Entrées du journal"
              sx={{ listStyle: 'none', m: 0, p: 0, '& > li + li': { borderTop: 1, borderColor: 'divider' } }}
            >
              {entries.map((entry) => (
                <Box component="li" key={entry.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', px: { xs: 2, md: 2.5 }, py: 1.5 }}>
                  {entry.actor ? (
                    <UserAvatar name={entry.actor.displayName} id={entry.actor.id} size={28} />
                  ) : (
                    <Box
                      aria-hidden="true"
                      sx={(theme) => ({
                        width: 28,
                        height: 28,
                        flex: 'none',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: tokensOf(theme).surfaceMuted,
                        color: tokensOf(theme).textSecondary,
                      })}
                    >
                      <ScrollText size={14} />
                    </Box>
                  )}
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: font.medium }}>
                      {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {entry.actor ? entry.actor.displayName : 'Anonyme'} · <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                    </Typography>
                    <DetailsSummary entry={entry} />
                  </Box>
                </Box>
              ))}
            </Box>
          </Paper>
          {audit.hasNextPage && (
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Button variant="outlined" loading={audit.isFetchingNextPage} onClick={() => void audit.fetchNextPage()}>
                Afficher plus d’entrées
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
