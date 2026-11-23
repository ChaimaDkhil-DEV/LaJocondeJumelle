import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, apiFetch } from '../../api/client';
import { language, t } from '../../i18n';
import { loadTurnstile, type Turnstile } from './turnstile';

/** Attente maximale de la vérification après l'envoi du formulaire. */
const TOKEN_TIMEOUT_MS = 20_000;
/** Largeur minimale du widget normal ; en dessous (téléphone de 320 px), le widget compact. */
const FLEXIBLE_MIN_WIDTH = 300;

const captchaQuery = queryOptions({
  queryKey: ['captcha'],
  queryFn: () => apiFetch<{ siteKey?: string | null }>('/api/auth/captcha'),
  staleTime: Infinity,
  retry: false,
});

interface Waiter {
  resolve: (token: string) => void;
  reject: (error: ApiError) => void;
}

const notCompleted = () => new ApiError(0, 'CAPTCHA_FAILED', t('Connexion non envoyée : la vérification anti-robot n’a pas abouti.'));
const notFinished = () => new ApiError(0, 'CAPTCHA_PENDING', t('La vérification anti-robot n’est pas terminée. Terminez-la si elle s’affiche, puis réessayez.'));

export interface Captcha {
  /** À placer dans le formulaire ; vide si le CAPTCHA est désactivé. */
  widget: ReactNode;
  /** Jeton à usage unique, une fois la vérification finie ; undefined si le CAPTCHA est désactivé. */
  getToken: () => Promise<string | undefined>;
  /** À appeler après tout envoi refusé : un jeton ne sert qu'une fois. */
  afterFailure: (error: unknown) => void;
}

/**
 * CAPTCHA Cloudflare Turnstile d'un formulaire public. L'interface ne décide de rien : le serveur vérifie chaque jeton.
 * La clé publique vient de l'API, à l'exécution ; sans clé, rien n'est chargé depuis Cloudflare.
 */
export function useCaptcha(action: string): Captcha {
  const queryClient = useQueryClient();
  const theme = useTheme().palette.mode;
  const siteKey = useQuery(captchaQuery).data?.siteKey || null;

  const container = useRef<HTMLDivElement>(null);
  const rendered = useRef<{ turnstile: Turnstile; id: string } | null>(null);
  const token = useRef<string | null>(null);
  const tokenUsed = useRef(false);
  const failed = useRef(false);
  const waiters = useRef(new Set<Waiter>());
  const [failure, setFailure] = useState<'script' | 'widget' | null>(null);
  const [interactive, setInteractive] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = container.current;
    if (!siteKey || !element) return;
    let cancelled = false;
    const showFailure = (value: 'script' | 'widget' | null) => {
      failed.current = value !== null;
      setFailure(value);
    };
    const fail = (cause: 'script' | 'widget') => {
      token.current = null;
      showFailure(cause);
      for (const waiter of waiters.current) waiter.reject(notCompleted());
    };
    /** Un rappel tardif d'un widget retiré ne doit pas toucher au suivant. */
    const whileShown = (action: () => void) => () => {
      if (!cancelled) action();
    };

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return;
        const id = turnstile.render(element, {
          sitekey: siteKey,
          action,
          theme,
          language: language(),
          size: element.clientWidth >= FLEXIBLE_MIN_WIDTH ? 'flexible' : 'compact',
          appearance: 'interaction-only',
          callback: (value) => {
            if (cancelled) return;
            showFailure(null);
            const [waiter] = waiters.current;
            if (waiter) waiter.resolve(value);
            else token.current = value;
          },
          'expired-callback': whileShown(() => {
            token.current = null;
          }),
          // Sans valeur de retour, Turnstile écrit son code d'erreur dans la console : utile au diagnostic.
          'error-callback': whileShown(() => fail('widget')),
          'unsupported-callback': whileShown(() => fail('widget')),
          'before-interactive-callback': whileShown(() => setInteractive(true)),
          'after-interactive-callback': whileShown(() => setInteractive(false)),
        });
        if (id) rendered.current = { turnstile, id };
        else fail('widget');
      })
      .catch(() => {
        if (!cancelled) fail('script');
      });

    return () => {
      cancelled = true;
      token.current = null;
      failed.current = false;
      rendered.current?.turnstile.remove(rendered.current.id);
      rendered.current = null;
    };
  }, [siteKey, action, theme, attempt]);

  const getToken = useCallback(async () => {
    // Configuration illisible : le serveur décide, et refuse s'il exige un jeton.
    const config = await queryClient.ensureQueryData(captchaQuery).catch(() => null);
    if (!config?.siteKey) return undefined;
    if (failed.current) throw notCompleted();

    const ready = token.current;
    token.current = null;
    const value = ready ?? (await waitForToken(waiters.current));
    tokenUsed.current = true;
    return value;
  }, [queryClient]);

  const afterFailure = useCallback(
    (error: unknown) => {
      // Le CAPTCHA a pu être activé, ou désactivé en urgence (panne de Cloudflare), depuis l'ouverture de la page.
      if (error instanceof ApiError && error.code.startsWith('CAPTCHA_')) void queryClient.invalidateQueries(captchaQuery);
      // Vérification encore en cours : la laisser finir.
      if (!tokenUsed.current) return;
      tokenUsed.current = false;
      rendered.current?.turnstile.reset(rendered.current.id);
    },
    [queryClient],
  );

  function retry(): void {
    // La politique de sécurité du contenu est celle de la page chargée : si elle précède l'activation du CAPTCHA, seul un
    // rechargement débloque le script.
    if (failure === 'script') return window.location.reload();
    setFailure(null);
    setInteractive(false);
    setAttempt((n) => n + 1);
    void queryClient.invalidateQueries(captchaQuery);
  }

  const widget = siteKey && (
    <Box sx={{ mb: interactive || failure ? 2.5 : 0 }}>
      <Box ref={container} sx={{ textAlign: 'center', lineHeight: 0 }} />
      {failure && (
        <Alert severity="warning" sx={{ mt: interactive ? 2 : 0 }}>
          {t('La vérification anti-robot n’a pas pu démarrer. Vérifiez votre connexion internet ou désactivez votre bloqueur de contenu, puis relancez-la.')}
          <Button
            size="small"
            color="inherit"
            sx={{ mt: 1, display: 'block' }}
            onClick={retry}
          >
            {t('Relancer la vérification')}
          </Button>
        </Alert>
      )}
    </Box>
  );

  return { widget, getToken, afterFailure };
}

/** Prochain jeton du widget ; abandonne si la vérification échoue ou dure trop longtemps. */
function waitForToken(waiters: Set<Waiter>): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const settle = () => {
      clearTimeout(timer);
      waiters.delete(waiter);
    };
    const waiter: Waiter = {
      resolve: (value) => {
        settle();
        resolve(value);
      },
      reject: (error) => {
        settle();
        reject(error);
      },
    };
    const timer = setTimeout(() => waiter.reject(notFinished()), TOKEN_TIMEOUT_MS);
    waiters.add(waiter);
  });
}
