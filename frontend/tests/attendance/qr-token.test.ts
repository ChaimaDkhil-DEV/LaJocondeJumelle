import { describe, expect, it } from 'vitest';
import { classIdFromToken, tokenFromScan } from '../../src/features/attendance/qrToken';

const TOKEN = 'c1.0a1b2c3d-1111-4222-8333-444455556666.3.Zm9vYmFyX1NJRy0xMjM';

describe('Jeton lu dans un QR code de classe', () => {
  it('lien imprimé : le jeton est dans le paramètre « c »', () => {
    expect(tokenFromScan(`https://ecole.example/gardes/presence?c=${encodeURIComponent(TOKEN)}`)).toBe(TOKEN);
  });

  it('jeton seul, collé à la main (espaces autour ignorés)', () => {
    expect(tokenFromScan(`  ${TOKEN}\n`)).toBe(TOKEN);
  });

  it.each([
    ['vide', ''],
    ['texte quelconque', 'bonjour'],
    ['lien sans jeton', 'https://ecole.example/gardes/presence'],
    ['lien avec un autre paramètre « c »', 'https://ecole.example/x?c=autre-chose'],
    ['jeton tronqué', 'c1.0a1b2c3d-1111-4222-8333-444455556666'],
    ['autre version du format', TOKEN.replace('c1.', 'c2.')],
  ])('refuse : %s', (_label, text) => {
    expect(tokenFromScan(text)).toBeNull();
  });
});

/** 013 (research R2) : la classe lue dans le jeton, revérifiée par le serveur (signature, version, classe). */
describe('Classe d’un jeton de QR code', () => {
  it('renvoie l’identifiant de la classe, en minuscules', () => {
    expect(classIdFromToken(TOKEN)).toBe('0a1b2c3d-1111-4222-8333-444455556666');
    expect(classIdFromToken(TOKEN.replace('0a1b2c3d', '0A1B2C3D'))).toBe('0a1b2c3d-1111-4222-8333-444455556666');
  });

  it.each([
    ['vide', ''],
    ['texte quelconque', 'bonjour'],
    ['classe qui n’est pas un identifiant', 'c1.pas-un-uuid.1.sig'],
    ['autre version du format', TOKEN.replace('c1.', 'c2.')],
    ['lien (passer d’abord par tokenFromScan)', `https://ecole.example/gardes/presence?c=${TOKEN}`],
  ])('refuse : %s', (_label, text) => {
    expect(classIdFromToken(text)).toBeNull();
  });
});
