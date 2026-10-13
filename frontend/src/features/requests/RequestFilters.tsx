import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import { ListFilter, Search, Tag, UserRound, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import type { Priority, RequestStatus } from '../../api/types';
import { visuallyHidden } from '../../components/a11y';
import { fieldIcon } from '../../components/fieldIcon';
import { PRIORITY_LABELS } from '../../components/PriorityBadge';
import { STATUS_LABELS } from '../../components/StatusBadge';
import { icon } from '../../design/tokens';
import { useCategories, useRecipients } from './api';
import { activeFilterCount, type RequestFilters as Filters } from './filters';

interface RequestFiltersProps {
  value: Filters;
  onChange: (filters: Filters) => void;
}

const EMPTY: Filters = { q: '', statuses: [], priorities: [], categoryId: '', assigneeId: '', from: '', to: '', overdue: false };

/** Barre de recherche toujours visible, filtres détaillés repliables (FR-034). */
export function RequestFilters({ value, onChange }: RequestFiltersProps) {
  const hintId = useId();
  const active = activeFilterCount(value);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState(value.q);
  const categories = useCategories();
  const recipients = useRecipients(expanded && value.categoryId ? value.categoryId : null);
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    set({ q: search.trim() });
  }

  const summary = active > 0 ? `Filtres (${active} actif${active > 1 ? 's' : ''})` : 'Filtres';

  return (
    <Box sx={{ mb: 2, display: 'grid', gap: 1.5 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <Box component="form" role="search" onSubmit={submitSearch} sx={{ flex: '1 1 240px', minWidth: 0 }}>
          <TextField
            id="filtre-recherche"
            placeholder="Rechercher dans les titres…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            slotProps={{
              htmlInput: { maxLength: 120, 'aria-label': 'Rechercher dans les titres', 'aria-describedby': hintId },
              input: fieldIcon(Search),
            }}
          />
          <Box component="span" id={hintId} sx={visuallyHidden}>
            Validez avec la touche Entrée.
          </Box>
        </Box>
        <Button
          variant="outlined"
          startIcon={<ListFilter size={icon.sm} aria-hidden="true" />}
          aria-expanded={expanded}
          aria-controls="filtres-contenu"
          onClick={() => setExpanded((v) => !v)}
          sx={expanded ? { bgcolor: 'action.hover' } : undefined}
        >
          {summary}
        </Button>
        {active > 0 && (
          <Button
            startIcon={<X size={icon.sm} aria-hidden="true" />}
            onClick={() => {
              setSearch('');
              onChange(EMPTY);
            }}
          >
            Réinitialiser les filtres
          </Button>
        )}
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <Paper variant="outlined" id="filtres-contenu" sx={{ p: 2, borderRadius: 1 }}>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' },
            }}
          >
            <TextField
              select
              id="filtre-statut"
              label="Statut"
              size="small"
              value={value.statuses}
              onChange={(e) => set({ statuses: e.target.value as unknown as string[] })}
              slotProps={{
                select: {
                  multiple: true,
                  renderValue: (s) => (s as RequestStatus[]).map((v) => STATUS_LABELS[v]).join(', '),
                },
              }}
            >
              {(Object.keys(STATUS_LABELS) as RequestStatus[]).map((s) => (
                <MenuItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              id="filtre-priorite"
              label="Priorité"
              size="small"
              value={value.priorities}
              onChange={(e) => set({ priorities: e.target.value as unknown as string[] })}
              slotProps={{
                select: {
                  multiple: true,
                  renderValue: (s) => (s as Priority[]).map((v) => PRIORITY_LABELS[v]).join(', '),
                },
              }}
            >
              {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                <MenuItem key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              id="filtre-categorie"
              label="Catégorie"
              size="small"
              value={value.categoryId}
              onChange={(e) => set({ categoryId: e.target.value, assigneeId: '' })}
              slotProps={{ input: fieldIcon(Tag) }}
            >
              <MenuItem value="">Toutes</MenuItem>
              {(categories.data ?? []).map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            {value.categoryId && (
              <TextField
                select
                id="filtre-destinataire"
                label="Destinataire"
                size="small"
                value={value.assigneeId}
                onChange={(e) => set({ assigneeId: e.target.value })}
                slotProps={{ input: fieldIcon(UserRound) }}
              >
                <MenuItem value="">Tous</MenuItem>
                {(recipients.data ?? []).map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.displayName}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              id="filtre-du"
              label="Du"
              type="date"
              size="small"
              value={value.from}
              onChange={(e) => set({ from: e.target.value })}
            />
            <TextField
              id="filtre-au"
              label="Au"
              type="date"
              size="small"
              value={value.to}
              onChange={(e) => set({ to: e.target.value })}
            />
            <FormControlLabel
              sx={{ alignSelf: 'end', minHeight: 40 }}
              control={<Checkbox checked={value.overdue} onChange={(e) => set({ overdue: e.target.checked })} />}
              label="En retard uniquement"
            />
          </Box>
        </Paper>
      </Collapse>
    </Box>
  );
}
