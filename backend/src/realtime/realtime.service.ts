import { Injectable, Logger } from '@nestjs/common';
import type { DeadlineStage, RequestStatus } from '@prisma/client';
import type { Server } from 'socket.io';

export type SessionEndReason = 'LOGOUT' | 'EXPIRED' | 'DEACTIVATED' | 'PASSWORD_RESET';

/** Vérifie qu'une session est toujours valide ; renvoie la raison de fin, ou null. */
export type SessionChecker = (sessionId: string) => Promise<'EXPIRED' | 'DEACTIVATED' | null>;

export interface SocketData {
  userId: string;
  sessionId: string;
  superAdmin: boolean;
}

export interface RequestUpdatedEvent {
  requestId: string;
  status: RequestStatus;
  version: number;
  overdueStage: DeadlineStage | null;
}

export const userRoom = (userId: string): string => `user:${userId}`;
export const sessionRoom = (sessionId: string): string => `session:${sessionId}`;
/** Super administrateurs actifs : supervision de toutes les demandes (tableau de bord). */
export const SUPER_ADMIN_ROOM = 'role:super-admin';

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
    const rooms = userRooms(userIds);
    if (rooms.length > 0) this.server.to(rooms).emit(event, payload);
  }

  /**
   * `request:updated` vers les lecteurs de la demande et, hors brouillon, les super administrateurs.
   * Un socket présent dans plusieurs salles ne reçoit l'événement qu'une fois.
   */
  emitRequestUpdated(userIds: Iterable<string | null | undefined>, payload: RequestUpdatedEvent): void {
    if (!this.server) return;
    const rooms = userRooms(userIds);
    if (payload.status !== 'DRAFT') rooms.push(SUPER_ADMIN_ROOM);
    if (rooms.length > 0) this.server.to(rooms).emit('request:updated', payload);
  }

  /** Aligne les connexions ouvertes d'un compte sur son rôle après une modification. */
  syncSuperAdminRoom(userId: string, superAdmin: boolean): void {
    if (!this.server) return;
    const sockets = this.server.in(userRoom(userId));
    if (superAdmin) sockets.socketsJoin(SUPER_ADMIN_ROOM);
    else sockets.socketsLeave(SUPER_ADMIN_ROOM);
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

/** Salles personnelles, doublons et identifiants vides ignorés. */
function userRooms(userIds: Iterable<string | null | undefined>): string[] {
  return [...new Set([...userIds].filter((id): id is string => Boolean(id)))].map(userRoom);
}
