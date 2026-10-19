import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { io } from 'socket.io-client';
import { requestKeys } from '../requests/api';
import { messageKeys } from '../thread/api';
import { NOTIFICATIONS_KEY, type NotificationEvent } from './api';

/** Sous-ensemble du client Socket.IO utilisé (permet un faux client dans les tests). */
export interface SocketLike {
  on(event: string, handler: (...args: never[]) => void): unknown;
  disconnect(): unknown;
}

interface RealtimeState {
  /** Dernière notification reçue en temps réel (annonces et bandeau). */
  latest: NotificationEvent | null;
  dismissLatest: () => void;
}

const RealtimeContext = createContext<RealtimeState>({ latest: null, dismissLatest: () => undefined });

export function useRealtime(): RealtimeState {
  return useContext(RealtimeContext);
}

function defaultSocket(): SocketLike {
  // Même origine que l'application : le cookie de session authentifie la connexion.
  return io({ path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
}

/**
 * Connexion temps réel (research R9) : à chaque (re)connexion, relit les notifications non lues ;
 * chaque événement invalide les données concernées, relues par REST avec le contrôle d'accès habituel.
 * Ni push ni service worker : uniquement pendant que l'application est ouverte.
 */
export function SocketProvider({
  children,
  createSocket = defaultSocket,
}: {
  children: ReactNode;
  createSocket?: () => SocketLike;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [latest, setLatest] = useState<NotificationEvent | null>(null);

  useEffect(() => {
    const socket = createSocket();
    const invalidate = (queryKey: readonly unknown[]) => void queryClient.invalidateQueries({ queryKey });

    socket.on('connect', () => {
      invalidate(NOTIFICATIONS_KEY);
      invalidate(requestKeys.all);
      invalidate(['coverage']);
    });
    socket.on('notification:new', (event?: NotificationEvent) => {
      invalidate(NOTIFICATIONS_KEY);
      invalidate(['requests', 'list']);
      if (event) setLatest(event);
    });
    socket.on('request:updated', (event?: { requestId: string }) => {
      if (event) invalidate(requestKeys.detail(event.requestId));
      invalidate(['requests', 'list']);
      // Tableau de bord : le super administrateur reçoit toutes les mises à jour de demande ; relu aussi
      // chaque minute pour les messages et le passage du temps.
      invalidate(['dashboard']);
    });
    // Couvertures de classe : listes « À prendre », « Ma garde », suivi en direct (relues par REST).
    socket.on('coverage:updated', () => invalidate(['coverage']));
    socket.on('coverage:taken', () => invalidate(['coverage']));
    socket.on('message:new', (event?: { requestId: string }) => {
      if (event) invalidate(messageKeys.thread(event.requestId));
    });
    socket.on('session:ended', () => {
      socket.disconnect();
      queryClient.clear();
      navigate('/connexion', { replace: true });
    });

    return () => {
      socket.disconnect();
    };
  }, [createSocket, navigate, queryClient]);

  return (
    <RealtimeContext.Provider value={{ latest, dismissLatest: () => setLatest(null) }}>
      {children}
    </RealtimeContext.Provider>
  );
}
