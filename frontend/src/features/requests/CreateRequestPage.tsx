import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { FilePen, Send } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { layout } from '../../design/tokens';
import { AssistPanel } from '../assist/AssistPanel';
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

const header = (
  <PageHeader
    title="Nouvelle demande"
    description="Décrivez votre besoin : un message vocal suffit, la description écrite est facultative."
    back={{ to: '/', label: 'Retour aux demandes' }}
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

  return (
    <>
      {header}
      <Box component="form" noValidate onSubmit={(e: FormEvent<HTMLFormElement>) => void handleSubmit(e)} sx={{ maxWidth: layout.readable }}>
        <RequestFields
          form={form}
          voiceMaxSeconds={voiceMaxSeconds}
          alert={submitError && <Alert severity="error">{submitError}</Alert>}
        />
        <AssistPanel form={form} onToken={setAssistToken} />

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'flex-end', gap: 1.5, mt: 2 }}>
          {draftsEnabled && (
            <Button
              variant="outlined"
              size="large"
              loading={submitting === 'draft'}
              disabled={submitting === 'send'}
              startIcon={<FilePen aria-hidden="true" />}
              onClick={() => void handleSaveDraft()}
            >
              Enregistrer en brouillon
            </Button>
          )}
          <Button
            type="submit"
            variant="contained"
            size="large"
            loading={submitting === 'send'}
            disabled={submitting === 'draft'}
            startIcon={<Send aria-hidden="true" />}
          >
            Envoyer la demande
          </Button>
        </Box>
      </Box>
    </>
  );
}
