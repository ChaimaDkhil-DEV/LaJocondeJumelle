import { Inject, Injectable, Optional } from '@nestjs/common';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';

export const LOGIN_FAILURES_PER_USERNAME = 10;
/** Large : toute une école peut partager une adresse IP. */
export const LOGIN_FAILURES_PER_IP = 100;
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60_000;
const MAX_TRACKED_KEYS = 10_000;
/** Jeton facultatif : les tests fournissent leur horloge directement au constructeur. */
const LOGIN_CLOCK = Symbol('LOGIN_CLOCK');

interface Window {
  count: number;
  expiresAt: number;
  blockReported: boolean;
}

/**
 * Limite des échecs de connexion, en complément de la limite par couple (IP, identifiant) : par
 * identifiant contre le ciblage d'un compte, par IP contre l'essai d'un mot de passe sur tous les
 * comptes. Seuls les échecs comptent, pour ne pas bloquer une école à l'heure d'arrivée. Chaque
 * tentative est réservée avant argon2 : une rafale parallèle ne peut donc pas dépasser la limite.
 * En mémoire : l'API a une seule instance, et un redémarrage remet les compteurs à zéro.
 */
@Injectable()
export class LoginAttemptLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly perUsername: number;
  private readonly perIp: number;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Optional() @Inject(LOGIN_CLOCK) private readonly now: () => number = Date.now,
  ) {
    // Hors production, LOGIN_RATE_LIMIT relève la limite pour les tests de bout en bout.
    this.perUsername = Math.max(LOGIN_FAILURES_PER_USERNAME, config.loginRateLimit);
    this.perIp = Math.max(LOGIN_FAILURES_PER_IP, config.loginRateLimit);
  }

  /** Réserve une tentative ; `firstBlock` n'est vrai qu'une fois par fenêtre, pour le journal. */
  reserve(ip: string | null, username: string): { allowed: boolean; firstBlock: boolean } {
    const byIp = this.window(`ip:${ip ?? 'inconnue'}`);
    const byUsername = this.window(`user:${username}`);
    const blocked = [byIp.count >= this.perIp ? byIp : null, byUsername.count >= this.perUsername ? byUsername : null].filter(
      (window): window is Window => window !== null,
    );
    if (blocked.length > 0) {
      const firstBlock = blocked.some((window) => !window.blockReported);
      for (const window of blocked) window.blockReported = true;
      return { allowed: false, firstBlock };
    }
    byIp.count += 1;
    byUsername.count += 1;
    return { allowed: true, firstBlock: false };
  }

  /** Une réussite efface les échecs du compte et rend sa place à l'adresse IP. */
  succeed(ip: string | null, username: string): void {
    this.windows.delete(`user:${username}`);
    const byIp = this.windows.get(`ip:${ip ?? 'inconnue'}`);
    if (byIp && byIp.count > 0) byIp.count -= 1;
  }

  trackedKeys(): number {
    return this.windows.size;
  }

  private window(key: string): Window {
    const current = this.windows.get(key);
    if (current && current.expiresAt > this.now()) return current;
    this.windows.delete(key);
    this.makeRoom();
    const created: Window = { count: 0, expiresAt: this.now() + LOGIN_FAILURE_WINDOW_MS, blockReported: false };
    this.windows.set(key, created);
    return created;
  }

  /** Les clés les plus anciennes partent d'abord : un Map garde l'ordre d'insertion. */
  private makeRoom(): void {
    while (this.windows.size >= MAX_TRACKED_KEYS) {
      const oldest = this.windows.keys().next().value;
      if (oldest === undefined) return;
      this.windows.delete(oldest);
    }
  }
}
