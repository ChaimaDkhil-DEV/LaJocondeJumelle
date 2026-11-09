import { deviceLabel } from '../../src/push/domain/device-label';

/**
 * 014, T027 (FR-011, research R16) : libellé lisible de l'appareil, calculé par le serveur ; l'agent
 * utilisateur brut n'est jamais conservé.
 */

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
};

describe('deviceLabel', () => {
  it.each([
    [UA.iphone, 'iPhone · Safari'],
    [UA.ipad, 'iPad · Safari'],
    [UA.androidChrome, 'Android · Chrome'],
    [UA.androidSamsung, 'Android · Samsung Internet'],
    [UA.windowsEdge, 'Windows · Edge'],
    [UA.windowsChrome, 'Windows · Chrome'],
    [UA.macSafari, 'macOS · Safari'],
    [UA.linuxFirefox, 'Linux · Firefox'],
    [UA.androidFirefox, 'Android · Firefox'],
    [UA.iphoneChrome, 'iPhone · Chrome'],
  ])('%s → %s', (userAgent, label) => {
    expect(deviceLabel(userAgent)).toBe(label);
  });

  it.each([undefined, '', '   ', 'curl/8.5.0', 'Mozilla/5.0 (compatible; Robot/1.0)'])('« %s » → Appareil inconnu', (userAgent) => {
    expect(deviceLabel(userAgent)).toBe('Appareil inconnu');
  });

  it('ne dépasse jamais 80 caractères et ne recopie rien de l’agent utilisateur', () => {
    const forged = `Mozilla/5.0 (Windows NT 10.0) Chrome/1 ${'<script>'.repeat(50)}`;
    const label = deviceLabel(forged);
    expect(label.length).toBeLessThanOrEqual(80);
    expect(label).not.toContain('<script>');
  });
});
