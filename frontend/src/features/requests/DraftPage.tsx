import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { RefreshCw, Save, Send, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../api/client';
import { useClientSettings } from '../../api/settings';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { layout } from '../../design/tokens';
import { VoicePlayer } from '../voice/VoicePlayer';
import { VoiceRecorder } from '../voice/VoiceRecorder';
import {
  deleteDraft,
  isRetryableError,
  requestKeys,
  submitDraft,
  updateDraft,
  useCategories,
  useRequest,
  type DraftChanges,
} from './api';
import { RequestFields, useRequestForm } from './RequestForm';
import type { CategoryOption, RequestDetail } from './types';

const BACK = { to: '/?onglet=brouillons', label: 'Retour aux demandes' };
const TITLE = 'Brouillon de demande';

/** Reprise d'un brouillon (spec 007) : formulaire de « Nouvelle demande » pré-rempli. */
export function DraftPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const request = useRequest(id);
  const categories = useCategories();

  if (request.isPending || categories.isPending) return <LoadingState label="Chargement du brouillon" variant="form" />;
  if (request.error) {
    const notFound = request.error instanceof ApiError && request.error.status === 404;
    return (
      <>
        <PageHeader title={TITLE} back={BACK} />
        <ErrorState
          message={notFound ? 'Ce brouillon est introuvable ou a déjà été envoyé ou supprimé.' : 'Impossible de charger le brouillon.'}
          actionLabel={notFound ? 'Retour aux demandes' : 'Réessayer'}
          onAction={() => (notFound ? navigate('/') : void request.refetch())}
        />
      </>
    );
  }
  if (categories.error) {
    return (
      <>
        <PageHeader title={TITLE} back={BACK} />
        <ErrorState message="Impossible de charger les catégories." actionLabel="Réessayer" onAction={() => void categories.refetch()} />
      </>
    );
  }
  // Envoyée entre-temps (autre onglet, autre appareil) : sa page habituelle.
  if (request.data.status !== 'DRAFT') return <Navigate to={`/demandes/${id}`} replace />;
  return <DraftForm draft={request.data} categories={categories.data} />;
}

/** Message vocal du brouillon : conservé, en cours de remplacement, ou retiré. */
type VoiceMode = 'kept' | 'replace' | 'removed';

function DraftForm({ draft, categories }: { draft: RequestDetail; categories: CategoryOption[] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { voiceMaxSeconds } = useClientSettings();
  const form = useRequestForm(categories, {
    categoryId: draft.category.id,
    recipientId: draft.assignee?.id ?? '',
    priority: draft.priority,
    title: draft.title,
    description: draft.description ?? '',
  });
  const [voiceMode, setVoiceMode] = useState<VoiceMode>(draft.voice ? 'kept' : 'removed');
  const [busy, setBusy] = useState<'send' | 'save' | 'delete' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const keepsVoice = Boolean(draft.voice) && voiceMode !== 'removed';
  const hasContent = Boolean(form.voice || form.description.trim() || keepsVoice);

  /** Champs modifiés depuis la dernière version enregistrée : seuls ceux-là partent au serveur. */
  function changes(): DraftChanges {
    const next: DraftChanges = {};
    const title = form.title.trim();
    if (title !== draft.title) next.title = title;
    const description = form.description.trim();
    if (description !== (draft.description ?? '')) next.description = description;
    if (form.categoryId !== draft.category.id) next.categoryId = form.categoryId;
    const recipientId = form.isCircuitA ? form.recipientId : '';
    if (recipientId !== (draft.assignee?.id ?? '')) next.recipientId = recipientId || null;
    const priority = form.priority || 'NORMAL';
    if (priority !== draft.priority) next.priority = priority;
    if (form.voice) {
      next.voice = { blob: form.voice.blob, mimeType: form.voice.mimeType, durationSeconds: form.voice.durationSeconds };
    } else if (draft.voice && voiceMode === 'removed') {
      next.voice = null;
    }
    return next;
  }

  /** Enregistre les changements éventuels ; renvoie la version à jour du brouillon. */
  async function persist(): Promise<RequestDetail> {
    const pending = changes();
    if (Object.keys(pending).length === 0) return draft;
    const updated = await updateDraft(draft.id, pending);
    queryClient.setQueryData(requestKeys.detail(draft.id), updated);
    form.setVoice(null);
    setVoiceMode(updated.voice ? 'kept' : 'removed');
    return updated;
  }

  function fail(error: unknown): void {
    // Envoyé ou supprimé ailleurs entre-temps : le brouillon n'existe plus ici.
    if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
      toast.error(error.message);
      navigate('/');
      void queryClient.invalidateQueries({ queryKey: requestKeys.all });
      return;
    }
    form.applyServerErrors(error);
    setSubmitError(
      error instanceof ApiError && !isRetryableError(error)
        ? error.message
        : 'Connexion impossible : rien n’a été perdu, le brouillon reste enregistré. Réessayez.',
    );
  }

  async function handleSave(): Promise<void> {
    setSubmitError(null);
    if (!form.validate('draft', hasContent)) return;
    setBusy('save');
    try {
      await persist();
      toast.success('Brouillon enregistré.');
      void queryClient.invalidateQueries({ queryKey: [...requestKeys.all, 'list'] });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitError(null);
    if (!form.validate('send', hasContent)) return;
    setBusy('send');
    try {
      const saved = await persist();
      const sent = await submitDraft(draft.id, saved.version);
      // Le détail en cache doit être celui de la demande envoyée, sinon il renverrait ici.
      queryClient.setQueryData(requestKeys.detail(draft.id), sent);
      toast.success('Votre demande a été envoyée.');
      navigate(`/demandes/${draft.id}`);
      void queryClient.invalidateQueries({ queryKey: requestKeys.all, refetchType: 'none' });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(): Promise<void> {
    setDeleteError(null);
    setBusy('delete');
    try {
      await deleteDraft(draft.id);
      toast.success('Brouillon supprimé.');
      navigate('/');
      queryClient.removeQueries({ queryKey: requestKeys.detail(draft.id) });
      void queryClient.invalidateQueries({ queryKey: requestKeys.all });
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
        fail(error);
        return;
      }
      setDeleteError(error instanceof ApiError && !isRetryableError(error) ? error.message : 'Connexion impossible : réessayez.');
    } finally {
      setBusy(null);
    }
  }

  const voiceSlot =
    draft.voice && voiceMode === 'kept' ? (
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <VoicePlayer key={draft.voice.fileId} src={`/api/files/${draft.voice.fileId}`} durationSeconds={draft.voice.durationSeconds} />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Button variant="outlined" size="small" startIcon={<RefreshCw aria-hidden="true" />} onClick={() => setVoiceMode('replace')}>
            Remplacer le message vocal
          </Button>
          <Button variant="outlined" size="small" color="error" startIcon={<Trash2 aria-hidden="true" />} onClick={() => setVoiceMode('removed')}>
            Supprimer le message vocal
          </Button>
        </Box>
      </Box>
    ) : draft.voice && voiceMode === 'replace' ? (
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <VoiceRecorder maxSeconds={voiceMaxSeconds} value={form.voice} onChange={form.setVoice} />
        <Box>
          <Button
            variant="text"
            size="small"
            onClick={() => {
              form.setVoice(null);
              setVoiceMode('kept');
            }}
          >
            Garder le message vocal actuel
          </Button>
        </Box>
      </Box>
    ) : undefined;

  return (
    <>
      <PageHeader
        title={TITLE}
        description="Complétez votre demande, puis envoyez-la. Tant qu’elle reste en brouillon, vous seul la voyez."
        back={BACK}
      />
      <Box component="form" noValidate onSubmit={(e: FormEvent<HTMLFormElement>) => void handleSend(e)} sx={{ maxWidth: layout.readable }}>
        <RequestFields
          form={form}
          voiceMaxSeconds={voiceMaxSeconds}
          alert={submitError && <Alert severity="error">{submitError}</Alert>}
          voiceSlot={voiceSlot}
        />

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'flex-end', gap: 1.5, mt: 2 }}>
          <Button
            color="error"
            size="large"
            disabled={busy !== null}
            startIcon={<Trash2 aria-hidden="true" />}
            onClick={() => setConfirmDelete(true)}
            sx={{ mr: { sm: 'auto' } }}
          >
            Supprimer le brouillon
          </Button>
          <Button
            variant="outlined"
            size="large"
            loading={busy === 'save'}
            disabled={busy === 'send' || busy === 'delete'}
            startIcon={<Save aria-hidden="true" />}
            onClick={() => void handleSave()}
          >
            Enregistrer le brouillon
          </Button>
          <Button
            type="submit"
            variant="contained"
            size="large"
            loading={busy === 'send'}
            disabled={busy === 'save' || busy === 'delete'}
            startIcon={<Send aria-hidden="true" />}
          >
            Envoyer la demande
          </Button>
        </Box>
      </Box>

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer ce brouillon ?"
        confirmLabel="Supprimer"
        pending={busy === 'delete'}
        error={deleteError}
        onConfirm={() => void handleDelete()}
        onClose={() => {
          setConfirmDelete(false);
          setDeleteError(null);
        }}
      >
        Le brouillon et son message vocal seront définitivement supprimés. Rien n’a été envoyé.
      </ConfirmDialog>
    </>
  );
}
