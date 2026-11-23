/** Script officiel de Cloudflare Turnstile : chargé depuis Cloudflare seulement, jamais copié ni mis en cache ici. */
export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Au-delà, le script est considéré comme bloqué (pare-feu qui ne répond pas). */
const SCRIPT_TIMEOUT_MS = 15_000;

/** Options utilisées (documentation : « Widget configurations »). */
export interface TurnstileOptions {
  sitekey: string;
  action: string;
  theme: 'light' | 'dark';
  language: string;
  size: 'flexible' | 'compact';
  appearance: 'interaction-only';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
  'unsupported-callback': () => void;
  'before-interactive-callback': () => void;
  'after-interactive-callback': () => void;
}

export interface Turnstile {
  render(container: HTMLElement, options: TurnstileOptions): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;

/** Charge le script une seule fois ; après un échec (réseau, bloqueur), l'appel suivant le recharge. */
export function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => fail(), SCRIPT_TIMEOUT_MS);
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error('Script Turnstile indisponible'));
    };
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (!window.turnstile) return fail();
      clearTimeout(timer);
      resolve(window.turnstile);
    };
    script.onerror = fail;
    document.head.append(script);
  }).finally(() => {
    loading = null;
  });
  return loading;
}
