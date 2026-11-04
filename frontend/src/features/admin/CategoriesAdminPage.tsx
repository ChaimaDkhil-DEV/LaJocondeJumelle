import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, CircleOff, FolderPlus, Pencil, Route, School, Timer } from 'lucide-react';
import { useId, useState } from 'react';
import { ApiError, apiFetch } from '../../api/client';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { IconAction } from '../../components/IconAction';
import { LoadingState } from '../../components/LoadingState';
import { SectionHeader } from '../../components/SectionHeader';
import { useToast } from '../../components/Toast';
import { font, icon } from '../../design/tokens';
import { t } from '../../i18n';
import { adminKeys, useAdminCategories, type AdminCategory, type DeadlineRule, type RoutingMode } from './api';
import { CategoryFormDialog } from './CategoryFormDialog';
import { DeadlineRulesTable, fromDraft, toDraft, type DeadlineDraft, type DeadlineErrors } from './DeadlineRulesTable';
import { CLOSURE_LABELS, PROOF_MODE_LABELS, ROUTING_LABELS } from './labels';

function names(members: Array<{ displayName: string }>): string {
  return members.length > 0 ? members.map((m) => m.displayName).join(', ') : t('aucun');
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
      onSaved(t('Délais enregistrés. Ils s’appliquent aux demandes créées à partir de maintenant.'));
    },
  });

  function save(): void {
    if (!category) return;
    const { rules, errors: found } = fromDraft(draft, category.circuit, category.kind);
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
      <DialogTitle id={titleId}>{t('Délais : {name}', { name: category?.name ?? '' })}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }} color="text.secondary">
          {t('Durées en minutes ; laissez vide pour ne fixer aucun délai. Les demandes déjà créées gardent leurs délais.')}
        </Typography>
        {category && <DeadlineRulesTable circuit={category.circuit} kind={category.kind} value={draft} errors={errors} onChange={setDraft} />}
        {mutation.error && (
          <Alert severity="error" role="alert" sx={{ mt: 2 }}>
            {mutation.error instanceof ApiError ? mutation.error.message : t('Enregistrement impossible.')}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Annuler')}</Button>
        <Button variant="contained" loading={mutation.isPending} onClick={save}>
          {t('Enregistrer les délais')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const ROUTING_SHORT: Record<RoutingMode, string> = { VIA_ADMIN: t('Via l’administration'), DIRECT: t('Direct'), PEER: t('Entre enseignants') };

/** Catégories (US8) : mode de routage, clôture, photo, destinataires, admins de la catégorie et délais. */
export function CategoriesAdminPage() {
  const categories = useAdminCategories();
  const [form, setForm] = useState<{ category: AdminCategory | null } | null>(null);
  const [deadlines, setDeadlines] = useState<AdminCategory | null>(null);
  const toast = useToast();

  return (
    <Box component="section" aria-labelledby="titre-categories">
      <SectionHeader
        id="titre-categories"
        title={t('Catégories')}
        description={t('Types de demandes : mode de routage, destinataires, admins de la catégorie et délais.')}
        action={
          <Button variant="contained" startIcon={<FolderPlus size={icon.sm} aria-hidden="true" />} onClick={() => setForm({ category: null })}>
            {t('Nouvelle catégorie')}
          </Button>
        }
      />

      {categories.isPending ? (
        <LoadingState label={t('Chargement des catégories')} />
      ) : categories.error ? (
        <ErrorState message={t('Impossible de charger les catégories.')} actionLabel={t('Réessayer')} onAction={() => void categories.refetch()} />
      ) : categories.data.length === 0 ? (
        <Paper variant="outlined">
          <EmptyState title={t('Aucune catégorie')} description={t('Créez une première catégorie, par exemple « Photocopies ».')} />
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box component="ul" aria-label={t('Catégories')} sx={{ listStyle: 'none', m: 0, p: 0, '& > li + li': { borderTop: 1, borderColor: 'divider' } }}>
            {categories.data.map((category) => (
              <Box
                component="li"
                key={category.id}
                sx={{ display: 'flex', flexWrap: { xs: 'wrap', sm: 'nowrap' }, alignItems: 'flex-start', gap: 2, px: { xs: 2, md: 2.5 }, py: 2 }}
              >
                <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontWeight: font.medium, overflowWrap: 'anywhere' }}>{category.name}</Typography>
                    {category.kind === 'COVERAGE' ? (
                      <Badge tone="accent" icon={School}>
                        {t('Couverture de classe')}
                      </Badge>
                    ) : (
                      <Badge tone={category.routingMode === 'VIA_ADMIN' ? 'accent' : 'neutral'} icon={Route}>
                        {ROUTING_SHORT[category.routingMode]}
                      </Badge>
                    )}
                    {!category.active && (
                      <Badge tone="neutral" icon={CircleOff}>
                        {t('Inactive')}
                      </Badge>
                    )}
                    {category.photoRequired && (
                      <Badge tone="info" icon={Camera}>
                        {t('Photo obligatoire')}
                      </Badge>
                    )}
                  </Box>
                  {category.kind === 'COVERAGE' ? (
                    <>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {t('Preuve de présence : {mode}', { mode: PROOF_MODE_LABELS[category.proofMode].toLowerCase() })}
                        {category.finalValidation ? t(' · validation finale par l’administration') : ''}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                        {t('Admins : {names}', { names: names(category.managers) })}
                      </Typography>
                    </>
                  ) : (
                    <>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {t('{routing} · Clôture : {closure}', {
                          routing: ROUTING_LABELS[category.routingMode],
                          closure: CLOSURE_LABELS[category.closureMode].toLowerCase(),
                        })}
                        {category.finalValidation ? t(' · validation finale') : ''}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                        {t('Destinataires : {recipients} · Admins : {managers}', { recipients: names(category.recipients), managers: names(category.managers) })}
                      </Typography>
                    </>
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flex: 'none', ml: 'auto' }}>
                  <IconAction icon={Pencil} label={t('Modifier la catégorie {name}', { name: category.name })} tooltip={t('Modifier')} onClick={() => setForm({ category })} />
                  <IconAction icon={Timer} label={t('Délais de {name}', { name: category.name })} tooltip={t('Délais')} onClick={() => setDeadlines(category)} />
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      <CategoryFormDialog
        open={form !== null}
        category={form?.category}
        onClose={() => setForm(null)}
        onSaved={(message) => {
          setForm(null);
          toast.success(message);
        }}
      />
      <DeadlinesDialog
        category={deadlines}
        onClose={() => setDeadlines(null)}
        onSaved={(message) => {
          setDeadlines(null);
          toast.success(message);
        }}
      />
    </Box>
  );
}
