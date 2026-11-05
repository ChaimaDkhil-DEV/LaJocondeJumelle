import { plainToInstance } from 'class-transformer';
import { IsBoolean, IsString, MaxLength, validateSync } from 'class-validator';
import { CsvSyntaxError, normalizeHeader, normalizeText, parseCsv } from './csv-parse';

/**
 * Socle commun des imports CSV (comptes, élèves) : lecture du fichier selon les colonnes attendues, rapport
 * de résultat, et validation de chaque ligne par les mêmes classes que les formulaires (les règles ne
 * divergent donc jamais). Aucun accès base ici.
 */

/** Taille maximale du texte reçu (le corps JSON de ces routes est relevé à 1 Mo, voir app.setup.ts). */
export const IMPORT_MAX_CHARS = 1_000_000;
/** Lignes de problèmes détaillées dans le rapport ; le décompte total reste exact. */
export const MAX_REPORTED_ISSUES = 200;
/** Lignes valides montrées en aperçu pour vérifier que les colonnes sont bien comprises. */
export const PREVIEW_ROWS = 5;

export class ImportCsvDto {
  @IsString({ message: 'Le contenu du fichier est attendu.' })
  @MaxLength(IMPORT_MAX_CHARS, { message: 'Le fichier est trop volumineux (1 Mo au plus).' })
  csv!: string;

  /** Vrai : vérifie le fichier sans rien créer (aperçu). Le choix est explicite, sans valeur par défaut. */
  @IsBoolean({ message: 'Indiquez s’il s’agit d’une simple vérification.' })
  dryRun!: boolean;
}

export interface ColumnSpec {
  /** Titres acceptés une fois normalisés (sans accents ni casse) ; le premier est le titre du modèle. */
  aliases: readonly string[];
  required?: boolean;
}

export type ColumnsSpec<K extends string> = Record<K, ColumnSpec>;

export interface ImportRow<K extends string> {
  /** Numéro de ligne dans le fichier, comme dans le tableur. */
  line: number;
  /** Valeurs rognées de chaque colonne reconnue ; chaîne vide si la cellule est absente. */
  values: Record<K, string>;
  /** Problèmes propres à la structure de la ligne (la validation métier en ajoute). */
  errors: string[];
}

export interface ReadResult<K extends string> {
  rows: ImportRow<K>[];
  /** Problèmes du fichier entier : l'import est alors refusé sans examiner les lignes. */
  fileErrors: string[];
}

/** Lit le fichier selon les colonnes attendues. Un titre inconnu est refusé : il ferait perdre une donnée en silence. */
export function readImportFile<K extends string>(csv: string, spec: ColumnsSpec<K>, maxRows: number): ReadResult<K> {
  let parsed;
  try {
    parsed = parseCsv(csv);
  } catch (error) {
    if (error instanceof CsvSyntaxError) return { rows: [], fileErrors: [error.line > 1 ? `Ligne ${error.line} : ${error.message}` : error.message] };
    throw error;
  }

  const keys = Object.keys(spec) as K[];
  const aliasToKey = new Map<string, K>();
  for (const key of keys) for (const alias of spec[key].aliases) aliasToKey.set(alias, key);

  const fileErrors: string[] = [];
  const index = new Map<K, number>();
  const unknown: string[] = [];
  const untitled: number[] = [];
  parsed.headers.forEach((header, position) => {
    const normalized = normalizeHeader(header);
    if (normalized === '') return void untitled.push(position);
    const key = aliasToKey.get(normalized);
    if (key === undefined) return void unknown.push(header);
    if (index.has(key)) fileErrors.push(`La colonne « ${spec[key].aliases[0]} » apparaît deux fois.`);
    else index.set(key, position);
  });

  if (unknown.length > 0) {
    fileErrors.push(`Colonne inconnue : ${unknown.map((u) => `« ${u} »`).join(', ')}. Colonnes reconnues : ${keys.map((k) => spec[k].aliases[0]).join(', ')}.`);
  }
  for (const key of keys) {
    if (spec[key].required && !index.has(key)) fileErrors.push(`Colonne obligatoire absente : « ${spec[key].aliases[0]} ».`);
  }
  // Une colonne sans titre n'est tolérée que vide (Excel en ajoute parfois en fin de ligne).
  for (const position of untitled) {
    if (parsed.records.some((record) => (record.cells[position] ?? '').trim() !== '')) {
      fileErrors.push(`La colonne ${position + 1} contient des données mais n’a pas de titre.`);
    }
  }
  if (parsed.records.length === 0) fileErrors.push('Le fichier ne contient aucune ligne de données.');
  if (parsed.records.length > maxRows) {
    fileErrors.push(`Le fichier contient ${parsed.records.length} lignes : l’import est limité à ${maxRows} lignes à la fois. Découpez le fichier.`);
  }
  if (fileErrors.length > 0) return { rows: [], fileErrors };

  const rows = parsed.records.map<ImportRow<K>>((record) => {
    const values = {} as Record<K, string>;
    for (const key of keys) {
      const position = index.get(key);
      values[key] = position === undefined ? '' : (record.cells[position] ?? '').trim();
    }
    const errors: string[] = [];
    if (record.cells.slice(parsed.headers.length).some((cell) => cell.trim() !== '')) {
      errors.push(`Trop de colonnes : ${parsed.headers.length} attendues. Vérifiez les séparateurs de cette ligne.`);
    }
    return { line: record.line, values, errors };
  });
  return { rows, fileErrors: [] };
}

export interface ImportIssue {
  line: number;
  /** Ce qui permet de reconnaître la ligne (nom, identifiant…). */
  label: string;
  errors: string[];
}

export interface ImportPreviewRow {
  line: number;
  label: string;
  detail: string;
}

export interface ImportReport {
  dryRun: boolean;
  /** Vrai seulement si tout a été créé : l'import est tout ou rien. */
  created: boolean;
  /** Nombre d'éléments créés. */
  count: number;
  total: number;
  valid: number;
  invalid: number;
  fileErrors: string[];
  issues: ImportIssue[];
  /** Vrai si `issues` a été tronquée à MAX_REPORTED_ISSUES. */
  truncated: boolean;
  preview: ImportPreviewRow[];
}

export interface ProcessedRow {
  line: number;
  label: string;
  detail: string;
  errors: string[];
}

export function fileRefused(dryRun: boolean, fileErrors: string[]): ImportReport {
  return { dryRun, created: false, count: 0, total: 0, valid: 0, invalid: 0, fileErrors, issues: [], truncated: false, preview: [] };
}

export function buildReport(dryRun: boolean, rows: ProcessedRow[], created: boolean): ImportReport {
  const invalidRows = rows.filter((row) => row.errors.length > 0);
  const validRows = rows.filter((row) => row.errors.length === 0);
  return {
    dryRun,
    created,
    count: created ? validRows.length : 0,
    total: rows.length,
    valid: validRows.length,
    invalid: invalidRows.length,
    fileErrors: [],
    issues: invalidRows.slice(0, MAX_REPORTED_ISSUES).map(({ line, label, errors }) => ({ line, label, errors })),
    truncated: invalidRows.length > MAX_REPORTED_ISSUES,
    preview: validRows.slice(0, PREVIEW_ROWS).map(({ line, label, detail }) => ({ line, label, detail })),
  };
}

/**
 * Valide une ligne avec la classe de validation du formulaire correspondant (mêmes règles, mêmes messages,
 * mêmes normalisations : identifiant en minuscules, téléphone aux espaces réduits…).
 */
export function validateWithDto<T extends object>(dto: new () => T, plain: Record<string, unknown>): { value: T | null; errors: string[] } {
  const instance = plainToInstance(dto, plain);
  const found = validateSync(instance, { whitelist: true, forbidNonWhitelisted: true });
  const messages = [...new Set(found.flatMap((error) => Object.values(error.constraints ?? {})))];
  return messages.length > 0 ? { value: null, errors: messages } : { value: instance, errors: [] };
}

/** Index par nom normalisé (sans accents ni casse) ; plusieurs entrées sous une même clé signalent une ambiguïté. */
export function indexByName<T>(items: readonly T[], nameOf: (item: T) => string): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const item of items) {
    const key = normalizeText(nameOf(item));
    index.set(key, [...(index.get(key) ?? []), item]);
  }
  return index;
}

/** Résout un nom dans un index ; ajoute l'erreur et renvoie null s'il est inconnu ou ambigu. */
export function resolveName<T>(index: Map<string, T[]>, name: string, kind: string, errors: string[], feminine = false): T | null {
  const found = index.get(normalizeText(name)) ?? [];
  if (found.length === 1) return found[0];
  const suffix = feminine ? 'e' : '';
  errors.push(found.length === 0 ? `${kind} inconnu${suffix} : « ${name} ».` : `${kind} ambigu${suffix ? 'ë' : ''} : « ${name} » correspond à plusieurs éléments.`);
  return null;
}

/** Liste dans une cellule : valeurs séparées par « | », sans doublon ni valeur vide. */
export function splitList(value: string): string[] {
  return [...new Set(value.split('|').map((item) => item.trim()).filter((item) => item !== ''))];
}

/** Exécute `fn` sur chaque élément, `size` à la fois, en gardant l'ordre (hachage de mots de passe en parallèle borné). */
export async function mapPool<T, R>(items: readonly T[], size: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const current = next++;
      results[current] = await fn(items[current], current);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}
