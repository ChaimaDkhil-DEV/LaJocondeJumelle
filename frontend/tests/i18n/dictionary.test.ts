import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/en';

const SRC = join(__dirname, '..', '..', 'src');
/** These files translate text received at run time, which cannot be listed here. */
const DYNAMIC_FILES = new Set(['api/client.ts', 'i18n/index.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'en' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** First-argument literals of every t() call; a ternary counts both branches, null is anything else. */
function translationKeys(file: string, source: string): (string | null)[] {
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const keys: (string | null)[] = [];
  const collect = (node: ts.Expression | undefined): void => {
    if (node && ts.isStringLiteralLike(node)) keys.push(node.text);
    else if (node && ts.isConditionalExpression(node)) {
      collect(node.whenTrue);
      collect(node.whenFalse);
    } else if (node && ts.isParenthesizedExpression(node)) collect(node.expression);
    else keys.push(null);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
      collect(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return keys;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe('English dictionary', () => {
  const calls = sourceFiles(SRC)
    .map((file) => ({ file: relative(SRC, file), keys: translationKeys(file, readFileSync(file, 'utf8')) }));

  it('translates every t() text in the interface', () => {
    const missing = calls.flatMap(({ file, keys }) =>
      keys.filter((key): key is string => key !== null && !(key in en)).map((key) => `${file}: ${key}`),
    );
    expect(missing).toEqual([]);
  });

  it('only calls t() with literal text, so the texts can be checked', () => {
    const dynamic = calls
      .filter(({ file, keys }) => keys.includes(null) && !DYNAMIC_FILES.has(file.split(sep).join('/')))
      .map(({ file }) => file);
    expect(dynamic).toEqual([]);
  });

  it('keeps the same placeholders as the French text', () => {
    const wrong = Object.entries(en)
      .filter(([fr, english]) => placeholders(fr).join() !== placeholders(english).join())
      .map(([fr]) => fr);
    expect(wrong).toEqual([]);
  });

  it('has no empty translation', () => {
    expect(Object.entries(en).filter(([, english]) => !english.trim())).toEqual([]);
  });
});
