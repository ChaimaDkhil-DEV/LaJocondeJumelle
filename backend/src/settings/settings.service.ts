import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

/**
 * Réglages globaux et valeurs par défaut provisoires — data-model.md §Valeurs par défaut.
 * Les valeurs absentes en base retombent sur ces défauts.
 */
export const SETTING_DEFAULTS = {
  voiceMaxSeconds: 180,
  voiceMaxBytes: 5 * 1024 * 1024,
  attachmentMaxBytes: 10 * 1024 * 1024,
  attachmentMaxPerMessage: 5,
  allowedPhotoTypes: ['image/jpeg', 'image/png', 'image/webp'],
  allowedDocumentTypes: ['application/pdf'],
  draftsEnabled: true,
  deadlineWarnPercent: 20,
  sessionIdleMinutes: 60,
  sessionMaxHours: 12,
};

export type Settings = typeof SETTING_DEFAULTS;
export type SettingKey = keyof Settings;

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

function isValidValue<K extends SettingKey>(key: K, value: unknown): value is Settings[K] {
  const reference = SETTING_DEFAULTS[key];
  if (Array.isArray(reference)) {
    return Array.isArray(value) && value.every((v) => typeof v === 'string');
  }
  if (typeof reference === 'number') {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }
  return typeof value === typeof reference;
}

@Injectable()
export class SettingsService {
  private cache: Settings | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<Settings> {
    if (this.cache) return this.cache;
    const rows = await this.prisma.setting.findMany();
    const settings: Settings = structuredClone(SETTING_DEFAULTS);
    for (const row of rows) {
      const key = row.key as SettingKey;
      if (key in SETTING_DEFAULTS && isValidValue(key, row.value)) {
        (settings as Record<SettingKey, unknown>)[key] = row.value;
      }
    }
    this.cache = settings;
    return settings;
  }

  async get<K extends SettingKey>(key: K): Promise<Settings[K]> {
    return (await this.getAll())[key];
  }

  /** Écriture (administration, US8) : valide le type et invalide le cache. */
  async set<K extends SettingKey>(
    key: K,
    value: Settings[K],
    updatedById: string | null,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    if (!isValidValue(key, value)) throw new TypeError(`Valeur invalide pour le réglage ${key}`);
    const json = value as unknown as Prisma.InputJsonValue;
    await tx.setting.upsert({
      where: { key },
      create: { key, value: json, updatedById },
      update: { value: json, updatedById },
    });
    this.invalidate();
  }

  invalidate(): void {
    this.cache = null;
  }
}
