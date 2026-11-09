import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 014, T040 (D2, FR-002, research R12) : application installable — indispensable au push sur iPhone et
 * iPad, qui ne l'autorisent qu'aux applications ajoutées à l'écran d'accueil.
 */

const FRONTEND = join(__dirname, '..', '..');
const PUBLIC = join(FRONTEND, 'public');

/** Largeur et hauteur d'une image PNG (en-tête IHDR). */
function pngSize(file: string): [number, number] {
  const data = readFileSync(file);
  expect(data.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

describe('manifeste de l’application', () => {
  const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.json'), 'utf8')) as {
    name: string;
    short_name: string;
    start_url: string;
    scope: string;
    display: string;
    lang: string;
    background_color: string;
    theme_color: string;
    icons: Array<{ src: string; sizes: string; type: string }>;
  };

  it('nom, portée et affichage autonome', () => {
    expect(manifest).toMatchObject({ name: 'La Joconde Jumelle', start_url: '/', scope: '/', display: 'standalone', lang: 'fr' });
    expect(manifest.short_name.length).toBeGreaterThan(0);
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each(['192x192', '512x512'])('icône %s présente, PNG aux bonnes dimensions', (sizes) => {
    const entry = manifest.icons.find((i) => i.sizes === sizes);
    expect(entry).toMatchObject({ type: 'image/png' });
    const file = join(PUBLIC, entry!.src);
    expect(existsSync(file)).toBe(true);
    const [width, height] = pngSize(file);
    expect(`${width}x${height}`).toBe(sizes);
  });

  it('icône d’écran d’accueil iPhone 180 × 180', () => {
    expect(pngSize(join(PUBLIC, 'icons', 'apple-touch-icon.png'))).toEqual([180, 180]);
  });
});

describe('index.html', () => {
  const html = readFileSync(join(FRONTEND, 'index.html'), 'utf8');

  it('déclare le manifeste, la couleur de thème et l’icône d’écran d’accueil', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.json" />');
    expect(html).toMatch(/<meta name="theme-color" content="#[0-9a-fA-F]{6}" \/>/);
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />');
  });
});
