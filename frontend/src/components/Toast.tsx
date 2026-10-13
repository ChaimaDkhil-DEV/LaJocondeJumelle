import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { shadow } from '../design/tokens';

type ToastSeverity = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  text: string;
  severity: ToastSeverity;
}

interface ToastApi {
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
}

const noop = () => undefined;
/** Hors fournisseur (tests de composants isolés), les toasts sont simplement ignorés. */
const ToastContext = createContext<ToastApi>({ success: noop, error: noop, info: noop });

/** Retour discret après une action : succès, information ou erreur, en bas de l'écran. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback((severity: ToastSeverity, text: string) => {
    setToast({ id: Date.now(), text, severity });
    setOpen(true);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (text) => show('success', text),
      error: (text) => show('error', text),
      info: (text) => show('info', text),
    }),
    [show],
  );

  // Seuls les toasts d'erreur restent interactifs (bouton « Fermer ») ; les autres se ferment seuls.
  const interactive = toast?.severity === 'error';

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Snackbar
        key={toast?.id}
        open={open}
        autoHideDuration={interactive ? 8000 : 5000}
        // Un toast de confirmation ne doit jamais masquer ni bloquer l'écran : il laisse passer les clics
        // (utile sur mobile, où il recouvre le bas de la page) et disparaît seul, même survolé.
        disableWindowBlurListener
        sx={interactive ? undefined : { pointerEvents: 'none' }}
        onClose={(_e, reason) => reason !== 'clickaway' && setOpen(false)}
      >
        {toast ? (
          <Alert
            severity={toast.severity}
            role={interactive ? 'alert' : 'status'}
            onClose={interactive ? () => setOpen(false) : undefined}
            sx={{ width: '100%', maxWidth: 480, boxShadow: shadow, bgcolor: 'background.paper', pointerEvents: interactive ? 'auto' : 'none' }}
          >
            {toast.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}
