import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import { Tag, UserRound } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { fieldErrors } from '../../api/client';
import type { Priority } from '../../api/types';
import { fieldIcon } from '../../components/fieldIcon';
import { PRIORITY_LABELS, PRIORITY_STYLE } from '../../components/PriorityBadge';
import { font, fontSize, icon, tokensOf } from '../../design/tokens';
import { VoiceRecorder, type VoiceRecording } from '../voice/VoiceRecorder';
import { useRecipients } from './api';
import type { CategoryOption } from './types';

const PRIORITIES: Priority[] = ['NORMAL', 'MEDIUM', 'HIGH', 'URGENT'];

type Field = 'categoryId' | 'recipientId' | 'priority' | 'title' | 'content';
export type RequestFormErrors = Partial<Record<Field, string>>;

export interface RequestFormInitial {
  categoryId?: string;
  recipientId?: string;
  priority?: Priority;
  title?: string;
  description?: string;
}

/**
 * État et règles du formulaire de demande, partagés par « Nouvelle demande » et la reprise d'un
 * brouillon (spec 007) : catégorie, destinataire selon le mode de routage, priorité, titre,
 * description, message vocal enregistré dans la page.
 */
export function useRequestForm(categories: CategoryOption[], initial: RequestFormInitial = {}) {
  const [categoryId, setCategoryIdState] = useState(initial.categoryId ?? '');
  const [chosenRecipientId, setRecipientId] = useState(initial.recipientId ?? '');
  const [priority, setPriority] = useState<Priority | ''>(initial.priority ?? '');
  const [title, setTitle] = useState(initial.title ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [voice, setVoice] = useState<VoiceRecording | null>(null);
  const [errors, setErrors] = useState<RequestFormErrors>({});

  const category = categories.find((c) => c.id === categoryId) ?? null;
  const isCircuitA = category?.circuit === 'A_DIRECT';
  const recipients = useRecipients(isCircuitA ? categoryId : null);
  const mode = category?.routingMode;
  // Mode direct : le service, s'il est seul, est choisi d'office (le serveur applique la même règle).
  const serviceDefault = mode === 'DIRECT' && recipients.data?.length === 1 ? recipients.data[0].id : '';
  const recipientId = chosenRecipientId || serviceDefault;
  // Entre enseignants : un collègue absent est signalé, sans bloquer l'envoi.
  const recipientAbsent = mode === 'PEER' && recipients.data?.find((r) => r.id === recipientId)?.availability === 'ABSENT';

  function setCategoryId(value: string): void {
    setCategoryIdState(value);
    setRecipientId('');
  }

  /**
   * Contrôles avant l'appel : complets pour l'envoi ; pour un brouillon, catégorie et titre seuls.
   * `hasContent` : message vocal ou description (un vocal déjà enregistré compte pour un brouillon).
   */
  function validate(kind: 'send' | 'draft', hasContent: boolean): boolean {
    const next: RequestFormErrors =
      kind === 'draft'
        ? {
            categoryId: categoryId ? undefined : 'Choisissez une catégorie.',
            title: title.trim() ? undefined : 'Saisissez un titre.',
          }
        : {
            categoryId: categoryId ? undefined : 'Choisissez une catégorie.',
            recipientId: isCircuitA && !recipientId ? 'Choisissez un destinataire.' : undefined,
            priority: priority ? undefined : 'Choisissez une priorité.',
            title: title.trim() ? undefined : 'Saisissez un titre.',
            content: hasContent ? undefined : 'Enregistrez un message vocal ou écrivez une description.',
          };
    setErrors(next);
    return !Object.values(next).some(Boolean);
  }

  /** Erreurs de champ renvoyées par le serveur ; `true` s'il y en avait. */
  function applyServerErrors(error: unknown): boolean {
    const byField = fieldErrors(error);
    if (Object.keys(byField).length === 0) return false;
    setErrors({
      title: byField.title,
      content: byField.voiceFileId ?? byField.description,
      categoryId: byField.categoryId,
      recipientId: byField.recipientId,
    });
    return true;
  }

  return {
    categories,
    categoryId,
    setCategoryId,
    recipientId,
    setRecipientId,
    recipients: recipients.data ?? [],
    priority,
    setPriority,
    title,
    setTitle,
    description,
    setDescription,
    voice,
    setVoice,
    errors,
    category,
    isCircuitA,
    mode,
    recipientAbsent,
    validate,
    applyServerErrors,
  };
}

export type RequestFormState = ReturnType<typeof useRequestForm>;

/**
 * Champs du formulaire. `alert` : message d'erreur général en tête ; `voiceSlot` : remplace
 * l'enregistreur (reprise d'un brouillon qui a déjà un message vocal).
 */
export function RequestFields({
  form,
  voiceMaxSeconds,
  alert,
  voiceSlot,
}: {
  form: RequestFormState;
  voiceMaxSeconds: number;
  alert?: ReactNode;
  voiceSlot?: ReactNode;
}) {
  const { errors, category, isCircuitA, mode } = form;
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 3 }}>
      {alert}

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, alignItems: 'start' }}>
        <TextField
          select
          id="request-category"
          label="Catégorie"
          value={form.categoryId}
          onChange={(e) => form.setCategoryId(e.target.value)}
          error={Boolean(errors.categoryId)}
          helperText={errors.categoryId}
          slotProps={{ input: fieldIcon(Tag) }}
        >
          {form.categories.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>

        {category && !isCircuitA ? (
          <Alert severity="info" sx={{ alignSelf: 'end' }}>
            Cette demande sera d’abord validée par un admin, qui choisira la personne chargée de la réaliser.
          </Alert>
        ) : (
          <TextField
            select
            id="request-recipient"
            label={mode === 'PEER' ? 'Enseignant destinataire' : mode === 'DIRECT' ? 'Destinataire (service)' : 'Destinataire'}
            value={form.recipientId}
            disabled={!category}
            onChange={(e) => form.setRecipientId(e.target.value)}
            error={Boolean(errors.recipientId)}
            helperText={errors.recipientId ?? (!category ? 'Choisissez d’abord une catégorie.' : undefined)}
            slotProps={{ input: fieldIcon(UserRound) }}
          >
            {form.recipients.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.jobTitle ? `${r.displayName} — ${r.jobTitle}` : r.displayName}
                {r.availability === 'ABSENT' ? ' (absent)' : ''}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Box>
      {form.recipientAbsent && (
        <Alert severity="warning">Ce collègue est signalé absent : votre demande lui sera bien envoyée, il la lira à son retour.</Alert>
      )}

      <FormControl error={Boolean(errors.priority)} component="fieldset">
        <FormLabel component="legend" sx={{ mb: 1 }}>
          Priorité
        </FormLabel>
        <RadioGroup row value={form.priority} onChange={(e) => form.setPriority(e.target.value as Priority)} sx={{ gap: 1 }}>
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
        value={form.title}
        onChange={(e) => form.setTitle(e.target.value)}
        error={Boolean(errors.title)}
        helperText={errors.title ?? 'Par exemple : « Photocopies du contrôle de maths ».'}
        slotProps={{ htmlInput: { maxLength: 120 } }}
      />

      <FormControl error={Boolean(errors.content)} component="fieldset">
        <FormLabel component="legend" sx={{ mb: 1 }}>
          Message vocal
        </FormLabel>
        {voiceSlot ?? <VoiceRecorder maxSeconds={voiceMaxSeconds} value={form.voice} onChange={form.setVoice} />}
        {errors.content && <FormHelperText>{errors.content}</FormHelperText>}
      </FormControl>

      <TextField
        id="request-description"
        label="Description (facultative)"
        value={form.description}
        onChange={(e) => form.setDescription(e.target.value)}
        multiline
        minRows={3}
        slotProps={{ htmlInput: { maxLength: 4000 } }}
      />
    </Paper>
  );
}
