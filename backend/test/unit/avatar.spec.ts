import { copyFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { AVATAR_MAX_BYTES, AVATAR_SIZE, processAvatar } from '../../src/users/avatar-processing';
import { avatarVersion, canEditAvatar } from '../../src/users/avatar.service';

/** Photos de profil : traitement de l'image et droits (unitaires, sans base). */
const fixture = (name: string) => join(__dirname, '..', 'fixtures', 'images', name);

async function copyToTemp(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ljj-avatar-'));
  const path = join(dir, name);
  await copyFile(fixture(name), path);
  return path;
}

describe('processAvatar', () => {
  it.each(['photo.png', 'photo.webp', 'gps.jpg'])('%s : WebP carré 256 × 256, sans métadonnées', async (name) => {
    const path = await copyToTemp(name);
    const output = await processAvatar(path, 1000);
    const meta = await sharp(output).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: AVATAR_SIZE, height: AVATAR_SIZE });
    expect(meta.exif).toBeUndefined();
  });

  it('refuse une photo de plus de 2 Mo, avant toute lecture', async () => {
    await expect(processAvatar(fixture('photo.png'), AVATAR_MAX_BYTES + 1)).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
      message: 'La photo ne doit pas dépasser 2 Mo.',
    });
  });

  it('refuse un faux JPEG (type réel vérifié), le HEIC et un fichier quelconque', async () => {
    await expect(processAvatar(await copyToTemp('exe-renamed.jpg'), 128)).rejects.toMatchObject({
      code: 'FILE_TYPE_NOT_ALLOWED',
      message: 'Formats acceptés : JPG, PNG ou WebP.',
    });
    await expect(processAvatar(await copyToTemp('photo.heic'), 24)).rejects.toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
    const text = join(await mkdtemp(join(tmpdir(), 'ljj-avatar-')), 'note.png');
    await writeFile(text, 'pas une image');
    await expect(processAvatar(text, 13)).rejects.toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
  });

  it('refuse une image tronquée (signature valide, contenu illisible)', async () => {
    const broken = join(await mkdtemp(join(tmpdir(), 'ljj-avatar-')), 'broken.png');
    await writeFile(broken, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]));
    await expect(processAvatar(broken, 12)).rejects.toMatchObject({
      code: 'FILE_TYPE_NOT_ALLOWED',
      message: 'Cette image est illisible ou endommagée. Choisissez une autre photo.',
    });
  });
});

describe('Droits sur la photo', () => {
  it('chacun sa propre photo ; super administrateur et admin, celle des autres ; un employé, jamais celle d’un autre', () => {
    expect(canEditAvatar({ id: 'u1', role: 'EMPLOYEE' }, 'u1')).toBe(true);
    expect(canEditAvatar({ id: 'u1', role: 'EMPLOYEE' }, 'u2')).toBe(false);
    expect(canEditAvatar({ id: 'u1', role: 'ADMIN' }, 'u2')).toBe(true);
    expect(canEditAvatar({ id: 'u1', role: 'SUPER_ADMIN' }, 'u2')).toBe(true);
  });

  it('lit la version dans l’adresse, rien d’autre', () => {
    expect(avatarVersion('/api/users/u1/avatar?v=0123456789abcdef')).toBe('0123456789abcdef');
    expect(avatarVersion('/api/users/u1/avatar?v=../../etc')).toBeNull();
    expect(avatarVersion(null)).toBeNull();
  });
});
