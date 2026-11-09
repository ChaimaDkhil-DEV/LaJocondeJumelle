import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { useMarkRead } from '../notifications/api';

/**
 * Ouverture depuis un push (spec 014, FR-008) : le service worker ouvre la ressource avec
 * `?notification=<id>`. La notification n'est marquée lue qu'une fois la ressource chargée avec succès,
 * donc après le contrôle des droits par le serveur ; puis le paramètre est retiré de l'adresse.
 * Un clic seul, une redirection vers la connexion ou un chargement en erreur ne marquent rien.
 */
export function useMarkReadFromPush(loaded: boolean): void {
  const [params, setParams] = useSearchParams();
  const notificationId = params.get('notification');
  const { mutate: markRead } = useMarkRead();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!loaded || !notificationId || handled.current === notificationId) return;
    handled.current = notificationId;
    markRead({ ids: [notificationId] });
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('notification');
        return next;
      },
      { replace: true },
    );
  }, [loaded, notificationId, markRead, setParams]);
}
