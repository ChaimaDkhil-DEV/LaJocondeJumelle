import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type FormEvent } from 'react';
import type { Priority, RequestStatus } from '../../api/types';
import { PRIORITY_LABELS } from '../../components/PriorityChip';
import { STATUS_LABELS } from '../../components/StatusChip';
import { useCategories, useRecipients } from './api';
import { activeFilterCount, type RequestFilters as Filters } from './filters';

interface RequestFiltersProps {
  value: Filters;
  onChange: (filters: Filters) => void;
}

const EMPTY: Filters = { q: '', statuses: [], priorities: [], categoryId: '', assigneeId: '', from: '', to: '', overdue: false };

/** Recherche et filtres combinés (FR-034), repliables pour les petits écrans. */
export function RequestFilters({ value, onChange }: RequestFiltersProps) {
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
    <Accordion expanded={expanded} onChange={(_e, open) => setExpanded(open)} disableGutters sx={{ mb: 2 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls="filtres-contenu" id="filtres-entete">
        <Typography sx={{ fontWeight: 600 }}>{summary}</Typography>
      </AccordionSummary>
      <AccordionDetails id="filtres-contenu">
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
          }}
        >
          <Box component="form" role="search" onSubmit={submitSearch} sx={{ gridColumn: '1 / -1' }}>
            <TextField
              id="filtre-recherche"
              label="Rechercher dans les titres"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              helperText="Validez avec la touche Entrée."
              slotProps={{ htmlInput: { maxLength: 120 } }}
            />
          </Box>
          <TextField
            select
            id="filtre-statut"
            label="Statut"
            value={value.statuses}
            onChange={(e) => set({ statuses: e.target.value as unknown as string[] })}
            slotProps={{
              select: { multiple: true, renderValue: (s) => (s as RequestStatus[]).map((v) => STATUS_LABELS[v]).join(', ') },
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
            value={value.priorities}
            onChange={(e) => set({ priorities: e.target.value as unknown as string[] })}
            slotProps={{
              select: { multiple: true, renderValue: (s) => (s as Priority[]).map((v) => PRIORITY_LABELS[v]).join(', ') },
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
            value={value.categoryId}
            onChange={(e) => set({ categoryId: e.target.value, assigneeId: '' })}
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
              value={value.assigneeId}
              onChange={(e) => set({ assigneeId: e.target.value })}
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
            value={value.from}
            onChange={(e) => set({ from: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            id="filtre-au"
            label="Au"
            type="date"
            value={value.to}
            onChange={(e) => set({ to: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <FormControlLabel
            control={<Checkbox checked={value.overdue} onChange={(e) => set({ overdue: e.target.checked })} />}
            label="En retard uniquement"
          />
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Button
              onClick={() => {
                setSearch('');
                onChange(EMPTY);
              }}
              disabled={active === 0}
            >
              Réinitialiser les filtres
            </Button>
          </Box>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
