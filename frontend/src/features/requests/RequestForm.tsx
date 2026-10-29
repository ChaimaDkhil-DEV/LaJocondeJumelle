import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import type { CSSObject, Theme } from '@mui/material/styles';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import { ChevronRight, Info, Minus, Plus, Tag, UserRound } from 'lucide-react';
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { fieldErrors } from '../../api/client';
import type { Priority } from '../../api/types';
import { visuallyHidden } from '../../components/a11y';
import { Badge } from '../../components/Badge';
import { fieldIcon } from '../../components/fieldIcon';
import { PRIORITY_LABELS, PRIORITY_STYLE } from '../../components/PriorityBadge';
import { font, fontSize, icon, tokensOf } from '../../design/tokens';
import { VoiceHero } from '../voice/VoiceHero';
import type { VoiceRecording } from '../voice/VoiceRecorder';
import { useRecipients } from './api';
import type { CategoryOption } from './types';

const PRIORITIES: Priority[] = ['NORMAL', 'MEDIUM', 'HIGH', 'URGENT'];
/** Phrase unique, sous le vocal, pour les champs remplis par les propositions (badge « Suggéré »). */
export const SUGGESTED_HINT = 'Champs préremplis d’après votre message : vérifiez-les.';

type Field = 'categoryId' | 'recipientId' | 'priority' | 'title' | 'content';
export type RequestFormErrors = Partial<Record<Field, string>>;

/** Champs que les propositions automatiques peuvent remplir. */
export type SuggestableField = 'categoryId' | 'recipientId' | 'priority' | 'title';

/** Saisies de l'utilisateur qui relancent les propositions automatiques. */
export type FormChange =
  { type: 'voice'; voice: VoiceRecording | null } | { type: 'category'; categoryId: string };

/** Valeurs proposées à appliquer : un destinataire suit toujours sa catégorie. */
export interface SuggestedValues {
  categoryId?: string;
  recipientId?: string;
  priority?: Priority;
  title?: string;
}

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
  // Champs dont la valeur vient des propositions automatiques ; une saisie de l'utilisateur les en retire.
  const [suggested, setSuggested] = useState<ReadonlySet<SuggestableField>>(() => new Set());
  const listeners = useRef(new Set<(change: FormChange) => void>());
  const emit = (change: FormChange) => listeners.current.forEach((listener) => listener(change));
  /** Abonnement aux saisies de l'utilisateur (vocal enregistré ou retiré, catégorie choisie). */
  const subscribe = useCallback((listener: (change: FormChange) => void) => {
    const all = listeners.current;
    all.add(listener);
    return () => void all.delete(listener);
  }, []);

  const category = categories.find((c) => c.id === categoryId) ?? null;
  const isCircuitA = category?.circuit === 'A_DIRECT';
  const recipients = useRecipients(isCircuitA ? categoryId : null);
  const mode = category?.routingMode;
  // Mode direct : le service, s'il est seul, est choisi d'office (le serveur applique la même règle).
  const serviceDefault =
    mode === 'DIRECT' && recipients.data?.length === 1 ? recipients.data[0].id : '';
  // Seul un destinataire de la liste autorisée compte (liste encore en chargement : choix conservé).
  const chosenAllowed = !recipients.data || recipients.data.some((r) => r.id === chosenRecipientId);
  const recipientId = (chosenAllowed ? chosenRecipientId : '') || serviceDefault;
  // Entre enseignants : un collègue absent est signalé, sans bloquer l'envoi.
  const recipientAbsent =
    mode === 'PEER' &&
    recipients.data?.find((r) => r.id === recipientId)?.availability === 'ABSENT';

  function mark(fields: SuggestableField[], on: boolean): void {
    setSuggested((prev) => {
      const next = new Set(prev);
      for (const f of fields) {
        if (on) next.add(f);
        else next.delete(f);
      }
      return next;
    });
  }

  /** Changement de catégorie par l'utilisateur : le destinataire, propre à la catégorie, est à refaire. */
  function setCategoryId(value: string): void {
    setCategoryIdState(value);
    setRecipientId('');
    mark(['categoryId', 'recipientId'], false);
    emit({ type: 'category', categoryId: value });
  }

  /**
   * Applique des valeurs proposées et les marque comme telles. Une nouvelle catégorie remet le
   * destinataire à celui proposé avec elle (ou à vide).
   */
  function applySuggestion(values: SuggestedValues): void {
    const applied: SuggestableField[] = [];
    if (values.categoryId !== undefined && values.categoryId !== categoryId) {
      setCategoryIdState(values.categoryId);
      setRecipientId(values.recipientId ?? '');
      applied.push('categoryId');
      if (values.recipientId !== undefined) applied.push('recipientId');
      else mark(['recipientId'], false);
    } else {
      if (values.categoryId !== undefined) applied.push('categoryId');
      if (values.recipientId !== undefined) {
        setRecipientId(values.recipientId);
        applied.push('recipientId');
      }
    }
    if (values.priority !== undefined) {
      setPriority(values.priority);
      applied.push('priority');
    }
    if (values.title !== undefined) {
      setTitle(values.title);
      applied.push('title');
    }
    mark(applied, true);
  }

  /** Retire les valeurs proposées (nouveau vocal) ; les choix de l'utilisateur restent. */
  function clearSuggested(): void {
    if (suggested.has('categoryId')) {
      setCategoryIdState('');
      setRecipientId('');
    }
    if (suggested.has('recipientId')) setRecipientId('');
    if (suggested.has('priority')) setPriority('');
    if (suggested.has('title')) setTitle('');
    setSuggested(new Set());
  }

  /** Valeur saisie ou choisie par l'utilisateur : une nouvelle analyse ne la remplace jamais. */
  function isManual(field: SuggestableField): boolean {
    const value = { categoryId, recipientId: chosenRecipientId, priority, title: title.trim() }[
      field
    ];
    return Boolean(value) && !suggested.has(field);
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
            content: hasContent
              ? undefined
              : 'Enregistrez un message vocal ou écrivez une description.',
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
    setRecipientId: (value: string) => {
      setRecipientId(value);
      mark(['recipientId'], false);
    },
    recipients: recipients.data ?? [],
    recipientsLoaded: Boolean(recipients.data),
    priority,
    setPriority: (value: Priority) => {
      setPriority(value);
      mark(['priority'], false);
    },
    title,
    setTitle: (value: string) => {
      setTitle(value);
      mark(['title'], false);
    },
    suggested,
    applySuggestion,
    clearSuggested,
    isManual,
    description,
    setDescription,
    voice,
    setVoice: (value: VoiceRecording | null) => {
      setVoice(value);
      emit({ type: 'voice', voice: value });
    },
    subscribe,
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

/** Pièces du formulaire fournies par les propositions automatiques (page « Nouvelle demande »). */
export interface AssistSlots {
  /** Sous le message vocal : une seule phrase (analyse en cours, champs préremplis, erreur). */
  afterVoice?: ReactNode;
  /** Destinataire encore vide après l'analyse : seule mise en évidence, il demande une action. */
  recipientToConfirm?: boolean;
  /** Demandes similaires : libellé du lien repliable (« 3 demandes similaires ») et liste. */
  similar?: { label: string; list: ReactNode } | null;
}

/** Champ prérempli par les propositions : contour et fond d'accent discrets. */
function suggestedStyle(theme: Theme, on: boolean): CSSObject {
  return on
    ? {
        '& .MuiOutlinedInput-root': { bgcolor: tokensOf(theme).accent.soft },
        '& .MuiOutlinedInput-root:not(.Mui-focused):not(.Mui-error) .MuiOutlinedInput-notchedOutline':
          {
            borderColor: tokensOf(theme).accent.border,
          },
      }
    : {};
}

/**
 * Badge « Suggéré » d'un champ prérempli, à droite de son libellé (le parent est en position
 * relative). Hors du libellé : le nom du champ ne change pas. Masqué aux lecteurs d'écran : la
 * phrase sous le vocal, annoncée, leur dit quels champs vérifier.
 */
function SuggestedBadge({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{ position: 'absolute', top: 0, right: 0, display: 'inline-flex', pointerEvents: 'none' }}
    >
      <Badge tone="accent">Suggéré</Badge>
    </Box>
  );
}

/** Destinataire à confirmer : contour orange foncé et fond ambre très clair, sans bloc d'avertissement. */
function toConfirmStyle(theme: Theme, on: boolean): CSSObject {
  return on
    ? {
        '& .MuiOutlinedInput-root': { bgcolor: tokensOf(theme).warning.soft },
        '& .MuiOutlinedInput-root:not(.Mui-focused):not(.Mui-error) .MuiOutlinedInput-notchedOutline':
          {
            borderColor: tokensOf(theme).warning.main,
            borderWidth: 2,
          },
      }
    : {};
}

/** Liens repliables (« + Ajouter une description », demandes similaires) : cible tactile ≥ 44 px. */
const toggleSx = { minHeight: 44, px: 1, ml: -1, fontWeight: font.medium, justifyContent: 'flex-start', textAlign: 'left' } as const;

function recipientLabel(r: {
  displayName: string;
  jobTitle: string | null;
  availability: string;
}): string {
  return `${r.jobTitle ? `${r.displayName} — ${r.jobTitle}` : r.displayName}${r.availability === 'ABSENT' ? ' (absent)' : ''}`;
}

/**
 * Champs du formulaire dans une seule carte, maquette « Voix d'abord » : message vocal (bloc
 * dominant), titre, catégorie et destinataire, priorité, puis deux liens repliables (description
 * facultative, demandes similaires) et `footer` (boutons d'envoi). `alert` : erreur générale en
 * tête ; `voiceSlot` : remplace l'enregistreur (brouillon qui a déjà un vocal) ; `assist` : pièces
 * des propositions automatiques.
 */
export function RequestFields({
  form,
  voiceMaxSeconds,
  alert,
  voiceSlot,
  assist = {},
  footer,
}: {
  form: RequestFormState;
  voiceMaxSeconds: number;
  alert?: ReactNode;
  voiceSlot?: ReactNode;
  assist?: AssistSlots;
  footer?: ReactNode;
}) {
  const { errors, category, isCircuitA, mode, suggested } = form;
  const on = (field: SuggestableField) => suggested.has(field);
  const descriptionId = useId();
  const similarId = useId();
  // Description repliée, sauf si elle a déjà un contenu (reprise d'un brouillon).
  const [showDescription, setShowDescription] = useState(() => Boolean(form.description.trim()));
  const [showSimilar, setShowSimilar] = useState(false);
  const focusDescription = useRef(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const toConfirm = Boolean(assist.recipientToConfirm);

  return (
    <Paper
      elevation={0}
      sx={(theme) => ({
        p: { xs: 2, sm: 3 },
        borderRadius: '16px',
        border: `1px solid ${tokensOf(theme).border}`,
        boxShadow: '0 1px 2px rgba(35, 42, 89, 0.04), 0 12px 32px rgba(35, 42, 89, 0.06)',
        display: 'grid',
        // Colonnes en minmax(0, 1fr) : aucun champ ne doit élargir la carte (320 px).
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 2.5,
      })}
    >
      {alert}

      <FormControl
        error={Boolean(errors.content)}
        component="fieldset"
        sx={{ display: 'grid', gap: 1, minWidth: 0 }}
      >
        <FormLabel component="legend" sx={visuallyHidden}>
          Message vocal
        </FormLabel>
        {voiceSlot ?? (
          <VoiceHero maxSeconds={voiceMaxSeconds} value={form.voice} onChange={form.setVoice} />
        )}
        {errors.content && <FormHelperText sx={{ mx: 0 }}>{errors.content}</FormHelperText>}
        {assist.afterVoice}
      </FormControl>

      <Box sx={{ position: 'relative' }}>
        <SuggestedBadge on={on('title')} />
        <TextField
          id="request-title"
          label="Titre"
          fullWidth
          value={form.title}
          onChange={(e) => form.setTitle(e.target.value)}
          error={Boolean(errors.title)}
          helperText={errors.title}
          placeholder="Par exemple : « Photocopies du contrôle de maths »"
          slotProps={{ htmlInput: { maxLength: 120 } }}
          sx={(theme) => suggestedStyle(theme, on('title'))}
        />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 2.5,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
          alignItems: 'start',
        }}
      >
        <Box sx={{ position: 'relative' }}>
          <SuggestedBadge on={on('categoryId')} />
          <TextField
            select
            fullWidth
            id="request-category"
            label="Catégorie"
            value={form.categoryId}
            onChange={(e) => form.setCategoryId(e.target.value)}
            error={Boolean(errors.categoryId)}
            helperText={errors.categoryId}
            slotProps={{ input: fieldIcon(Tag) }}
            sx={(theme) => suggestedStyle(theme, on('categoryId'))}
          >
            {form.categories.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        {category && !isCircuitA ? (
          <Box
            sx={(theme) => ({
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              p: 1.5,
              mt: { sm: 3.5 },
              borderRadius: 1,
              border: `1px solid ${tokensOf(theme).info.border}`,
              color: tokensOf(theme).info.text,
              fontSize: fontSize.sm,
            })}
          >
            <Info size={icon.sm} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
            Cette demande sera d’abord validée par un admin, qui choisira la personne chargée de la
            réaliser.
          </Box>
        ) : (
          <Box sx={{ position: 'relative' }}>
            <SuggestedBadge on={on('recipientId')} />
            <TextField
              select
              fullWidth
              id="request-recipient"
              label={
                mode === 'PEER'
                  ? 'Enseignant destinataire'
                  : mode === 'DIRECT'
                    ? 'Destinataire (service)'
                    : 'Destinataire'
              }
              // Seules les personnes de la liste autorisée peuvent être affichées et choisies.
              value={form.recipients.some((r) => r.id === form.recipientId) ? form.recipientId : ''}
              disabled={!category}
              onChange={(e) => form.setRecipientId(e.target.value)}
              error={Boolean(errors.recipientId)}
              helperText={
                errors.recipientId ?? (!category ? 'Choisissez d’abord une catégorie.' : undefined)
              }
              slotProps={{
                input: fieldIcon(UserRound),
                // À confirmer : le texte court s'affiche dans le champ lui-même.
                select: toConfirm
                  ? {
                      displayEmpty: true,
                      renderValue: (value) => {
                        const chosen = form.recipients.find((r) => r.id === value);
                        return chosen ? (
                          recipientLabel(chosen)
                        ) : (
                          <Box
                            component="span"
                            sx={(theme) => ({
                              color: tokensOf(theme).warning.text,
                              fontWeight: font.medium,
                            })}
                          >
                            À confirmer
                          </Box>
                        );
                      },
                    }
                  : undefined,
              }}
              sx={(theme) => ({
                ...suggestedStyle(theme, on('recipientId')),
                ...toConfirmStyle(theme, toConfirm),
              })}
            >
              {form.recipients.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {recipientLabel(r)}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        )}
      </Box>
      {form.recipientAbsent && (
        <Alert severity="warning" variant="outlined">
          Ce collègue est signalé absent : votre demande lui sera bien envoyée, il la lira à son
          retour.
        </Alert>
      )}

      <FormControl
        error={Boolean(errors.priority)}
        component="fieldset"
        sx={{ minWidth: 0, position: 'relative' }}
      >
        <FormLabel component="legend" sx={{ mb: 1 }}>
          Priorité
        </FormLabel>
        <SuggestedBadge on={on('priority')} />
        {/* Boutons segmentés : des boutons radio, pour la navigation au clavier et les lecteurs d'écran. */}
        <RadioGroup
          row
          value={form.priority}
          onChange={(e) => form.setPriority(e.target.value as Priority)}
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              sm: 'repeat(4, minmax(0, 1fr))',
            },
            gap: { xs: 1, sm: 0 },
          }}
        >
          {PRIORITIES.map((p) => {
            const Icon = PRIORITY_STYLE[p].icon;
            return (
              <FormControlLabel
                key={p}
                value={p}
                // Champ natif transparent sur tout le segment : clic, clavier et lecteurs d'écran inchangés.
                control={
                  <Radio
                    disableRipple
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      p: 0,
                      borderRadius: 'inherit',
                      '& svg': { display: 'none' },
                      '&:hover': { bgcolor: 'transparent' },
                    }}
                  />
                }
                label={
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.75,
                      fontSize: fontSize.sm,
                      fontWeight: font.medium,
                    }}
                  >
                    <Icon size={icon.sm} aria-hidden="true" />
                    {PRIORITY_LABELS[p]}
                  </Box>
                }
                sx={(theme) => {
                  const t = tokensOf(theme);
                  return {
                    position: 'relative',
                    m: 0,
                    justifyContent: 'center',
                    height: 44,
                    px: 1.5,
                    border: `1px solid ${t.borderStrong}`,
                    borderRadius: 1,
                    bgcolor: 'background.paper',
                    color: t.textSecondary,
                    transition: 'background-color 150ms, border-color 150ms, color 150ms',
                    [theme.breakpoints.up('sm')]: {
                      borderRadius: 0,
                      '&:not(:first-of-type)': { ml: '-1px' },
                      '&:first-of-type': { borderRadius: '10px 0 0 10px' },
                      '&:last-of-type': { borderRadius: '0 10px 10px 0' },
                    },
                    '&:hover': { bgcolor: t.surfaceMuted },
                    '&:has(input:checked)': {
                      zIndex: 1,
                      bgcolor: t.accent.soft,
                      borderColor: t.accent.main,
                      color: t.accent.text,
                      boxShadow: `inset 0 0 0 1px ${t.accent.main}`,
                    },
                    '&:has(input:focus-visible)': {
                      zIndex: 2,
                      outline: `2px solid ${t.focus}`,
                      outlineOffset: 2,
                    },
                  };
                }}
              />
            );
          })}
        </RadioGroup>
        {errors.priority && <FormHelperText sx={{ mx: 0 }}>{errors.priority}</FormHelperText>}
      </FormControl>

      <Box>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            columnGap: 2,
          }}
        >
          <Button
            variant="text"
            aria-expanded={showDescription}
            aria-controls={descriptionId}
            startIcon={
              showDescription ? (
                <Minus size={icon.sm} aria-hidden="true" />
              ) : (
                <Plus size={icon.sm} aria-hidden="true" />
              )
            }
            onClick={() => {
              focusDescription.current = !showDescription;
              setShowDescription((v) => !v);
            }}
            sx={toggleSx}
          >
            Ajouter une description (facultatif)
          </Button>
          {assist.similar && (
            <Button
              variant="text"
              color="inherit"
              aria-expanded={showSimilar}
              aria-controls={similarId}
              endIcon={
                <ChevronRight
                  size={icon.sm}
                  aria-hidden="true"
                  style={{
                    transform: showSimilar ? 'rotate(90deg)' : undefined,
                    transition: 'transform 150ms',
                  }}
                />
              }
              onClick={() => setShowSimilar((v) => !v)}
              sx={(theme) => ({ ...toggleSx, ml: 0, mr: -1, color: tokensOf(theme).textSecondary })}
            >
              {assist.similar.label}
            </Button>
          )}
        </Box>
        <Collapse
          in={showDescription}
          id={descriptionId}
          onEntered={() => {
            // Ouverte au clic : le curseur va dans la description.
            if (focusDescription.current) descriptionRef.current?.focus();
            focusDescription.current = false;
          }}
        >
          <TextField
            id="request-description"
            label="Description (facultative)"
            fullWidth
            value={form.description}
            onChange={(e) => form.setDescription(e.target.value)}
            multiline
            minRows={2}
            inputRef={descriptionRef}
            sx={{ mt: 1 }}
            slotProps={{ htmlInput: { maxLength: 4000 } }}
          />
        </Collapse>
        {assist.similar && (
          <Collapse in={showSimilar} id={similarId}>
            <Box sx={{ pt: 1 }}>{assist.similar.list}</Box>
          </Collapse>
        )}
      </Box>

      {footer}
    </Paper>
  );
}
