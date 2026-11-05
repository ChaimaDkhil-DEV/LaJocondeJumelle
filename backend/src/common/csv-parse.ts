/**
 * Lecture d'un fichier CSV tel que l'exportent les tableurs (Excel en français : séparateur « ; », BOM,
 * guillemets, retours à la ligne dans une cellule). Module pur, sans accès base : les imports de comptes
 * et d'élèves s'appuient dessus puis valident chaque ligne.
 */

export interface CsvRecord {
  /** Numéro de la ligne du fichier où commence l'enregistrement (1 = en-têtes), comme dans un tableur. */
  line: number;
  cells: string[];
}

export interface ParsedCsv {
  delimiter: string;
  /** Cellules de la première ligne, rognées. */
  headers: string[];
  /** Lignes de données ; les lignes entièrement vides sont ignorées. */
  records: CsvRecord[];
}

/** Fichier illisible : l'import entier est refusé avec ce message (jamais une ligne isolée). */
export class CsvSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
    this.name = 'CsvSyntaxError';
  }
}

const BOM = '﻿';
const DELIMITERS = [';', ',', '\t'] as const;

/** Séparateur le plus fréquent hors guillemets sur la première ligne ; « ; » à égalité (usage français). */
function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let best: string = ';';
  for (const delimiter of DELIMITERS) {
    if ((counts.get(delimiter) ?? 0) > (counts.get(best) ?? 0)) best = delimiter;
  }
  return best;
}

export function parseCsv(input: string): ParsedCsv {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  if (text.trim() === '') throw new CsvSyntaxError('Le fichier est vide.', 1);
  const delimiter = detectDelimiter(text);

  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = '';
  let quoted = false; // à l'intérieur d'un champ entre guillemets
  let afterQuote = false; // juste après le guillemet fermant
  let fieldStarted = false; // le champ contient déjà un caractère (un guillemet n'ouvre qu'en tête)
  let line = 1;
  let recordLine = 1;
  let quoteLine = 1;

  const endField = () => {
    cells.push(field);
    field = '';
    fieldStarted = false;
    afterQuote = false;
  };
  const endRecord = () => {
    endField();
    if (cells.some((cell) => cell.trim() !== '')) records.push({ line: recordLine, cells });
    cells = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        if (char === '\n') line += 1;
        field += char;
      }
      continue;
    }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      endRecord();
      line += 1;
      recordLine = line;
    } else if (char === delimiter) {
      endField();
    } else if (afterQuote) {
      if (char !== ' ' && char !== '\t') {
        throw new CsvSyntaxError('Texte inattendu après un guillemet fermant : vérifiez les guillemets de cette ligne.', line);
      }
    } else if (char === '"' && !fieldStarted) {
      quoted = true;
      quoteLine = line;
      fieldStarted = true;
    } else {
      field += char;
      fieldStarted = true;
    }
  }
  if (quoted) throw new CsvSyntaxError(`Un guillemet ouvert à la ligne ${quoteLine} n'est jamais refermé.`, quoteLine);
  if (fieldStarted || field !== '' || cells.length > 0) endRecord();

  // Les titres sont la première ligne non vide ; les numéros de ligne restent ceux du fichier.
  const [header, ...data] = records;
  if (!header) throw new CsvSyntaxError('Le fichier ne contient aucune ligne.', 1);
  return { delimiter, headers: header.cells.map((cell) => cell.trim()), records: data };
}

/** Clé de comparaison de texte : minuscules, sans accents, espaces réduits (« Étage  1 » = « etage 1 »). */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clé d'en-tête : « Nom affiché » → « nom_affiche », « Téléphone du parent » → « telephone_du_parent ». */
export function normalizeHeader(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
