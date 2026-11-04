import type { Response } from 'express';

/** Cellule CSV : guillemets échappés, et neutralisation des formules (=, +, -, @) à l'ouverture dans un tableur. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * En-têtes d'un téléchargement CSV, à poser **après** la production du fichier : une erreur
 * (paramètre invalide, période refusée) garde ainsi la réponse JSON habituelle. `@Header` les
 * poserait avant l'appel du contrôleur, et l'erreur partirait étiquetée `text/csv`.
 */
export function setCsvDownloadHeaders(res: Response, filename: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
}

/** Fichier CSV : séparateur « ; », UTF-8 avec BOM pour les tableurs, fins de ligne CRLF. */
export function toCsv(header: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string {
  const lines = [header, ...rows].map((cells) => cells.map(csvCell).join(';'));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
