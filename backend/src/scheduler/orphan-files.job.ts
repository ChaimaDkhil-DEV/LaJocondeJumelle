import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { FileStorageService } from '../files/file-storage.service';

/** Un fichier téléversé mais jamais rattaché est supprimé après ce délai. */
export const ORPHAN_MAX_AGE_MS = 24 * 3_600_000;
const ORPHAN_INTERVAL_MS = 3_600_000;

/** Fichier rattaché à rien : ni demande, ni message, ni vocal de demande ou de message. */
const UNATTACHED = {
  requestId: null,
  messageId: null,
  voiceOfRequest: { is: null },
  voiceOfMessage: { is: null },
} satisfies Prisma.FileWhereInput;

/**
 * Nettoyage des fichiers provisoires (T110) : vocaux, photos ou documents envoyés puis abandonnés
 * (formulaire quitté, envoi annulé). La ligne est supprimée sous condition (aucun rattachement
 * entre-temps), puis le fichier disque.
 */
@Injectable()
export class OrphanFilesJob {
  private readonly logger = new Logger(OrphanFilesJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Interval(ORPHAN_INTERVAL_MS)
  async tick(): Promise<void> {
    if (!this.config.jobsEnabled || this.running) return;
    this.running = true;
    try {
      const removed = await this.runOnce();
      if (removed > 0) this.logger.log(`${removed} fichier(s) provisoire(s) supprimé(s)`);
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    } finally {
      this.running = false;
    }
  }

  /** Un passage complet ; renvoie le nombre de fichiers supprimés. */
  async runOnce(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - ORPHAN_MAX_AGE_MS);
    const candidates = await this.prisma.file.findMany({
      where: { ...UNATTACHED, createdAt: { lt: cutoff } },
      select: { id: true, storagePath: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    let removed = 0;
    for (const file of candidates) {
      const { count } = await this.prisma.file.deleteMany({ where: { id: file.id, ...UNATTACHED } });
      if (count === 0) continue;
      await this.storage.remove(file.storagePath);
      removed += 1;
    }
    return removed;
  }
}
