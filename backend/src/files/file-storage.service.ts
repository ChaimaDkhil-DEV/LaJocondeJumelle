import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';

/**
 * Stockage privé des fichiers (research R3) : FILES_DIR/{aaaa}/{mm}/{uuid}, sans extension.
 * Le chemin relatif est conservé en base et n'est jamais exposé par l'API.
 */
@Injectable()
export class FileStorageService {
  private readonly root: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.root = resolve(config.filesDir);
  }

  /** Déplace un fichier temporaire dans le stockage et renvoie son chemin relatif. */
  async store(tempPath: string, now = new Date()): Promise<string> {
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const relativePath = `${year}/${month}/${randomUUID()}`;
    const target = this.absolutePath(relativePath);
    await mkdir(join(this.root, year, month), { recursive: true });
    try {
      await rename(tempPath, target);
    } catch (error) {
      // Dossier temporaire sur un autre disque : copie puis suppression.
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await copyFile(tempPath, target);
      await rm(tempPath, { force: true });
    }
    return relativePath;
  }

  /** Chemin absolu, en refusant toute sortie du dossier de stockage. */
  absolutePath(relativePath: string): string {
    const absolute = resolve(this.root, relativePath);
    const rel = relative(this.root, absolute);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Chemin de stockage invalide');
    return absolute;
  }

  async remove(relativePath: string): Promise<void> {
    await rm(this.absolutePath(relativePath), { force: true });
  }
}
