import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectFileType } from '../../src/files/file-signature';

const audio = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', 'audio', name));

describe('detectFileType (octets magiques)', () => {
  it.each([
    ['sample.webm', 'audio/webm'],
    ['sample.ogg', 'audio/ogg'],
    ['sample.mp4', 'audio/mp4'],
    ['sample.m4a', 'audio/mp4'],
    ['not-audio.webm', 'image/png'],
  ])('%s → %s', (file, mime) => {
    expect(detectFileType(audio(file))).toBe(mime);
  });

  it.each([
    [[0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0], 'image/jpeg'],
    [[...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')], 'image/webp'],
    [[...Buffer.from('%PDF-1.7\n')], 'application/pdf'],
    [[0, 0, 0, 0x18, ...Buffer.from('ftypheic'), 0, 0, 0, 0], 'image/heic'],
  ])('reconnaît %j → %s', (bytes, mime) => {
    expect(detectFileType(Buffer.from(bytes))).toBe(mime);
  });

  it('renvoie null pour un contenu inconnu ou trop court', () => {
    expect(detectFileType(Buffer.from('MZ\x90\x00 exécutable Windows'))).toBeNull();
    expect(detectFileType(Buffer.from([0x1a]))).toBeNull();
  });
});
