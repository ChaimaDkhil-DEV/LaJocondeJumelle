/** Cellule CSV : guillemets échappés, et neutralisation des formules (=, +, -, @) à l'ouverture dans un tableur. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Fichier CSV : séparateur « ; », UTF-8 avec BOM pour les tableurs, fins de ligne CRLF. */
export function toCsv(header: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string {
  const lines = [header, ...rows].map((cells) => cells.map(csvCell).join(';'));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
