import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, fieldErrors } from '../../api/client';
import type { Priority } from '../../api/types';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PRIORITY_LABELS } from '../../components/PriorityChip';
import { saveToOutbox } from '../outbox/outbox';
import { useClientSettings } from '../../api/settings';
import { OUTBOX_KEY } from '../outbox/useOutbox';
import { VoiceRecorder, type VoiceRecording } from '../voice/VoiceRecorder';
import {
  isRetryableError,
  requestKeys,
  submitRequest,
  useCategories,
  useRecipients,
  type NewRequestInput,
} from './api';

/** Durée maximale des vocaux : valeur par défaut provisoire (data-model.md), revérifiée par le serveur. */

const PRIORITIES: Priority[] = ['NORMAL', 'MEDIUM', 'HIGH', 'URGENT'];

type Field = 'categoryId' | 'recipientId' | 'priority' | 'title' | 'content';
type Errors = Partial<Record<Field, string>>;

export function CreateRequestPage() {
  const navigate = useNavigate();
  const { voiceMaxSeconds } = useClientSettings();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const clientId = useRef(crypto.randomUUID());

  const [categoryId, setCategoryId] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [voice, setVoice] = useState<VoiceRecording | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const category = categories.data?.find((c) => c.id === categoryId) ?? null;
  const isCircuitA = category?.circuit === 'A_DIRECT';
  const recipients = useRecipients(isCircuitA ? categoryId : null);

  if (categories.isPending) return <LoadingState label="Chargement du formulaire" />;
  if (categories.error) {
    return (
      <ErrorState
        message="Impossible de charger les catégories."
        actionLabel="Réessayer"
        onAction={() => void categories.refetch()}
      />
    );
  }

  function validate(): Errors {
    return {
      categoryId: categoryId ? undefined : 'Choisissez une catégorie.',
      recipientId: isCircuitA && !recipientId ? 'Choisissez un destinataire.' : undefined,
      priority: priority ? undefined : 'Choisissez une priorité.',
      title: title.trim() ? undefined : 'Saisissez un titre.',
      content:
        voice || description.trim() ? undefined : 'Enregistrez un message vocal ou écrivez une description.',
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitError(null);
    const next = validate();
    setErrors(next);
    if (Object.values(next).some(Boolean) || !priority || !category) return;

    const input: NewRequestInput = {
      clientId: clientId.current,
      title: title.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      categoryId,
      ...(isCircuitA ? { recipientId } : {}),
      priority,
      ...(voice ? { voice: { blob: voice.blob, mimeType: voice.mimeType, durationSeconds: voice.durationSeconds } } : {}),
    };

    setSubmitting(true);
    try {
      const created = await submitRequest(input);
      await queryClient.invalidateQueries({ queryKey: requestKeys.all });
      navigate(`/demandes/${created.id}`, { state: { flash: 'Votre demande a été envoyée.' } });
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
        const byField = fieldErrors(error);
        if (Object.keys(byField).length > 0) {
          setErrors({
            title: byField.title,
            content: byField.voiceFileId ?? byField.description,
            categoryId: byField.categoryId,
            recipientId: byField.recipientId,
          });
        }
        setSubmitError(error instanceof ApiError ? error.message : 'Envoi impossible.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Typography component="h1" variant="h4" gutterBottom>
        Nouvelle demande
      </Typography>
      <form noValidate onSubmit={(e) => void handleSubmit(e)}>
        <Stack spacing={3}>
          {submitError && <Alert severity="error">{submitError}</Alert>}

          <TextField
            select
            id="request-category"
            label="Catégorie"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setRecipientId('');
            }}
            error={Boolean(errors.categoryId)}
            helperText={errors.categoryId}
          >
            {categories.data.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>

          {category && !isCircuitA ? (
            <Alert severity="info">
              Cette demande sera d’abord validée par un responsable, qui choisira la personne chargée de la réaliser.
            </Alert>
          ) : (
            <TextField
              select
              id="request-recipient"
              label="Destinataire"
              value={recipientId}
              disabled={!category}
              onChange={(e) => setRecipientId(e.target.value)}
              error={Boolean(errors.recipientId)}
              helperText={errors.recipientId ?? (!category ? 'Choisissez d’abord une catégorie.' : undefined)}
            >
              {(recipients.data ?? []).map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.jobTitle ? `${r.displayName} — ${r.jobTitle}` : r.displayName}
                </MenuItem>
              ))}
            </TextField>
          )}

          <FormControl error={Boolean(errors.priority)} component="fieldset">
            <FormLabel component="legend">Priorité</FormLabel>
            <RadioGroup row value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <FormControlLabel key={p} value={p} control={<Radio />} label={PRIORITY_LABELS[p]} />
              ))}
            </RadioGroup>
            {errors.priority && <FormHelperText>{errors.priority}</FormHelperText>}
          </FormControl>

          <TextField
            id="request-title"
            label="Titre"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={Boolean(errors.title)}
            helperText={errors.title ?? 'Par exemple : « Photocopies du contrôle de maths ».'}
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />

          <FormControl error={Boolean(errors.content)} component="fieldset">
            <FormLabel component="legend" sx={{ mb: 1 }}>
              Message vocal
            </FormLabel>
            <VoiceRecorder maxSeconds={voiceMaxSeconds} value={voice} onChange={setVoice} />
            {errors.content && <FormHelperText>{errors.content}</FormHelperText>}
          </FormControl>

          <TextField
            id="request-description"
            label="Description (facultative)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={3}
            slotProps={{ htmlInput: { maxLength: 4000 } }}
          />

          <Button type="submit" variant="contained" size="large" loading={submitting}>
            Envoyer la demande
          </Button>
        </Stack>
      </form>
    </>
  );
}
