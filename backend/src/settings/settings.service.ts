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
  // Affectations des surveillants (004, data-model §3). Le délai de prise en charge reste
  // DeadlineRule.takeoverMinutes de la catégorie de garde.
  coverageUrgencyThresholdMinutes: 60,
  coverageEscalationMinutes: 5,
  coverageMorningReminderTime: '07:00',
  coverageCloseReminderMinutes: 10,
  coverageCloseEscalationMinutes: 10,
  coverageSupportReminderMinutes: 10,
  coverageSupportReminderMax: 3,
  coverageRetentionMonths: 12,
};

export type Settings = typeof SETTING_DEFAULTS;
export type SettingKey = keyof Settings;

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

/** Plafond technique d'envoi (files.controller MAX_UPLOAD_BYTES) : un réglage ne peut pas le dépasser. */
const TECHNICAL_MAX_BYTES = 25 * 1024 * 1024;

type Rule =
  | { kind: 'int'; min: number; max: number; label: string }
  | { kind: 'boolean' }
  | { kind: 'subset'; allowed: readonly string[] }
  | { kind: 'time' };

/** Bornes de chaque réglage (administration, US8). */
export const SETTING_RULES: Record<SettingKey, Rule> = {
  voiceMaxSeconds: { kind: 'int', min: 10, max: 600, label: 'entre 10 et 600 secondes' },
  voiceMaxBytes: { kind: 'int', min: 100 * 1024, max: TECHNICAL_MAX_BYTES, label: 'entre 100 Ko et 25 Mo' },
  attachmentMaxBytes: { kind: 'int', min: 100 * 1024, max: TECHNICAL_MAX_BYTES, label: 'entre 100 Ko et 25 Mo' },
  attachmentMaxPerMessage: { kind: 'int', min: 1, max: 10, label: 'entre 1 et 10' },
  allowedPhotoTypes: { kind: 'subset', allowed: ['image/jpeg', 'image/png', 'image/webp'] },
  allowedDocumentTypes: { kind: 'subset', allowed: ['application/pdf'] },
  draftsEnabled: { kind: 'boolean' },
  deadlineWarnPercent: { kind: 'int', min: 1, max: 99, label: 'entre 1 et 99 %' },
  sessionIdleMinutes: { kind: 'int', min: 5, max: 1440, label: 'entre 5 et 1440 minutes' },
  sessionMaxHours: { kind: 'int', min: 1, max: 72, label: 'entre 1 et 72 heures' },
  coverageUrgencyThresholdMinutes: { kind: 'int', min: 5, max: 720, label: 'entre 5 et 720 minutes' },
  coverageEscalationMinutes: { kind: 'int', min: 1, max: 120, label: 'entre 1 et 120 minutes' },
  coverageMorningReminderTime: { kind: 'time' },
  coverageCloseReminderMinutes: { kind: 'int', min: 1, max: 240, label: 'entre 1 et 240 minutes' },
  coverageCloseEscalationMinutes: { kind: 'int', min: 1, max: 240, label: 'entre 1 et 240 minutes' },
  coverageSupportReminderMinutes: { kind: 'int', min: 1, max: 120, label: 'entre 1 et 120 minutes' },
  coverageSupportReminderMax: { kind: 'int', min: 1, max: 10, label: 'entre 1 et 10' },
  coverageRetentionMonths: { kind: 'int', min: 1, max: 60, label: 'entre 1 et 60 mois' },
};

/** Message d'erreur si la valeur est invalide pour ce réglage, sinon null. */
export function settingError(key: SettingKey, value: unknown): string | null {
  const rule = SETTING_RULES[key];
  switch (rule.kind) {
    case 'int':
      return Number.isInteger(value) && (value as number) >= rule.min && (value as number) <= rule.max
        ? null
        : `Nombre entier ${rule.label} attendu.`;
    case 'boolean':
      return typeof value === 'boolean' ? null : 'Oui ou non attendu.';
    case 'subset':
      return Array.isArray(value) &&
        value.length > 0 &&
        value.every((v) => typeof v === 'string' && rule.allowed.includes(v)) &&
        new Set(value).size === value.length
        ? null
        : `Au moins un type parmi : ${rule.allowed.join(', ')}.`;
    case 'time':
      return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? null : 'Heure au format HH:MM attendue.';
  }
}

/** Lecture en base : seul le type est contrôlé (les bornes s'appliquent aux modifications). */
function hasExpectedType<K extends SettingKey>(key: K, value: unknown): value is Settings[K] {
  const reference = SETTING_DEFAULTS[key];
  if (Array.isArray(reference)) return Array.isArray(value) && value.every((v) => typeof v === 'string');
  if (typeof reference === 'number') return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  return typeof value === typeof reference;
}

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTING_DEFAULTS, key);
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
      if (key in SETTING_DEFAULTS && hasExpectedType(key, row.value)) {
        (settings as Record<SettingKey, unknown>)[key] = row.value;
      }
    }
    this.cache = settings;
    return settings;
  }

  async get<K extends SettingKey>(key: K): Promise<Settings[K]> {
    return (await this.getAll())[key];
  }

  /** Écriture (administration, US8) : valide le type et les bornes, puis invalide le cache. */
  async set<K extends SettingKey>(
    key: K,
    value: Settings[K],
    updatedById: string | null,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const error = settingError(key, value);
    if (error) throw new TypeError(`Valeur invalide pour le réglage ${key} : ${error}`);
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
