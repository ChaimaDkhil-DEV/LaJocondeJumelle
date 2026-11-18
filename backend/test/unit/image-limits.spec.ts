import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { IMAGE_MAX_PIXELS, withImageSlot } from '../../src/files/image-limits';
import { processPhoto } from '../../src/files/photo-processing';
import { processAvatar } from '../../src/users/avatar-processing';

/**
 * Audit de sécurité R14 — bombes de décompression : une image de quelques octets peut annoncer des
 * dimensions énormes et faire décoder des centaines de mégaoctets. Les dimensions sont lues dans l'en-tête et
 * refusées avant tout décodage ; les décodages simultanés sont limités.
 */

/** PNG de quelques octets annonçant des dimensions énormes : en-tête et une seule ligne de pixels compressée. */
function pngHeader(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 bits, RVB, compression, filtre, sans entrelacement
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc(1 + width * 3))), chunk('IEND', Buffer.alloc(0))]);
}

async function bomb(): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), 'ljj-bomb-')), 'bomb.png');
  await writeFile(path, pngHeader(10_000, 10_000)); // 100 millions de pixels
  return path;
}

describe('Limite de pixels des images (R14)', () => {
  it('le plafond garde les photos des téléphones actuels (48 à 50 Mpx) et refuse au-delà de 60 Mpx', () => {
    expect(IMAGE_MAX_PIXELS).toBe(60_000_000);
  });

  it('photo : une image annonçant 100 millions de pixels est refusée avant décodage (413)', async () => {
    await expect(processPhoto(await bomb(), { allowedTypes: ['image/png'] })).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
      message: 'Cette image est trop grande (plus de 60 millions de pixels). Réduisez-la avant de l’envoyer.',
    });
  });

  it('photo de profil : même refus', async () => {
    await expect(processAvatar(await bomb(), 100)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });
});

describe('withImageSlot : décodages simultanés limités', () => {
  it('jamais plus de 2 traitements à la fois, tous menés à terme dans l’ordre d’arrivée', async () => {
    let running = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const order: number[] = [];
    const tasks = [0, 1, 2, 3, 4].map((n) =>
      withImageSlot(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise<void>((resolve) => releases.push(resolve));
        running -= 1;
        order.push(n);
        return n;
      }),
    );
    while (order.length < 5) {
      await new Promise((resolve) => setImmediate(resolve));
      releases.shift()?.();
    }
    expect(await Promise.all(tasks)).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it('une erreur libère sa place', async () => {
    await expect(withImageSlot(() => Promise.reject(new Error('illisible')))).rejects.toThrow('illisible');
    await expect(Promise.all([withImageSlot(async () => 1), withImageSlot(async () => 2), withImageSlot(async () => 3)])).resolves.toEqual([1, 2, 3]);
  });
});
