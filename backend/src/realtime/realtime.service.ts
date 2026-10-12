import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

export type SessionEndReason = 'LOGOUT' | 'EXPIRED' | 'DEACTIVATED';

/** Vérifie qu'une session est toujours valide ; renvoie la raison de fin, ou null. */
export type SessionChecker = (sessionId: string) => Promise<'EXPIRED' | 'DEACTIVATED' | null>;

export interface SocketData {
  userId: string;
  sessionId: string;
}

export const userRoom = (userId: string): string => `user:${userId}`;
export const sessionRoom = (sessionId: string): string => `session:${sessionId}`;

/**
 * Diffusion temps réel (contracts/realtime-events.md). Les événements ne contiennent que des
 * identifiants et métadonnées : le client relit les données par REST, avec le même contrôle d'accès.
 * Sans serveur Socket.IO attaché (tests, démarrage), les émissions sont ignorées.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;
  private checkSession: SessionChecker | null = null;

  attach(server: Server, checkSession: SessionChecker): void {
    this.server = server;
    this.checkSession = checkSession;
  }

  /** Émet un événement dans la salle personnelle de chaque utilisateur (doublons et vides ignorés). */
  emitToUsers(userIds: Iterable<string | null | undefined>, event: string, payload: unknown): void {
    if (!this.server) return;
    const rooms = [...new Set([...userIds].filter((id): id is string => Boolean(id)))].map(userRoom);
    if (rooms.length > 0) this.server.to(rooms).emit(event, payload);
  }

  /** Prévient puis ferme les connexions d'une session (déconnexion). */
  endSession(sessionId: string, reason: SessionEndReason): void {
    this.end(sessionRoom(sessionId), reason);
  }

  /** Prévient puis ferme toutes les connexions d'un utilisateur (compte désactivé). */
  endUserSessions(userId: string, reason: SessionEndReason): void {
    this.end(userRoom(userId), reason);
  }

  /** Ferme les connexions dont la session a expiré ou dont le compte a été désactivé. */
  async revalidateSessions(): Promise<number> {
    if (!this.server || !this.checkSession) return 0;
    const sessionIds = new Set<string>();
    for (const socket of this.server.of('/').sockets.values()) {
      const data = socket.data as Partial<SocketData>;
      if (data.sessionId) sessionIds.add(data.sessionId);
    }
    let ended = 0;
    for (const sessionId of sessionIds) {
      const reason = await this.checkSession(sessionId);
      if (reason) {
        this.endSession(sessionId, reason);
        ended += 1;
      }
    }
    if (ended > 0) this.logger.log(`${ended} session(s) temps réel fermée(s)`);
    return ended;
  }

  private end(room: string, reason: SessionEndReason): void {
    if (!this.server) return;
    this.server.to(room).emit('session:ended', { reason });
    // Déconnexion de l'espace de noms (paquet envoyé après session:ended, dans l'ordre).
    this.server.in(room).disconnectSockets(false);
  }
}
