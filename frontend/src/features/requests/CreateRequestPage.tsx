import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import { Send, Tag, UserRound } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, fieldErrors } from '../../api/client';
import type { Priority } from '../../api/types';
import { ErrorState } from '../../components/ErrorState';
import { fieldIcon } from '../../components/fieldIcon';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { PRIORITY_LABELS, PRIORITY_STYLE } from '../../components/PriorityBadge';
import { useToast } from '../../components/Toast';
import { font, fontSize, icon, layout, tokensOf } from '../../design/tokens';
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
  const toast = useToast();
  const categories = useCategories();
  const clientId = useRef(crypto.randomUUID());

  const [categoryId, setCategoryId] = useState('');
  const [chosenRecipientId, setRecipientId] = useState('');
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
  const mode = category?.routingMode;
  // Mode direct : le service, s'il est seul, est choisi d'office (le serveur applique la même règle).
  const serviceDefault = mode === 'DIRECT' && recipients.data?.length === 1 ? recipients.data[0].id : '';
  const recipientId = chosenRecipientId || serviceDefault;
  // Entre enseignants : un collègue absent est signalé, sans bloquer l'envoi.
  const recipientAbsent = mode === 'PEER' && recipients.data?.find((r) => r.id === recipientId)?.availability === 'ABSENT';

  const header = (
    <PageHeader
      title="Nouvelle demande"
      description="Décrivez votre besoin : un message vocal suffit, la description écrite est facultative."
      back={{ to: '/', label: 'Retour aux demandes' }}
    />
  );

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
      {header}
      <Box component="form" noValidate onSubmit={(e: FormEvent<HTMLFormElement>) => void handleSubmit(e)} sx={{ maxWidth: layout.readable }}>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 3 }}>
          {submitError && <Alert severity="error">{submitError}</Alert>}

          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, alignItems: 'start' }}>
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
              slotProps={{ input: fieldIcon(Tag) }}
            >
              {categories.data.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>

            {category && !isCircuitA ? (
              <Alert severity="info" sx={{ alignSelf: 'end' }}>
                Cette demande sera d’abord validée par un responsable, qui choisira la personne chargée de la réaliser.
              </Alert>
            ) : (
              <TextField
                select
                id="request-recipient"
                label={mode === 'PEER' ? 'Enseignant destinataire' : mode === 'DIRECT' ? 'Destinataire (service)' : 'Destinataire'}
                value={recipientId}
                disabled={!category}
                onChange={(e) => setRecipientId(e.target.value)}
                error={Boolean(errors.recipientId)}
                helperText={errors.recipientId ?? (!category ? 'Choisissez d’abord une catégorie.' : undefined)}
                slotProps={{ input: fieldIcon(UserRound) }}
              >
                {(recipients.data ?? []).map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.jobTitle ? `${r.displayName} — ${r.jobTitle}` : r.displayName}
                    {r.availability === 'ABSENT' ? ' (absent)' : ''}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Box>
          {recipientAbsent && (
            <Alert severity="warning">Ce collègue est signalé absent : votre demande lui sera bien envoyée, il la lira à son retour.</Alert>
          )}

          <FormControl error={Boolean(errors.priority)} component="fieldset">
            <FormLabel component="legend" sx={{ mb: 1 }}>
              Priorité
            </FormLabel>
            <RadioGroup row value={priority} onChange={(e) => setPriority(e.target.value as Priority)} sx={{ gap: 1 }}>
              {PRIORITIES.map((p) => {
                const Icon = PRIORITY_STYLE[p].icon;
                return (
                  <FormControlLabel
                    key={p}
                    value={p}
                    control={<Radio size="small" />}
                    label={
                      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: fontSize.sm, fontWeight: font.medium }}>
                        <Icon size={icon.sm} aria-hidden="true" />
                        {PRIORITY_LABELS[p]}
                      </Box>
                    }
                    sx={(theme) => ({
                      m: 0,
                      pr: 1.5,
                      pl: 0.5,
                      minHeight: 40,
                      border: `1px solid ${tokensOf(theme).borderStrong}`,
                      borderRadius: 1,
                      bgcolor: 'background.paper',
                      transition: 'background-color 150ms, border-color 150ms',
                      '&:hover': { bgcolor: tokensOf(theme).surfaceMuted },
                      '&:has(input:checked)': { borderColor: tokensOf(theme).accent.main, bgcolor: tokensOf(theme).accent.soft },
                      '@media (pointer: coarse)': { minHeight: 44 },
                    })}
                  />
                );
              })}
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
        </Paper>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button type="submit" variant="contained" size="large" loading={submitting} startIcon={<Send aria-hidden="true" />}>
            Envoyer la demande
          </Button>
        </Box>
      </Box>
    </>
  );
}
