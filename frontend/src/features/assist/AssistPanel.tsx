import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { CircleAlert } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { ApiError } from '../../api/client';
import { useClientSettings } from '../../api/settings';
import { StatusBadge } from '../../components/StatusBadge';
import { visuallyHidden } from '../../components/a11y';
import { font, tokensOf } from '../../design/tokens';
import { SUGGESTED_HINT, type FormChange, type RequestFormState, type SuggestedValues } from '../requests/RequestForm';
import type { VoiceRecording } from '../voice/VoiceRecorder';
import { requestSuggestions, requestTranscription, type Suggestion, type SuggestionResult } from './api';

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
  | { kind: 'transcribing' }
  | { kind: 'analysing' }
  | { kind: 'done'; result: SuggestionResult }
  | { kind: 'error'; message: string };

/** Vocal et catégorie à partir desquels les propositions affichées ont été calculées. */
interface Basis {
  voice: VoiceRecording | null;
  categoryId: string | undefined;
}

const VOICE_KEPT = 'Votre message vocal est conservé : remplissez les champs vous-même ou relancez l’analyse.';

/**
 * Propositions automatiques (spec 009, US1, US4) du formulaire « Nouvelle demande ». Dès qu'un vocal
 * est enregistré, il est transcrit puis analysé : catégorie, destinataire (règles d'affectation),
 * priorité et titre proposés remplissent les champs vides ou déjà proposés, jamais un choix de
 * l'utilisateur. Le vocal n'est jamais touché : une analyse en échec le laisse dans le formulaire,
 * prêt à l'envoi. Affichage réduit : badge « Suggéré » sur les champs (RequestFields), une phrase
 * sous le vocal (AssistNote), destinataire à confirmer, demandes similaires repliées.
 */
export function useAssist(form: RequestFormState, onToken: (token: string | null) => void) {
  const { assistSuggestions, assistTranscription } = useClientSettings();
  const online = useOnline();
  const [state, setState] = useState<State>({ kind: 'idle' });
  // Transcription liée à l'enregistrement : un nouveau vocal la rend caduque.
  const [transcript, setTranscript] = useState<{ voice: VoiceRecording; text: string } | null>(null);
  const [basis, setBasis] = useState<Basis | null>(null);
  // Une nouvelle demande de propositions remplace la précédente : la réponse tardive est ignorée.
  const lastCall = useRef(0);
  // Formulaire du dernier rendu : une réponse arrive parfois après des saisies de l'utilisateur.
  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  });
  const available = assistSuggestions && online;

  /** Reprend les propositions dans les champs vides ou déjà proposés ; un choix manuel reste. */
  function applyResult(suggestion: Suggestion | null): void {
    if (!suggestion) return;
    const current = formRef.current;
    const values: SuggestedValues = {};
    // Changer de catégorie effacerait un destinataire choisi à la main : on ne le fait pas.
    const recipientManual = current.isManual('recipientId');
    let category = current.categoryId;
    if (suggestion.categoryId && !current.isManual('categoryId') && !recipientManual) {
      values.categoryId = suggestion.categoryId;
      category = suggestion.categoryId;
    }
    if (suggestion.recipientId && category === suggestion.categoryId && !recipientManual) values.recipientId = suggestion.recipientId;
    if (suggestion.priority && !current.isManual('priority')) values.priority = suggestion.priority;
    if (suggestion.title && !current.isManual('title')) values.title = suggestion.title;
    current.applySuggestion(values);
  }

  /** `changed` : saisie qui vient d'avoir lieu, pas encore visible dans `form`. */
  async function propose(changed: { voice?: VoiceRecording | null; categoryId?: string } = {}): Promise<void> {
    const call = ++lastCall.current;
    const current = formRef.current;
    const voice = 'voice' in changed ? (changed.voice ?? null) : current.voice;
    const description = current.description.trim();
    // Catégorie choisie par l'utilisateur : conservée, elle oriente destinataire et priorité.
    const chosenCategory = changed.categoryId ?? (current.isManual('categoryId') ? current.categoryId : undefined);
    let heard = transcript && transcript.voice === voice ? transcript.text : null;
    try {
      if (voice && heard === null && assistTranscription) {
        setState({ kind: 'transcribing' });
        try {
          heard = (await requestTranscription(voice)).text;
        } catch (error) {
          if (call !== lastCall.current) return;
          const reason = error instanceof ApiError ? error.message : 'La transcription du message vocal n’a pas abouti.';
          setState({ kind: 'error', message: `${reason} ${VOICE_KEPT}` });
          return;
        }
        if (call !== lastCall.current) return;
        setTranscript({ voice, text: heard });
      }
      const text = [description, heard?.trim()].filter(Boolean).join('\n');
      if (!text) {
        setState({ kind: 'idle' });
        return;
      }
      setState({ kind: 'analysing' });
      const result = await requestSuggestions(text, chosenCategory);
      if (call !== lastCall.current) return;
      setState({ kind: 'done', result });
      setBasis({ voice, categoryId: result.suggestion?.categoryId ?? chosenCategory });
      onToken(result.token);
      applyResult(result.suggestion);
    } catch (error) {
      if (call !== lastCall.current) return;
      const reason = error instanceof ApiError ? error.message : 'Les propositions ne sont pas disponibles pour le moment.';
      setState({ kind: 'error', message: voice ? `${reason} ${VOICE_KEPT}` : reason });
    }
  }

  /**
   * Nouveau vocal (ou vocal supprimé) : les propositions de l'ancien ne valent plus et sont retirées
   * des champs (les choix de l'utilisateur restent) ; un nouveau vocal est aussitôt analysé.
   */
  const onVoiceChange = (voice: VoiceRecording | null) => {
    const pending = state.kind === 'transcribing' || state.kind === 'analysing';
    if ((basis && basis.voice !== voice) || pending || state.kind === 'error') {
      lastCall.current++;
      setState({ kind: 'idle' });
      setBasis(null);
      onToken(null);
      if (basis?.voice) formRef.current.clearSuggested();
    }
    if (voice && available && assistTranscription) void propose({ voice });
  };

  /** Catégorie choisie à la main après une analyse : nouvelle proposition de destinataire. */
  const onCategoryChange = (categoryId: string) => {
    if (state.kind !== 'done' || !categoryId || categoryId === basis?.categoryId) return;
    if (formRef.current.categories.find((c) => c.id === categoryId)?.circuit !== 'A_DIRECT') return;
    void propose({ categoryId });
  };

  const onFormChange = useEffectEvent((change: FormChange) =>
    change.type === 'voice' ? onVoiceChange(change.voice) : onCategoryChange(change.categoryId),
  );
  const { subscribe } = form;
  useEffect(() => subscribe((change) => onFormChange(change)), [subscribe]);

  const description = form.description.trim();
  const spoken = transcript && transcript.voice === form.voice ? transcript.text : null;
  const mustTranscribe = Boolean(form.voice) && spoken === null && assistTranscription;
  const result = state.kind === 'done' ? state.result : null;

  return {
    form,
    available,
    state,
    busy: state.kind === 'transcribing' || state.kind === 'analysing',
    canPropose: Boolean(description || spoken?.trim() || mustTranscribe),
    hasBasis: Boolean(basis),
    propose: () => void propose(),
    result,
    // Après une analyse, un destinataire encore vide (circuit A) demande une action : à confirmer.
    recipientToConfirm: Boolean(result && form.isCircuitA && !form.recipientId),
  };
}

export type Assist = ReturnType<typeof useAssist>;

/** Petit lien texte de la phrase sous le vocal (cible tactile ≥ 44 px). */
const linkSx = { minHeight: 44, px: 0.75, py: 0, fontSize: 13, fontWeight: font.medium } as const;

/**
 * Une seule phrase, en petit et en gris, sous le message vocal : analyse en cours, « Champs
 * préremplis d'après votre message : vérifiez-les. » (avec « Voir pourquoi », replié), ou erreur
 * (le vocal reste dans le formulaire). Petits liens pour relancer ou lancer l'analyse.
 */
export function AssistNote({ assist }: { assist: Assist }) {
  const { form, state, busy, result } = assist;
  const [showWhy, setShowWhy] = useState(false);
  const whyId = useId();
  if (!assist.available) return null;

  const suggestion = result?.suggestion ?? null;
  let sentence: string | null = null;
  if (state.kind === 'transcribing') sentence = 'Transcription du message vocal…';
  else if (state.kind === 'analysing') sentence = 'Recherche de propositions…';
  else if (state.kind === 'error') sentence = state.message;
  else if (result && !suggestion) sentence = 'Aucune suggestion fiable : remplissez les champs vous-même.';
  else if (suggestion && form.suggested.size > 0) sentence = SUGGESTED_HINT;
  const why = [suggestion?.reason, suggestion?.recipientReason && `Destinataire : ${suggestion.recipientReason}`].filter(Boolean);
  // Description seule, sans vocal : rien ne se déclenche tout seul, l'analyse se demande ici.
  const action = assist.hasBasis || state.kind === 'error' ? 'Relancer l’analyse' : 'Proposer une catégorie et une priorité';
  if (!sentence && !assist.canPropose && !assist.hasBasis) return null;

  return (
    <Box aria-live="polite">
      <Box
        sx={(theme) => ({
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 0.5,
          color: state.kind === 'error' ? tokensOf(theme).warning.text : tokensOf(theme).textSecondary,
        })}
      >
        {busy && <CircularProgress size={12} aria-hidden="true" sx={{ color: 'inherit', mr: 0.5 }} />}
        {state.kind === 'error' && <CircleAlert size={14} aria-hidden="true" style={{ flex: 'none', marginRight: 4 }} />}
        {sentence && (
          <Typography component="span" sx={{ fontSize: 13, color: 'inherit', mr: 0.5 }}>
            {sentence}
          </Typography>
        )}
        {state.kind === 'done' && why.length > 0 && (
          <Button size="small" variant="text" aria-expanded={showWhy} aria-controls={whyId} onClick={() => setShowWhy((v) => !v)} sx={linkSx}>
            Voir pourquoi
          </Button>
        )}
        {/* Reste actif pendant le chargement : une nouvelle demande remplace la précédente. */}
        {assist.canPropose && (
          <Button size="small" variant="text" onClick={assist.propose} sx={linkSx}>
            {action}
          </Button>
        )}
      </Box>
      {state.kind === 'done' && why.length > 0 && (
        <Collapse in={showWhy} id={whyId}>
          <Box sx={{ display: 'grid', gap: 0.25, pb: 0.5 }}>
            {why.map((line) => (
              <Typography key={line} sx={{ fontSize: 13 }} color="text.secondary">
                {line}
              </Typography>
            ))}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

/**
 * Demandes similaires (spec 010), pour le lien repliable du formulaire : libellé (« 3 demandes
 * similaires ») et liste, une ligne par demande (référence, titre, statut), ouverte dans un nouvel
 * onglet pour laisser le formulaire intact.
 */
export function similarRequestsSlot(assist: Assist): { label: string; list: ReactNode } | null {
  const similar = assist.result?.similar ?? [];
  if (similar.length === 0) return null;
  return {
    label: similar.length === 1 ? '1 demande similaire' : `${similar.length} demandes similaires`,
    list: (
      <Box component="ul" aria-label="Demandes similaires" sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {similar.map((r) => (
          <Box
            component="li"
            key={r.id}
            sx={(theme) => ({ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, minHeight: 44, borderTop: `1px solid ${tokensOf(theme).border}` })}
          >
            <Link
              component={RouterLink}
              to={`/demandes/${r.id}`}
              target="_blank"
              rel="noopener noreferrer"
              variant="body2"
              sx={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {r.reference} · {r.title}
              <Box component="span" sx={visuallyHidden}>
                {' '}
                (nouvel onglet)
              </Box>
            </Link>
            <StatusBadge status={r.status} />
          </Box>
        ))}
      </Box>
    ),
  };
}
