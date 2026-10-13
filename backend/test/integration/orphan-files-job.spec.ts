import type { INestApplication } from '@nestjs/common';
import { PrismaClient, type FileKind } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStorageService } from '../../src/files/file-storage.service';
import { OrphanFilesJob } from '../../src/scheduler/orphan-files.job';
import { CATEGORIES, categoryId, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

const HOUR = 3_600_000;

/** T110 — fichiers provisoires jamais rattachés : supprimés (disque et base) après 24 h. */
describe('OrphanFilesJob', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let job: OrphanFilesJob;
  let storage: FileStorageService;
  let uploaderId: string;
  let counter = 0;

  async function storedFile(kind: FileKind, ageHours: number, link: { requestId?: string; messageId?: string } = {}) {
    const dir = await mkdtemp(join(tmpdir(), 'orphan-'));
    const temp = join(dir, 'contenu');
    await writeFile(temp, 'contenu');
    const storagePath = await storage.store(temp);
    return prisma.file.create({
      data: {
        kind,
        mimeType: kind === 'VOICE' ? 'audio/mp4' : 'image/jpeg',
        originalName: 'fichier',
        sizeBytes: 7,
        storagePath,
        uploaderId,
        createdAt: new Date(Date.now() - ageHours * HOUR),
        ...link,
      },
    });
  }

  async function insertRequest(voiceFileId: string | null = null) {
    counter += 1;
    return prisma.request.create({
      data: {
        number: 20_000 + counter,
        reference: `D-2026-${String(20_000 + counter).padStart(6, '0')}`,
        clientId: randomUUID(),
        title: `Demande ${counter}`,
        categoryId: await categoryId(prisma, CATEGORIES.photocopies),
        priority: 'NORMAL',
        requesterId: uploaderId,
        status: 'SENT',
        voiceFileId,
        rulesSnapshot: {},
      },
    });
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    job = app.get(OrphanFilesJob);
    storage = app.get(FileStorageService);
    uploaderId = await userId(prisma, 'enseignante');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('supprime seulement les fichiers jamais rattachés depuis plus de 24 h', async () => {
    const orphanOld = await storedFile('PHOTO', 25);
    const orphanRecent = await storedFile('PHOTO', 23);

    const requestVoice = await storedFile('VOICE', 48);
    const request = await insertRequest(requestVoice.id);
    const requestAttachment = await storedFile('DOCUMENT', 48, { requestId: request.id });

    const messageVoice = await storedFile('VOICE', 48);
    const message = await prisma.message.create({
      data: { requestId: request.id, authorId: uploaderId, kind: 'VOICE', voiceFileId: messageVoice.id },
    });
    const messageAttachment = await storedFile('PHOTO', 48, { messageId: message.id });

    await expect(job.runOnce()).resolves.toBe(1);

    await expect(prisma.file.findUnique({ where: { id: orphanOld.id } })).resolves.toBeNull();
    expect(existsSync(storage.absolutePath(orphanOld.storagePath))).toBe(false);

    for (const kept of [orphanRecent, requestVoice, requestAttachment, messageVoice, messageAttachment]) {
      await expect(prisma.file.findUnique({ where: { id: kept.id } })).resolves.not.toBeNull();
      expect(existsSync(storage.absolutePath(kept.storagePath))).toBe(true);
    }
  });

  it('tolère un fichier déjà absent du disque et reste idempotent', async () => {
    const orphan = await storedFile('PHOTO', 30);
    await storage.remove(orphan.storagePath);
    await expect(job.runOnce()).resolves.toBe(1);
    await expect(prisma.file.findUnique({ where: { id: orphan.id } })).resolves.toBeNull();
    await expect(job.runOnce()).resolves.toBe(0);
  });
});
