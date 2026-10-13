import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
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
    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere', fontFamily: 'monospace', fontSize: '0.8rem' }}>
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
      <Typography id="titre-journal" component="h2" variant="h6" gutterBottom>
        Journal d’audit
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Consultation seule : les entrées ne peuvent être ni modifiées ni supprimées.
      </Typography>

      <Box sx={{ display: 'grid', gap: 2, mb: 3, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
        <TextField select id="journal-auteur" label="Auteur" value={filters.actorId} onChange={(e) => set({ actorId: e.target.value })}>
          <MenuItem value="">Tous</MenuItem>
          {(users.data ?? []).map((u) => (
            <MenuItem key={u.id} value={u.id}>
              {u.displayName}
            </MenuItem>
          ))}
        </TextField>
        <TextField select id="journal-action" label="Action" value={filters.action} onChange={(e) => set({ action: e.target.value })}>
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
          value={filters.from}
          onChange={(e) => set({ from: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          id="journal-au"
          label="Au"
          type="date"
          value={filters.to}
          onChange={(e) => set({ to: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>

      {audit.isPending ? (
        <LoadingState label="Chargement du journal" />
      ) : audit.error ? (
        <ErrorState message="Impossible de charger le journal d’audit." actionLabel="Réessayer" onAction={() => void audit.refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState title="Aucune entrée" description="Aucune entrée ne correspond à ces filtres." />
      ) : (
        <>
          <Box component="ul" aria-label="Entrées du journal" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
            {entries.map((entry) => (
              <Paper component="li" key={entry.id} variant="outlined" sx={{ p: 1.5 }}>
                <Typography sx={{ fontWeight: 600 }}>{AUDIT_ACTION_LABELS[entry.action] ?? entry.action}</Typography>
                <Typography variant="body2">
                  {entry.actor ? entry.actor.displayName : 'Anonyme'} · <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                </Typography>
                <DetailsSummary entry={entry} />
              </Paper>
            ))}
          </Box>
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
