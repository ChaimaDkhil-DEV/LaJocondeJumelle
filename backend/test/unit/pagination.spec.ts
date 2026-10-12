import { AppException } from '../../src/common/errors';
import { buildPage, decodeCursor, encodeCursor, parseLimit } from '../../src/common/pagination';

describe('pagination par curseur', () => {
  const item = { id: '0b3c7a4e-8f5d-4a0b-9b1e-7d9c2f1a6e01', createdAt: new Date('2026-10-12T10:00:00.000Z') };

  it('encode et décode un curseur opaque', () => {
    const cursor = encodeCursor(item);
    expect(cursor).not.toContain(item.id);
    expect(decodeCursor(cursor)).toEqual(item);
  });

  it('refuse un curseur invalide', () => {
    expect(() => decodeCursor('n-importe-quoi')).toThrow(AppException);
  });

  it('limite par défaut à 25, bornée entre 1 et 100', () => {
    expect(parseLimit(undefined)).toBe(25);
    expect(parseLimit('10')).toBe(10);
    expect(parseLimit('1000')).toBe(100);
    expect(() => parseLimit('0')).toThrow(AppException);
    expect(() => parseLimit('abc')).toThrow(AppException);
  });

  it('construit une page et le curseur suivant à partir de limit + 1 éléments', () => {
    const items = Array.from({ length: 3 }, (_, i) => ({ ...item, id: `id-${i}` }));
    expect(buildPage(items, 2)).toEqual({ items: items.slice(0, 2), nextCursor: encodeCursor(items[1]) });
    expect(buildPage(items, 3)).toEqual({ items, nextCursor: null });
  });
});
