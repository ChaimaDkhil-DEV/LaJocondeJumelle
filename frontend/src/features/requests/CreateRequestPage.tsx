import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import GlobalStyles from '@mui/material/GlobalStyles';
import { FilePen, Send } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { tokensOf } from '../../design/tokens';
import { AssistNote, similarRequestsSlot, useAssist } from '../assist/AssistPanel';
import { saveToOutbox } from '../outbox/outbox';
import { useClientSettings } from '../../api/settings';
import { OUTBOX_KEY } from '../outbox/useOutbox';
import {
  isRetryableError,
  requestKeys,
  saveDraft,
  submitRequest,
  useCategories,
  type NewRequestInput,
} from './api';
import { RequestFields, useRequestForm } from './RequestForm';
import type { CategoryOption } from './types';

/** Largeur de la carte (maquette « Voix d'abord »). */
const CARD_WIDTH = 640;
/** Mobile : hauteur du bouton d'envoi fixé en bas de l'écran, avec ses marges. */
const SEND_BAR_SPACE = 88;

const header = (
  <PageHeader
    compact
    title="Nouvelle demande"
    description="Parlez, on remplit le reste."
    back={{ to: '/demandes', label: 'Retour aux demandes' }}
  />
);

export function CreateRequestPage() {
  const categories = useCategories();

  if (categories.isPending) return <LoadingState label="Chargement du formulaire" variant="form" />;
  if (categories.error) {
    return (
      <ErrorState
        message="Impossible de charger les catégories."
        actionLabel="Réessayer"
        onAction={() => void categories.refetch()}
      />
    );
  }
  return <CreateRequestForm categories={categories.data} />;
}

function CreateRequestForm({ categories }: { categories: CategoryOption[] }) {
  const navigate = useNavigate();
  const { voiceMaxSeconds, draftsEnabled } = useClientSettings();
  const queryClient = useQueryClient();
  const toast = useToast();
  const clientId = useRef(crypto.randomUUID());
  const form = useRequestForm(categories);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'send' | 'draft' | null>(null);
  const [assistToken, setAssistToken] = useState<string | null>(null);
  const assist = useAssist(form, setAssistToken);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitError(null);
    const { category, priority, voice, description } = form;
    if (!form.validate('send', Boolean(voice || description.trim())) || !priority || !category) return;

    const input: NewRequestInput = {
      clientId: clientId.current,
      title: form.title.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      categoryId: form.categoryId,
      ...(form.isCircuitA ? { recipientId: form.recipientId } : {}),
      priority,
      ...(voice ? { voice: { blob: voice.blob, mimeType: voice.mimeType, durationSeconds: voice.durationSeconds } } : {}),
      ...(assistToken ? { assistToken } : {}),
    };

    setSubmitting('send');
    try {
      const created = await submitRequest(input);
      await queryClient.invalidateQueries({ queryKey: requestKeys.all });
      toast.success('Votre demande a été envoyée.');
      navigate(`/demandes/${created.id}`);
    } catch (error) {
      if (isRetryableError(error)) {
        await saveToOutbox({
          id: input.clientId,
          savedAt: new Date().toISOString(),
          payload: input,
          categoryName: category.name,
          lastError: error instanceof ApiError ? error.message : 'Envoi impossible.',
        });
        await queryClient.invalidateQueries({ queryKey: OUTBOX_KEY });
        setSubmitError(
          'Votre demande n’a pas pu être envoyée (connexion impossible). Elle est conservée dans la boîte d’envoi : ' +
            'vous pourrez la renvoyer sans la ressaisir depuis la liste des demandes.',
        );
      } else {
        form.applyServerErrors(error);
        setSubmitError(error instanceof ApiError ? error.message : 'Envoi impossible.');
      }
    } finally {
      setSubmitting(null);
    }
  }

  /**
   * Brouillon (spec 007) : catégorie et titre suffisent, priorité « Normale » par défaut. Pas de boîte
   * d'envoi : un échec laisse le formulaire tel quel, avec un message.
   */
  async function handleSaveDraft(): Promise<void> {
    setSubmitError(null);
    const { voice, description } = form;
    if (!form.validate('draft', Boolean(voice || description.trim()))) return;

    const input: NewRequestInput = {
      clientId: clientId.current,
      title: form.title.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      categoryId: form.categoryId,
      ...(form.isCircuitA && form.recipientId ? { recipientId: form.recipientId } : {}),
      priority: form.priority || 'NORMAL',
      ...(voice ? { voice: { blob: voice.blob, mimeType: voice.mimeType, durationSeconds: voice.durationSeconds } } : {}),
    };

    setSubmitting('draft');
    try {
      const draft = await saveDraft(input);
      await queryClient.invalidateQueries({ queryKey: requestKeys.all });
      toast.success('Brouillon enregistré.');
      navigate(`/demandes/${draft.id}/brouillon`);
    } catch (error) {
      form.applyServerErrors(error);
      setSubmitError(
        error instanceof ApiError && !isRetryableError(error)
          ? error.message
          : 'Le brouillon n’a pas pu être enregistré (connexion impossible). Vos saisies sont conservées : réessayez.',
      );
    } finally {
      setSubmitting(null);
    }
  }

  // Maquette « Voix d'abord » : une seule carte centrée ; vocal, titre, champs, puis envoi.
  return (
    <Box sx={{ maxWidth: CARD_WIDTH, mx: 'auto' }}>
      {header}
      <Box component="form" noValidate onSubmit={(e: FormEvent<HTMLFormElement>) => void handleSubmit(e)}>
        <RequestFields
          form={form}
          voiceMaxSeconds={voiceMaxSeconds}
          alert={submitError && <Alert severity="error">{submitError}</Alert>}
          assist={{
            afterVoice: <AssistNote assist={assist} />,
            recipientToConfirm: assist.recipientToConfirm,
            similar: similarRequestsSlot(assist),
          }}
          footer={
            <Box sx={{ display: 'grid', gap: 1, mt: 0.5 }}>
              {/* Mobile : bouton d'envoi fixé en bas de l'écran ; le défilement (clavier compris)
                s'arrête au-dessus, rien de focalisé n'est masqué. */}
              <GlobalStyles styles={(theme) => ({ html: { [theme.breakpoints.down('sm')]: { scrollPaddingBottom: SEND_BAR_SPACE } } })} />
              <Box
                sx={(theme) => ({
                  [theme.breakpoints.down('sm')]: {
                    position: 'fixed',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: theme.zIndex.appBar,
                    px: 2,
                    pt: 1.5,
                    pb: 'calc(12px + env(safe-area-inset-bottom))',
                    bgcolor: 'background.paper',
                    borderTop: `1px solid ${tokensOf(theme).border}`,
                    boxShadow: '0 -4px 16px rgba(35, 42, 89, 0.06)',
                  },
                })}
              >
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  fullWidth
                  loading={submitting === 'send'}
                  disabled={submitting === 'draft'}
                  startIcon={<Send aria-hidden="true" />}
                  sx={{ minHeight: 52 }}
                >
                  Envoyer la demande
                </Button>
              </Box>
              {draftsEnabled && (
                <Button
                  variant="text"
                  color="inherit"
                  loading={submitting === 'draft'}
                  disabled={submitting === 'send'}
                  startIcon={<FilePen size={16} aria-hidden="true" />}
                  onClick={() => void handleSaveDraft()}
                  sx={(theme) => ({ justifySelf: 'center', minHeight: 44, color: tokensOf(theme).textSecondary })}
                >
                  Enregistrer en brouillon
                </Button>
              )}
            </Box>
          }
        />
        {/* Mobile : place pour le bouton d'envoi fixé, sous la carte. */}
        <Box aria-hidden="true" sx={{ display: { xs: 'block', sm: 'none' }, height: SEND_BAR_SPACE }} />
      </Box>
    </Box>
  );
}
