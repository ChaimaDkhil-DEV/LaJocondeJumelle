import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { ApiError, apiFetch } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { adminKeys, useAdminCategories, type AdminCategory, type DeadlineRule } from './api';
import { CategoryFormDialog } from './CategoryFormDialog';
import { DeadlineRulesTable, fromDraft, toDraft, type DeadlineDraft, type DeadlineErrors } from './DeadlineRulesTable';
import { CIRCUIT_LABELS, CLOSURE_LABELS } from './labels';

function names(members: Array<{ displayName: string }>): string {
  return members.length > 0 ? members.map((m) => m.displayName).join(', ') : 'aucun';
}

function DeadlinesDialog({ category, onClose, onSaved }: { category: AdminCategory | null; onClose: () => void; onSaved: (message: string) => void }) {
  const titleId = useId();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DeadlineDraft>(() => toDraft(category?.deadlineRules ?? []));
  const [errors, setErrors] = useState<DeadlineErrors>({});

  const mutation = useMutation({
    mutationFn: (rules: DeadlineRule[]) =>
      apiFetch<DeadlineRule[]>(`/api/admin/categories/${category!.id}/deadlines`, { method: 'PUT', body: { rules } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.categories });
      onSaved('Délais enregistrés. Ils s’appliquent aux demandes créées à partir de maintenant.');
    },
  });

  function save(): void {
    if (!category) return;
    const { rules, errors: found } = fromDraft(draft, category.circuit);
    setErrors(found);
    if (Object.keys(found).length === 0) mutation.mutate(rules);
  }

  return (
    <Dialog
      open={category !== null}
      onClose={onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="md"
      slotProps={{
        transition: {
          onEnter: () => {
            setDraft(toDraft(category?.deadlineRules ?? []));
            setErrors({});
            mutation.reset();
          },
        },
      }}
    >
      <DialogTitle id={titleId}>Délais : {category?.name}</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2 }} color="text.secondary">
          Durées en minutes ; laissez vide pour ne fixer aucun délai. Les demandes déjà créées gardent leurs délais.
        </Typography>
        {category && <DeadlineRulesTable circuit={category.circuit} value={draft} errors={errors} onChange={setDraft} />}
        {mutation.error && (
          <Alert severity="error" role="alert" sx={{ mt: 2 }}>
            {mutation.error instanceof ApiError ? mutation.error.message : 'Enregistrement impossible.'}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annuler</Button>
        <Button variant="contained" loading={mutation.isPending} onClick={save}>
          Enregistrer les délais
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Catégories (US8) : circuit, modes, photo, destinataires, responsables et délais. */
export function CategoriesAdminPage() {
  const categories = useAdminCategories();
  const [form, setForm] = useState<{ category: AdminCategory | null } | null>(null);
  const [deadlines, setDeadlines] = useState<AdminCategory | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <Box component="section" aria-labelledby="titre-categories">
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2 }}>
        <Typography id="titre-categories" component="h2" variant="h6">
          Catégories
        </Typography>
        <Button variant="contained" onClick={() => setForm({ category: null })}>
          Nouvelle catégorie
        </Button>
      </Box>

      {feedback && (
        <Alert severity="success" role="status" onClose={() => setFeedback(null)} sx={{ mb: 2 }}>
          {feedback}
        </Alert>
      )}

      {categories.isPending ? (
        <LoadingState label="Chargement des catégories" />
      ) : categories.error ? (
        <ErrorState message="Impossible de charger les catégories." actionLabel="Réessayer" onAction={() => void categories.refetch()} />
      ) : (
        <Box component="ul" aria-label="Catégories" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
          {categories.data.map((category) => (
            <Paper component="li" key={category.id} variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{category.name}</Typography>
                <Chip size="small" label={category.circuit === 'A_DIRECT' ? 'Circuit A' : 'Circuit B'} />
                {!category.active && <Chip size="small" label="Inactive" />}
                {category.photoRequired && <Chip size="small" color="info" label="Photo obligatoire" />}
              </Box>
              <Typography variant="body2" color="text.secondary">
                {CIRCUIT_LABELS[category.circuit]} · Clôture : {CLOSURE_LABELS[category.closureMode].toLowerCase()}
                {category.finalValidation ? ' · validation finale' : ''}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                Destinataires : {names(category.recipients)} · Responsables : {names(category.managers)}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                <Button size="small" variant="outlined" aria-label={`Modifier la catégorie ${category.name}`} onClick={() => setForm({ category })}>
                  Modifier
                </Button>
                <Button size="small" variant="outlined" aria-label={`Délais de ${category.name}`} onClick={() => setDeadlines(category)}>
                  Délais
                </Button>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      <CategoryFormDialog
        open={form !== null}
        category={form?.category}
        onClose={() => setForm(null)}
        onSaved={(message) => {
          setForm(null);
          setFeedback(message);
        }}
      />
      <DeadlinesDialog
        category={deadlines}
        onClose={() => setDeadlines(null)}
        onSaved={(message) => {
          setDeadlines(null);
          setFeedback(message);
        }}
      />
    </Box>
  );
}
