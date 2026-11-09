import jsQR from 'jsqr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQrReader, readQrPhoto } from '../../src/features/attendance/qrReader';

/**
 * Lecture d'un QR code dans une image (caméra ou photo) : le lecteur natif du navigateur quand il existe
 * (BarcodeDetector), sinon jsQR, qui essaie aussi les QR codes aux couleurs inversées.
 */

vi.mock('jsqr', () => ({ default: vi.fn() }));

const source = {} as CanvasImageSource;
let context: { drawImage: ReturnType<typeof vi.fn>; getImageData: ReturnType<typeof vi.fn> };

beforeEach(() => {
  context = {
    drawImage: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    })),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(jsQR).mockReset();
});

function nativeDetector(formats: string[], codes: string[]) {
  const constructed = vi.fn();
  class FakeBarcodeDetector {
    static getSupportedFormats = vi.fn(async () => formats);
    constructor(options: unknown) {
      constructed(options);
    }
    detect = vi.fn(async () => codes.map((rawValue) => ({ rawValue })));
  }
  vi.stubGlobal('BarcodeDetector', FakeBarcodeDetector);
  return constructed;
}

describe('createQrReader', () => {
  it('utilise le lecteur natif du navigateur quand il lit les QR codes', async () => {
    const constructed = nativeDetector(['ean_13', 'qr_code'], ['A', 'B']);
    const reader = await createQrReader();
    await expect(reader.read(source, 1280, 720)).resolves.toEqual(['A', 'B']);
    expect(constructed).toHaveBeenCalledWith({ formats: ['qr_code'] });
    expect(jsQR).not.toHaveBeenCalled();
  });

  it('sans lecteur natif : jsQR, en essayant aussi les couleurs inversées', async () => {
    vi.mocked(jsQR).mockReturnValue({ data: 'X' } as never);
    const reader = await createQrReader();
    await expect(reader.read(source, 1280, 720)).resolves.toEqual(['X']);
    expect(context.drawImage).toHaveBeenCalledWith(source, 0, 0, 1280, 720);
    expect(jsQR).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), 1280, 720, { inversionAttempts: 'attemptBoth' });
  });

  it('lecteur natif qui ne lit pas les QR codes : jsQR', async () => {
    nativeDetector(['ean_13'], ['A']);
    vi.mocked(jsQR).mockReturnValue({ data: 'X' } as never);
    const reader = await createQrReader();
    await expect(reader.read(source, 640, 480)).resolves.toEqual(['X']);
  });

  it('aucun QR code dans l’image : liste vide', async () => {
    vi.mocked(jsQR).mockReturnValue(null);
    const reader = await createQrReader();
    await expect(reader.read(source, 640, 480)).resolves.toEqual([]);
  });

  it('une grande photo est réduite avant la lecture par jsQR (1600 px au plus)', async () => {
    vi.mocked(jsQR).mockReturnValue(null);
    const reader = await createQrReader();
    await reader.read(source, 4000, 3000);
    expect(context.drawImage).toHaveBeenCalledWith(source, 0, 0, 1600, 1200);
    expect(jsQR).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), 1600, 1200, expect.anything());
  });
});

describe('readQrPhoto', () => {
  it('décode la photo puis la lit, et libère l’image', async () => {
    const bitmap = { width: 4000, height: 3000, close: vi.fn() };
    const createImageBitmap = vi.fn(async () => bitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const reader = { read: vi.fn(async () => ['X']) };
    const file = new File(['image'], 'qr.jpg', { type: 'image/jpeg' });

    await expect(readQrPhoto(file, reader)).resolves.toEqual(['X']);
    expect(createImageBitmap).toHaveBeenCalledWith(file);
    expect(reader.read).toHaveBeenCalledWith(bitmap, 4000, 3000);
    expect(bitmap.close).toHaveBeenCalled();
  });
});
