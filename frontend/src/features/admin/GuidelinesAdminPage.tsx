import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CircleCheck, CircleOff, Pencil, Power, PowerOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { Badge } from '../../components/Badge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { IconAction } from '../../components/IconAction';
import { LoadingState } from '../../components/LoadingState';
import { SectionHeader } from '../../components/SectionHeader';
import { useToast } from '../../components/Toast';
import { font, icon } from '../../design/tokens';
import { t } from '../../i18n';
import { adminKeys, deleteGuideline, saveGuideline, useAdminGuidelines, type AdminGuideline } from './api';
import { GuidelineFormDialog } from './GuidelineFormDialog';

/** Consignes (spec 009, US3) : règles utilisées pour les propositions automatiques. */
export function GuidelinesAdminPage() {
  const guidelines = useAdminGuidelines();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{ guideline: AdminGuideline | null } | null>(null);
  const [toDelete, setToDelete] = useState<AdminGuideline | null>(null);
  const toast = useToast();

  const toggle = useMutation({
    mutationFn: (g: AdminGuideline) => saveGuideline(g.id, { active: !g.active }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.guidelines });
      toast.success(saved.active ? t('Consigne activée.') : t('Consigne désactivée.'));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t('Enregistrement impossible.')),
  });

  const remove = useMutation({
    mutationFn: (g: AdminGuideline) => deleteGuideline(g.id),
    onSuccess: async () => {
      setToDelete(null);
      await queryClient.invalidateQueries({ queryKey: adminKeys.guidelines });
      toast.success(t('Consigne supprimée.'));
    },
  });

  return (
    <Box component="section" aria-labelledby="titre-consignes">
      <SectionHeader
        id="titre-consignes"
        title={t('Consignes')}
        description={t('Règles de classement, critères de priorité et procédures utilisés pour les propositions automatiques.')}
        action={
          <Button variant="contained" startIcon={<BookOpen size={icon.sm} aria-hidden="true" />} onClick={() => setForm({ guideline: null })}>
            {t('Nouvelle consigne')}
          </Button>
        }
      />

      {guidelines.isPending ? (
        <LoadingState label={t('Chargement des consignes')} />
      ) : guidelines.error ? (
        <ErrorState message={t('Impossible de charger les consignes.')} actionLabel={t('Réessayer')} onAction={() => void guidelines.refetch()} />
      ) : guidelines.data.length === 0 ? (
        <Paper variant="outlined">
          <EmptyState title={t('Aucune consigne.')} description={t('Créez une consigne, par exemple « Panne de photocopieuse : Priorité : Haute ».')} />
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box component="ul" aria-label={t('Consignes')} sx={{ listStyle: 'none', m: 0, p: 0, '& > li + li': { borderTop: 1, borderColor: 'divider' } }}>
            {guidelines.data.map((guideline) => (
              <Box
                component="li"
                key={guideline.id}
                sx={{ display: 'flex', flexWrap: { xs: 'wrap', sm: 'nowrap' }, alignItems: 'flex-start', gap: 2, px: { xs: 2, md: 2.5 }, py: 2 }}
              >
                <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontWeight: font.medium, overflowWrap: 'anywhere' }}>{guideline.title}</Typography>
                    {guideline.active ? (
                      <Badge tone="success" icon={CircleCheck}>
                        {t('Active')}
                      </Badge>
                    ) : (
                      <Badge tone="neutral" icon={CircleOff}>
                        {t('Inactive')}
                      </Badge>
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
                    {t('Portée :')} <span>{guideline.categoryName ?? t('Générale')}</span>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('Modifiée le')} <time dateTime={guideline.updatedAt}>{formatDateTime(guideline.updatedAt)}</time>{' '}
                    {t('par {name}', { name: guideline.updatedBy.displayName })}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flex: 'none', ml: 'auto' }}>
                  <IconAction icon={Pencil} label={t('Modifier la consigne {title}', { title: guideline.title })} tooltip={t('Modifier')} onClick={() => setForm({ guideline })} />
                  <IconAction
                    icon={guideline.active ? PowerOff : Power}
                    label={
                      guideline.active
                        ? t('Désactiver la consigne {title}', { title: guideline.title })
                        : t('Activer la consigne {title}', { title: guideline.title })
                    }
                    tooltip={guideline.active ? t('Désactiver') : t('Activer')}
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate(guideline)}
                  />
                  <IconAction icon={Trash2} label={t('Supprimer la consigne {title}', { title: guideline.title })} tooltip={t('Supprimer')} onClick={() => setToDelete(guideline)} />
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      <GuidelineFormDialog
        open={form !== null}
        guideline={form?.guideline}
        onClose={() => setForm(null)}
        onSaved={(message) => {
          setForm(null);
          toast.success(message);
        }}
      />
      <ConfirmDialog
        open={toDelete !== null}
        title={t('Supprimer cette consigne ?')}
        confirmLabel={t('Supprimer la consigne')}
        pending={remove.isPending}
        error={remove.error instanceof ApiError ? remove.error.message : remove.error ? t('Suppression impossible.') : null}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onClose={() => {
          setToDelete(null);
          remove.reset();
        }}
      >
        {t('« {title} » ne sera plus utilisée pour les propositions automatiques. Les demandes déjà envoyées ne changent pas.', { title: toDelete?.title ?? '' })}
      </ConfirmDialog>
    </Box>
  );
}
