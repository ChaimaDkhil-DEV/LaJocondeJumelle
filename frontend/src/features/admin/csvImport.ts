/**
 * Import CSV (comptes, élèves) : types de la réponse du serveur et utilitaires de fichier du navigateur.
 * La vérification des lignes est faite par le serveur, qui est seul juge ; ici on lit, on envoie, on affiche.
 */

export interface ImportIssue {
  /** Ligne du fichier, comme dans le tableur. */
  line: number;
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
  count: number;
  total: number;
  valid: number;
  invalid: number;
  fileErrors: string[];
  issues: ImportIssue[];
  truncated: boolean;
  preview: ImportPreviewRow[];
}

export interface ImportedAccount {
  username: string;
  displayName: string;
  temporaryPassword: string;
}

export interface AccountsImportReport extends ImportReport {
  accounts?: ImportedAccount[];
  passwordsCsv?: string;
}

/** Taille maximale d'un fichier : celle que le serveur accepte (1 Mo). */
export const IMPORT_MAX_BYTES = 1_000_000;

const BOM = String.fromCharCode(0xfeff);

function readAsArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Texte d'un fichier choisi par l'utilisateur. UTF-8 d'abord (Excel récent, LibreOffice) ; si le fichier n'en
 * est pas, Windows-1252 (anciens Excel français) : sinon les accents deviendraient « � ».
 */
export async function readCsvFile(file: Blob): Promise<string> {
  const buffer = await readAsArrayBuffer(file);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

const cell = (value: string) => (/[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** Fichier modèle, au format que le serveur attend et qu'Excel en français ouvre correctement (« ; », BOM, CRLF). */
export function csvTemplate(headers: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
  return `${BOM}${[headers, ...rows].map((line) => line.map(cell).join(';')).join('\r\n')}\r\n`;
}

/** Fait télécharger `text` par le navigateur sous le nom `filename`. */
export function downloadTextFile(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
