import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Check, FileText, Sparkles } from 'lucide-react';
import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError } from '../../api/client';
import { useClientSettings } from '../../api/settings';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PRIORITY_LABELS } from '../../components/PriorityBadge';
import { font, icon } from '../../design/tokens';
import type { RequestFormState } from '../requests/RequestForm';
import type { VoiceRecording } from '../voice/VoiceRecorder';
import { requestSuggestions, requestTranscription, type SuggestionResult } from './api';

interface AssistPanelProps {
  form: RequestFormState;
  /** Jeton du dernier résultat (null : aucun), transmis à l'envoi de la demande. */
  onToken: (token: string | null) => void;
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Connexion du navigateur : les propositions passent par le serveur. */
function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: SuggestionResult }
  | { kind: 'error'; message: string };

function Row({ label, value, applyLabel, onApply }: { label: string; value: string; applyLabel: string; onApply: () => void }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, py: 0.75 }}>
      <Box sx={{ minWidth: 0, flex: '1 1 12rem' }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography sx={{ fontWeight: font.medium, overflowWrap: 'anywhere' }}>{value}</Typography>
      </Box>
      <Button size="small" variant="text" startIcon={<Check size={icon.sm} aria-hidden="true" />} aria-label={applyLabel} onClick={onApply}>
        Appliquer
      </Button>
    </Box>
  );
}

/**
 * Propositions automatiques (spec 009, US1, US4) sous les champs de « Nouvelle demande » : titre,
 * catégorie et priorité proposés d'après les consignes ; seul un clic les applique. Un vocal est
 * d'abord transcrit ; la transcription, à vérifier, reste distincte de la description.
 */
export function AssistPanel({ form, onToken }: AssistPanelProps) {
  const { assistSuggestions, assistTranscription } = useClientSettings();
  const online = useOnline();
  const titleId = useId();
  const [state, setState] = useState<State>({ kind: 'idle' });
  // Transcription liée à l'enregistrement : un nouveau vocal la rend caduque.
  const [transcript, setTranscript] = useState<{ voice: VoiceRecording; text: string } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  // Une nouvelle demande de propositions remplace la précédente : la réponse tardive est ignorée.
  const lastCall = useRef(0);

  const heading = (
    <Typography id={titleId} component="h2" variant="subtitle1" sx={{ fontWeight: font.medium, display: 'flex', alignItems: 'center', gap: 1 }}>
      <Sparkles size={icon.md} aria-hidden="true" />
      Propositions automatiques
    </Typography>
  );

  if (!assistSuggestions || !online) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {assistSuggestions ? 'Les propositions automatiques demandent une connexion.' : 'Les propositions automatiques ne sont pas disponibles.'}
      </Typography>
    );
  }

  const description = form.description.trim();
  const spoken = transcript && transcript.voice === form.voice ? transcript.text : null;
  const mustTranscribe = Boolean(form.voice) && spoken === null && assistTranscription;
  const canPropose = Boolean(description || spoken?.trim() || mustTranscribe);

  async function propose(): Promise<void> {
    const call = ++lastCall.current;
    setState({ kind: 'loading' });
    try {
      let heard = spoken;
      if (mustTranscribe && form.voice) {
        const voice = form.voice;
        heard = (await requestTranscription(voice)).text;
        if (call !== lastCall.current) return;
        setTranscript({ voice, text: heard });
      }
      const text = [description, heard?.trim()].filter(Boolean).join('\n');
      const result = await requestSuggestions(text);
      if (call !== lastCall.current) return;
      setState({ kind: 'done', result });
      onToken(result.token);
    } catch (error) {
      if (call !== lastCall.current) return;
      setState({ kind: 'error', message: error instanceof ApiError ? error.message : 'Les propositions ne sont pas disponibles pour le moment.' });
    }
  }

  const result = state.kind === 'done' ? state.result : null;
  const suggestion = result?.suggestion ?? null;
  const categoryName = suggestion?.categoryId ? form.categories.find((c) => c.id === suggestion.categoryId)?.name : undefined;

  const applyTitle = () => suggestion?.title && form.setTitle(suggestion.title);
  const applyCategory = () => categoryName && suggestion?.categoryId && form.setCategoryId(suggestion.categoryId);
  const applyPriority = () => suggestion?.priority && form.setPriority(suggestion.priority);

  return (
    <Paper component="section" variant="outlined" aria-labelledby={titleId} sx={{ mt: 2, p: { xs: 2, md: 2.5 } }}>
      {heading}
      <Box sx={{ mt: 1.5 }}>
        {/* Reste actif pendant le chargement : une nouvelle demande remplace la précédente. */}
        <Button
          variant="outlined"
          disabled={!canPropose}
          aria-busy={state.kind === 'loading'}
          startIcon={
            state.kind === 'loading' ? <CircularProgress size={icon.sm} aria-hidden="true" /> : <Sparkles size={icon.sm} aria-hidden="true" />
          }
          onClick={() => void propose()}
        >
          Proposer une catégorie et une priorité
        </Button>
        {!canPropose && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Écrivez une description ou enregistrez un vocal.
          </Typography>
        )}
      </Box>

      {spoken !== null && transcript && (
        <Box sx={{ mt: 2 }}>
          <TextField
            id="assist-transcription"
            label="Transcription (à vérifier)"
            multiline
            minRows={2}
            fullWidth
            value={spoken}
            onChange={(e) => setTranscript({ voice: transcript.voice, text: e.target.value })}
            helperText="Corrigez le texte si besoin : il sert aux propositions, pas à la demande."
            slotProps={{ htmlInput: { maxLength: 4000 } }}
          />
          <Button
            size="small"
            sx={{ mt: 1 }}
            disabled={!spoken.trim()}
            startIcon={<FileText size={icon.sm} aria-hidden="true" />}
            onClick={() => (description ? setConfirmReplace(true) : form.setDescription(spoken.trim()))}
          >
            Utiliser comme description
          </Button>
        </Box>
      )}
      <ConfirmDialog
        open={confirmReplace}
        title="Remplacer la description actuelle ?"
        confirmLabel="Remplacer"
        onConfirm={() => {
          if (spoken) form.setDescription(spoken.trim());
          setConfirmReplace(false);
        }}
        onClose={() => setConfirmReplace(false)}
      >
        La description saisie sera remplacée par la transcription du message vocal.
      </ConfirmDialog>

      <Box aria-live="polite" sx={{ mt: 1.5 }}>
        {state.kind === 'loading' && (
          <Typography variant="body2" color="text.secondary">
            Recherche de propositions…
          </Typography>
        )}
        {state.kind === 'error' && <Alert severity="warning">{state.message}</Alert>}
        {result && !suggestion && (
          <Typography variant="body2">Aucune proposition fiable n’a pu être faite. Vous pouvez remplir la demande vous-même.</Typography>
        )}
        {suggestion && (
          <Box>
            {suggestion.title && <Row label="Titre" value={suggestion.title} applyLabel="Appliquer le titre proposé" onApply={applyTitle} />}
            {categoryName && <Row label="Catégorie" value={categoryName} applyLabel="Appliquer la catégorie proposée" onApply={applyCategory} />}
            {suggestion.priority && (
              <Row
                label="Priorité"
                value={PRIORITY_LABELS[suggestion.priority]}
                applyLabel="Appliquer la priorité proposée"
                onApply={applyPriority}
              />
            )}
            <Button
              variant="contained"
              size="small"
              sx={{ mt: 1 }}
              onClick={() => {
                applyTitle();
                applyCategory();
                applyPriority();
              }}
            >
              Tout appliquer
            </Button>
            {suggestion.reason && (
              <Typography variant="body2" sx={{ mt: 1.5 }}>
                <Box component="span" sx={{ fontWeight: font.medium }}>
                  Pourquoi :{' '}
                </Box>
                <span>{suggestion.reason}</span>
              </Typography>
            )}
            {suggestion.missing.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: font.medium }}>
                  À préciser :
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {suggestion.missing.map((m) => (
                    <Typography component="li" variant="body2" key={m}>
                      {m}
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        )}
        {result && (
          <Box sx={{ mt: 1.5 }}>
            {result.noGuideline || result.sources.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Aucune consigne ne correspond à cette demande.
              </Typography>
            ) : (
              <>
                <Typography variant="body2" sx={{ fontWeight: font.medium }}>
                  Consignes utilisées
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {result.sources.map((s) => (
                    <Box component="li" key={s.id} sx={{ mt: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: font.medium, overflowWrap: 'anywhere' }}>
                        {s.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                        {s.excerpt}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </>
            )}
          </Box>
        )}
      </Box>
    </Paper>
  );
}
