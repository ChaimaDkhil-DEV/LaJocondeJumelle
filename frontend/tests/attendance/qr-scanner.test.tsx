import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QrScannerDialog } from '../../src/features/attendance/QrScannerDialog';
import { createQrReader, readQrPhoto, type QrReader } from '../../src/features/attendance/qrReader';

/**
 * Lecteur de QR code intégré (pointage des enseignants, déclaration d'une classe vide 013) : la caméra lit
 * le QR toute seule ; sans elle, un message dit pourquoi et quoi faire, une photo du QR code ou son lien
 * collé prennent le relais.
 */

vi.mock('../../src/features/attendance/qrReader', () => ({ createQrReader: vi.fn(), readQrPhoto: vi.fn() }));

const TOKEN = 'c1.0a1b2c3d-1111-4222-8333-444455556666.1.c2ln';
const LINK = `https://ecole.example/gardes/presence?c=${TOKEN}`;
const TITLE = 'Scanner le QR code de la classe';
const PHOTO = 'Prendre une photo du QR code';
const MANUAL = 'Saisir le lien ou le code du QR code';
const FIELD = 'Lien ou code du QR code';

const stopTrack = vi.fn();
const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;

function cameraAnswers(getUserMedia: () => Promise<MediaStream>) {
  const spy = vi.fn(getUserMedia);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: spy } });
  return spy;
}

/** Lecteur simulé : renvoie, à chaque lecture, les textes suivants de la liste (le dernier se répète). */
function readerSeeing(...frames: string[][]): QrReader & { read: ReturnType<typeof vi.fn> } {
  let index = 0;
  const reader = { read: vi.fn(async () => frames[Math.min(index++, frames.length - 1)] ?? []) };
  vi.mocked(createQrReader).mockResolvedValue(reader);
  return reader;
}

function open() {
  const onToken = vi.fn();
  const onClose = vi.fn();
  const view = render(<QrScannerDialog onToken={onToken} onClose={onClose} />);
  return { onToken, onClose, view, dialog: screen.getByRole('dialog', { name: TITLE }) };
}

/** jsdom ne décode pas de vidéo : la caméra simulée a toujours une image de 1280 × 720 prête. */
const videoProps = ['readyState', 'videoWidth', 'videoHeight'] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
beforeEach(() => {
  const values = { readyState: 4, videoWidth: 1280, videoHeight: 720 };
  for (const prop of videoProps) {
    saved.set(prop, Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, prop));
    Object.defineProperty(HTMLVideoElement.prototype, prop, { configurable: true, get: () => values[prop] });
  }
});

afterEach(() => {
  for (const prop of videoProps) {
    const descriptor = saved.get(prop);
    if (descriptor) Object.defineProperty(HTMLVideoElement.prototype, prop, descriptor);
    else delete (HTMLVideoElement.prototype as unknown as Record<string, unknown>)[prop];
  }
  delete (navigator as unknown as Record<string, unknown>).mediaDevices;
  vi.unstubAllGlobals();
  vi.mocked(createQrReader).mockReset();
  vi.mocked(readQrPhoto).mockReset();
  stopTrack.mockReset();
});

describe('Caméra indisponible : un message par cause, avec la marche à suivre', () => {
  it.each([
    [
      'adresse non sécurisée (http)',
      () => {
        vi.stubGlobal('isSecureContext', false);
        cameraAnswers(async () => stream);
      },
      'La caméra ne s’ouvre que sur une adresse sécurisée (https) : prenez une photo du QR code, ou ouvrez l’application par son adresse https.',
    ],
    [
      'navigateur sans accès à la caméra',
      () => undefined,
      'La caméra n’est pas disponible dans ce navigateur : prenez une photo du QR code, ou ouvrez le lien dans Safari ou Chrome.',
    ],
    [
      'accès refusé',
      () => cameraAnswers(() => Promise.reject(new DOMException('refus', 'NotAllowedError'))),
      'L’accès à la caméra est refusé : autorisez la caméra pour ce site dans les réglages du navigateur, ou prenez une photo du QR code.',
    ],
    [
      'aucune caméra',
      () => cameraAnswers(() => Promise.reject(new DOMException('absente', 'NotFoundError'))),
      'Aucune caméra n’a été trouvée sur cet appareil : choisissez une photo du QR code, ou collez son lien ou son code.',
    ],
    [
      'caméra occupée',
      () => cameraAnswers(() => Promise.reject(new DOMException('occupée', 'NotReadableError'))),
      'La caméra est déjà utilisée par une autre application : fermez-la, puis rouvrez le scan, ou prenez une photo du QR code.',
    ],
    [
      'autre erreur',
      () => cameraAnswers(() => Promise.reject(new Error('inattendue'))),
      'La caméra n’a pas pu s’ouvrir : prenez une photo du QR code, ou collez son lien ou son code.',
    ],
  ])('%s : message précis, photo et saisie du lien proposées tout de suite', async (_cause, arrange, message) => {
    arrange();
    const { dialog } = open();
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: PHOTO })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: FIELD })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: MANUAL })).not.toBeInTheDocument();
  });
});

describe('Caméra ouverte : le QR code est lu dans l’image', () => {
  it('demande la caméra arrière, en bonne définition', async () => {
    readerSeeing([]);
    const getUserMedia = cameraAnswers(async () => stream);
    open();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  });

  it('un QR de classe dans l’image : le jeton est transmis une seule fois, sans rien saisir', async () => {
    const reader = readerSeeing([], [LINK]);
    cameraAnswers(async () => stream);
    const { onToken, dialog } = open();
    await waitFor(() => expect(onToken).toHaveBeenCalledWith(TOKEN));
    expect(reader.read).toHaveBeenCalledWith(dialog.querySelector('video'), 1280, 720);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(onToken).toHaveBeenCalledTimes(1);
  });

  it('un QR qui n’est pas celui d’une classe : message, et la lecture continue', async () => {
    readerSeeing(['https://autre.example/menu'], [LINK]);
    cameraAnswers(async () => stream);
    const { onToken, dialog } = open();
    expect(await within(dialog).findByText('Ce QR code n’est pas celui d’une classe.')).toBeInTheDocument();
    await waitFor(() => expect(onToken).toHaveBeenCalledWith(TOKEN));
  });

  it('la saisie du lien ou du code est repliée derrière un bouton, puis utilisable', async () => {
    readerSeeing([]);
    cameraAnswers(async () => stream);
    const user = userEvent.setup();
    const { onToken, dialog } = open();
    const toggle = await within(dialog).findByRole('button', { name: MANUAL });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog).queryByRole('textbox', { name: FIELD })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const field = within(dialog).getByRole('textbox', { name: FIELD });
    expect(field).toHaveFocus();
    await user.type(field, LINK);
    await user.click(within(dialog).getByRole('button', { name: 'Continuer' }));
    expect(onToken).toHaveBeenCalledWith(TOKEN);
  });

  it('fermer le lecteur éteint la caméra', async () => {
    readerSeeing([]);
    cameraAnswers(async () => stream);
    const { view, dialog } = open();
    await within(dialog).findByRole('button', { name: MANUAL });
    view.unmount();
    expect(stopTrack).toHaveBeenCalled();
  });
});

describe('Photo du QR code : lue directement dans l’image, même sans caméra dans la page', () => {
  const photo = () => new File(['image'], 'qr.jpg', { type: 'image/jpeg' });
  const photoInput = (dialog: HTMLElement) => dialog.querySelector<HTMLInputElement>('input[type="file"]')!;

  beforeEach(() => {
    vi.mocked(createQrReader).mockResolvedValue({ read: vi.fn(async () => []) });
  });

  it('le bouton ouvre l’appareil photo du téléphone (caméra arrière)', async () => {
    const user = userEvent.setup();
    const { dialog } = open();
    const input = photoInput(dialog);
    expect(input).toHaveAttribute('accept', 'image/*');
    expect(input).toHaveAttribute('capture', 'environment');
    const click = vi.spyOn(input, 'click');
    await user.click(within(dialog).getByRole('button', { name: PHOTO }));
    expect(click).toHaveBeenCalled();
  });

  it('une photo du QR de la classe : le jeton est transmis', async () => {
    vi.mocked(readQrPhoto).mockResolvedValue([LINK]);
    const user = userEvent.setup();
    const { onToken, dialog } = open();
    const file = photo();
    await user.upload(photoInput(dialog), file);
    await waitFor(() => expect(onToken).toHaveBeenCalledWith(TOKEN));
    expect(vi.mocked(readQrPhoto).mock.calls[0][0]).toBe(file);
  });

  it.each([
    [[], 'Aucun QR code n’a été trouvé sur la photo : reprenez-la de plus près, avec le QR code entier et net.'],
    [['https://autre.example/menu'], 'Ce QR code n’est pas celui d’une classe.'],
  ])('photo lue %j : message, rien n’est transmis', async (texts, message) => {
    vi.mocked(readQrPhoto).mockResolvedValue(texts);
    const user = userEvent.setup();
    const { onToken, dialog } = open();
    await user.upload(photoInput(dialog), photo());
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(onToken).not.toHaveBeenCalled();
  });

  it('photo illisible : message, rien n’est transmis', async () => {
    vi.mocked(readQrPhoto).mockRejectedValue(new Error('format inconnu'));
    const user = userEvent.setup();
    const { onToken, dialog } = open();
    await user.upload(photoInput(dialog), photo());
    expect(
      await within(dialog).findByText('Cette photo n’a pas pu être lue : reprenez-la, ou collez le lien ou le code du QR code.'),
    ).toBeInTheDocument();
    expect(onToken).not.toHaveBeenCalled();
  });
});
