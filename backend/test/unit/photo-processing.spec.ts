import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { processPhoto } from '../../src/files/photo-processing';

/**
 * T047 — photos : orientation appliquée, toutes les métadonnées supprimées (dont la position GPS,
 * principe IV), ré-encodage JPEG, côté long ≤ 2560 px, formats non acceptés refusés.
 */
describe('processPhoto', () => {
  const fixtures = join(__dirname, '..', 'fixtures', 'images');
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'ljj-photo-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  function input(name: string): string {
    const path = join(workDir, `upload-${name}`);
    copyFileSync(join(fixtures, name), path);
    return path;
  }

  it('applique l’orientation, retire EXIF et GPS, et produit un JPEG', async () => {
    const source = input('gps.jpg');
    const before = await sharp(source).metadata();
    expect(before.orientation).toBe(6);
    expect(before.exif).toBeDefined();

    const result = await processPhoto(source, { allowedTypes });
    const after = await sharp(result.path).metadata();

    expect(result).toMatchObject({ mimeType: 'image/jpeg', width: 20, height: 40 });
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(after.format).toBe('jpeg');
    expect(after.exif).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    expect(after.icc).toBeUndefined();
    expect(existsSync(source)).toBe(false);
  });

  it.each(['photo.png', 'photo.webp'])('accepte %s et le convertit en JPEG', async (name) => {
    const result = await processPhoto(input(name), { allowedTypes });
    expect((await sharp(result.path).metadata()).format).toBe('jpeg');
  });

  it('réduit le côté long à 2560 px sans déformer', async () => {
    const result = await processPhoto(input('large.png'), { allowedTypes });
    expect(result).toMatchObject({ width: 2560, height: 853 });
  });

  it('refuse le HEIC avec un message expliquant quoi faire', async () => {
    const error = await processPhoto(input('photo.heic'), { allowedTypes }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
    expect((error as { userMessage: string }).userMessage).toMatch(/HEIC/);
    expect(readdirSync(workDir)).toEqual([]);
  });

  it('refuse un exécutable renommé en .jpg', async () => {
    await expect(processPhoto(input('exe-renamed.jpg'), { allowedTypes })).rejects.toMatchObject({
      code: 'FILE_TYPE_NOT_ALLOWED',
    });
    expect(readdirSync(workDir)).toEqual([]);
  });

  it('refuse un format retiré de la liste des types autorisés', async () => {
    await expect(processPhoto(input('photo.webp'), { allowedTypes: ['image/jpeg'] })).rejects.toMatchObject({
      code: 'FILE_TYPE_NOT_ALLOWED',
    });
  });
});
