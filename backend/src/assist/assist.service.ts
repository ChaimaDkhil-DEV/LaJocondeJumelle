import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Priority } from '@prisma/client';
import { rm } from 'node:fs/promises';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { signAssistToken } from '../common/assist-token';
import { AppException } from '../common/errors';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { FilesService, type UploadedTempFile } from '../files/files.service';
import { canCreateInCategory } from '../requests/domain/access-policy';
import { RequestPolicyLoader, toPolicyCategory } from '../requests/request-policy.loader';
import type { RequestContext } from '../requests/requests.service';
import { AssistRateLimiter } from './assist-rate-limiter';
import { sanitizeSuggestion } from './domain/sanitize-suggestion';
import { GuidelinesService } from './guidelines.service';
import { SimilarRequestsService, type SimilarRequest } from './similar-requests.service';
import {
  SUGGESTION_PROVIDER,
  TRANSCRIPTION_PROVIDER,
  type SuggestionProvider,
  type TranscriptionProvider,
} from './providers/assist-providers';

/** Longueur maximale d'une transcription renvoyée (celle d'une description). */
const MAX_TRANSCRIPT = 4000;

export interface SuggestionResult {
  suggestion: {
    title?: string;
    categoryId?: string;
    priority?: Priority;
    reason?: string;
    missing: string[];
  } | null;
  /** Consignes citées par la proposition. */
  sources: Array<{ id: string; title: string; excerpt: string }>;
  /** Aucune consigne retrouvée pour ce texte. */
  noGuideline: boolean;
  /** Jeton signé à joindre à l'envoi de la demande (research R6) ; null sans proposition. */
  token: string | null;
  /** Demandes similaires visibles par l'utilisateur (spec 010), 3 au plus. */
  similar: SimilarRequest[];
}

/**
 * Propositions automatiques (spec 009, US1) : calculées à la demande, jamais conservées. Le texte
 * envoyé n'est ni stocké ni journalisé ; seules les catégories et consignes autorisées pour
 * l'utilisateur sont transmises au fournisseur, dont la réponse est contrôlée champ par champ.
 */
@Injectable()
export class AssistService {
  private readonly logger = new Logger(AssistService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SUGGESTION_PROVIDER) private readonly suggestions: SuggestionProvider | null,
    @Inject(TRANSCRIPTION_PROVIDER) private readonly transcriptions: TranscriptionProvider | null,
    private readonly files: FilesService,
    private readonly policies: RequestPolicyLoader,
    private readonly guidelines: GuidelinesService,
    private readonly similarRequests: SimilarRequestsService,
    private readonly limiter: AssistRateLimiter,
    private readonly audit: AuditService,
  ) {}

  async suggest(user: AuthenticatedUser, text: string, ctx: RequestContext): Promise<SuggestionResult> {
    const provider = this.suggestions;
    if (!provider) throw new AppException('ASSIST_DISABLED');
    const categories = await this.creatableCategories(user, ctx);
    await this.consume(user, ctx);

    const [found, similar] = await Promise.all([
      this.guidelines.search(
        text,
        categories.map((c) => c.id),
      ),
      this.similarRequests.find(user, text),
    ]);
    const started = Date.now();
    const raw = await this.callProvider('Propositions', provider.name, this.config.assist.timeoutMs, (signal) =>
      provider.suggest(
        {
          text,
          categories,
          guidelines: found.map(({ id, title, body, categoryId }) => ({ id, title, body, categoryId })),
          similar: similar.map(({ title, categoryName, priority }) => ({ title, categoryName, priority })),
        },
        signal,
      ),
    );

    const { suggestion, discarded } = sanitizeSuggestion(raw, {
      categoryIds: categories.map((c) => c.id),
      sourceIds: found.map((g) => g.id),
    });
    this.logger.log(
      `Propositions (fournisseur ${provider.name}, ${Date.now() - started} ms, ${found.length} consigne(s), ${discarded} champ(s) écarté(s))`,
    );

    const sources = found
      .filter((g) => suggestion?.sourceIds.includes(g.id))
      .map(({ id, title, excerpt }) => ({ id, title, excerpt }));
    if (!suggestion) return { suggestion: null, sources, noGuideline: found.length === 0, token: null, similar };

    // Les consignes citées sont renvoyées dans `sources`, pas dans la proposition.
    const { title, categoryId, priority, reason, missing } = suggestion;
    const fields = {
      ...(title !== undefined ? { title } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(reason !== undefined ? { reason } : {}),
      missing,
    };
    const token = signAssistToken(
      this.config.sessionSecret,
      user.id,
      {
        ...(fields.title !== undefined ? { title: fields.title } : {}),
        ...(fields.categoryId !== undefined ? { categoryId: fields.categoryId } : {}),
        ...(fields.priority !== undefined ? { priority: fields.priority } : {}),
        sources: sources.map(({ id, title }) => ({ id, title })),
      },
      new Date(),
    );
    return { suggestion: fields, sources, noGuideline: found.length === 0, token, similar };
  }

  /**
   * Transcription d'un vocal (spec 009, US4) : mêmes contrôles qu'un envoi de vocal, puis appel du
   * fournisseur. Rien n'est conservé : ni ligne File, ni fichier, ni texte.
   */
  async transcribe(user: AuthenticatedUser, temp: UploadedTempFile, ctx: RequestContext): Promise<{ text: string }> {
    let converted: string | null = null;
    try {
      const provider = this.transcriptions;
      if (!provider) throw new AppException('ASSIST_DISABLED');
      await this.creatableCategories(user, ctx);
      await this.consume(user, ctx);

      const voice = await this.files.prepareVoice(temp);
      converted = voice.path;
      const started = Date.now();
      const raw = await this.callProvider('Transcription', provider.name, this.config.assist.transcriptionTimeoutMs, (signal) =>
        provider.transcribe({ path: voice.path, mimeType: voice.mimeType, durationSeconds: voice.durationSeconds }, signal),
      );
      const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TRANSCRIPT).trim() : '';
      this.logger.log(`Transcription (fournisseur ${provider.name}, ${Date.now() - started} ms, ${text.length} caractère(s))`);
      if (!text) throw new AppException('TRANSCRIPTION_EMPTY');
      return { text };
    } finally {
      await rm(temp.path, { force: true });
      if (converted) await rm(converted, { force: true });
    }
  }

  /**
   * Appel d'un fournisseur borné par son délai (ASSIST_TIMEOUT_MS ou ASSIST_TRANSCRIPTION_TIMEOUT_MS), même s'il ignore le signal d'annulation.
   * Échec ou délai dépassé : ASSIST_UNAVAILABLE ; le journal ne contient jamais le texte.
   */
  private async callProvider<T>(
    label: string,
    providerName: string,
    timeoutMs: number,
    call: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const signal = AbortSignal.timeout(timeoutMs);
    const aborted = new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    const started = Date.now();
    try {
      return await Promise.race([call(signal), aborted]);
    } catch (error) {
      this.logger.warn(
        `${label} indisponibles (fournisseur ${providerName}, ${Date.now() - started} ms) : ${error instanceof Error ? error.name : 'erreur'}`,
      );
      throw new AppException('ASSIST_UNAVAILABLE');
    } finally {
      // Le rejet tardif du délai ne doit pas devenir une promesse rejetée non gérée.
      aborted.catch(() => undefined);
    }
  }

  /** Catégories de demande de travail où l'utilisateur peut créer ; aucune : refus journalisé. */
  private async creatableCategories(user: AuthenticatedUser, ctx: RequestContext): Promise<Array<{ id: string; name: string }>> {
    const categories = (await this.policies.categories({ active: true, kind: 'WORK' }))
      .filter((c) => canCreateInCategory(user, toPolicyCategory(c)))
      .map((c) => ({ id: c.id, name: c.name }));
    if (categories.length === 0) {
      await this.logDenied(user, 'NO_CATEGORY', ctx);
      throw new AppException('NOT_FOUND');
    }
    return categories;
  }

  private async consume(user: AuthenticatedUser, ctx: RequestContext): Promise<void> {
    if (this.limiter.tryConsume(user.id)) return;
    await this.logDenied(user, 'RATE_LIMITED', ctx);
    throw new AppException('ASSIST_RATE_LIMITED');
  }

  private async logDenied(user: AuthenticatedUser, reason: string, ctx: RequestContext): Promise<void> {
    await this.audit.log('ACCESS_DENIED', {
      actorId: user.id,
      ip: ctx.ip,
      details: { reason, route: ctx.route, method: ctx.method, channel: 'http' },
    });
  }
}
