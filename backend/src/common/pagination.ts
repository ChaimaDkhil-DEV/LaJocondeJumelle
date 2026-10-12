import { AppException } from './errors';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface CursorPosition {
  id: string;
  createdAt: Date;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

function invalid(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] });
}

/** Curseur opaque (base64url) encodant la position (createdAt, id) du dernier élément. */
export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(JSON.stringify([position.createdAt.toISOString(), position.id])).toString(
    'base64url',
  );
}

export function decodeCursor(cursor: string): CursorPosition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalid('cursor', 'Curseur invalide');
  }
  if (!Array.isArray(parsed) || typeof parsed[0] !== 'string' || typeof parsed[1] !== 'string') {
    throw invalid('cursor', 'Curseur invalide');
  }
  const createdAt = new Date(parsed[0]);
  if (Number.isNaN(createdAt.getTime())) throw invalid('cursor', 'Curseur invalide');
  return { id: parsed[1], createdAt };
}

export function parseLimit(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_PAGE_SIZE;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) throw invalid('limit', 'Entier supérieur ou égal à 1 attendu');
  return Math.min(limit, MAX_PAGE_SIZE);
}

/** Les requêtes lisent `limit + 1` éléments triés par (createdAt desc, id desc) pour savoir s'il reste une page. */
export function buildPage<T extends CursorPosition>(rows: T[], limit: number): Page<T> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}
