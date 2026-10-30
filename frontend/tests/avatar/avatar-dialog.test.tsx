import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAvatarStore, setAvatarUrl, useAvatarUrl } from '../../src/api/avatars';
import { AvatarDialog } from '../../src/features/avatar/AvatarDialog';
import { centeredCrop, clampCrop, sourceRect, validateFile, zoomCrop } from '../../src/features/avatar/cropImage';

/** « Changer la photo » : validations, recadrage, galerie, rétablissement, envoi. */

// Le rendu sur canvas n'existe pas dans jsdom : l'image produite est simulée.
vi.mock('../../src/features/avatar/cropImage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/features/avatar/cropImage')>();
  return { ...actual, renderUri: vi.fn(async () => new Blob(['png'], { type: 'image/png' })), renderCrop: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) };
});

const USER = { id: 'u-1', displayName: 'Léa Durand' };

describe('Recadrage et validations (sans interface)', () => {
  it('refuse les mauvais formats et les fichiers de plus de 2 Mo, en français', () => {
    expect(validateFile({ type: 'image/gif', size: 10 })).toBe('Formats acceptés : JPG, PNG ou WebP.');
    expect(validateFile({ type: 'image/heic', size: 10 })).toBe('Formats acceptés : JPG, PNG ou WebP.');
    expect(validateFile({ type: 'image/png', size: 2 * 1024 * 1024 + 1 })).toBe('La photo ne doit pas dépasser 2 Mo.');
    expect(validateFile({ type: 'image/webp', size: 2 * 1024 * 1024 })).toBeNull();
  });

  it('image paysage centrée, toujours couvrante ; le zoom garde le centre', () => {
    const crop = centeredCrop(400, 200, 240);
    expect(crop).toEqual({ zoom: 1, x: -120, y: 0 });
    expect(sourceRect(crop, 400, 200, 240)).toMatchObject({ sx: 100, size: 200 });
    expect(sourceRect(crop, 400, 200, 240).sy).toBeCloseTo(0);
    // Pas de bord vide, même en tirant trop loin.
    expect(clampCrop({ ...crop, x: 50, y: 50 }, 400, 200, 240)).toEqual({ zoom: 1, x: 0, y: 0 });
    const zoomed = zoomCrop(crop, 2, 400, 200, 240);
    expect(sourceRect(zoomed, 400, 200, 240)).toEqual({ sx: 150, sy: 50, size: 100 });
    expect(clampCrop({ ...crop, zoom: 9 }, 400, 200, 240).zoom).toBe(3);
  });
});

function Current({ id }: { id: string }) {
  return <output aria-label="Photo actuelle">{useAvatarUrl(id) ?? 'défaut'}</output>;
}

describe('Fenêtre « Changer la photo »', () => {
  let calls: Array<{ url: string; method: string; body: unknown }>;

  beforeEach(() => {
    resetAvatarStore();
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const method = init.method ?? 'GET';
        calls.push({ url, method, body: init.body });
        const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (url === '/api/users/avatars') return json([]);
        if (url === '/api/users/u-1/avatar' && method === 'POST') return json({ avatarUrl: '/api/users/u-1/avatar?v=bbbbbbbbbbbbbbbb', avatarType: 'CUSTOM' });
        if (url === '/api/users/u-1/avatar' && method === 'DELETE') return json({ avatarUrl: null, avatarType: 'DEFAULT' });
        return new Response(null, { status: 404 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fichier refusé avant tout envoi : message clair, rien n’est enregistrable', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<AvatarDialog open user={USER} onClose={() => undefined} />);
    expect(screen.getByRole('img', { name: 'Photo de Léa Durand' })).toBeVisible();
    await user.upload(screen.getByLabelText('Photo de profil'), new File(['gif'], 'anim.gif', { type: 'image/gif' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Formats acceptés : JPG, PNG ou WebP.');
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'grande.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Photo de profil'), big);
    expect(await screen.findByRole('alert')).toHaveTextContent('La photo ne doit pas dépasser 2 Mo.');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('avatar de la galerie : aperçu, envoi en PNG, tous les avatars du compte mis à jour', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <>
        <AvatarDialog open user={USER} onClose={onClose} />
        <Current id="u-1" />
      </>,
    );
    const gallery = screen.getByRole('group', { name: 'Ou choisissez un avatar' });
    const preset = within(gallery).getAllByRole('button')[2];
    await user.click(preset);
    expect(preset).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.url).toBe('/api/users/u-1/avatar');
    expect((post.body as FormData).get('file')).toBeInstanceOf(Blob);
    expect(screen.getByLabelText('Photo actuelle')).toHaveTextContent('/api/users/u-1/avatar?v=bbbbbbbbbbbbbbbb');
  });

  it('« Rétablir l’avatar par défaut » : seulement avec une photo, puis DELETE', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AvatarDialog open user={USER} onClose={onClose} />);
    await waitFor(() => expect(calls.some((c) => c.url === '/api/users/avatars')).toBe(true));
    expect(screen.queryByRole('button', { name: 'Rétablir l’avatar par défaut' })).not.toBeInTheDocument();
    setAvatarUrl('u-1', '/api/users/u-1/avatar?v=cccccccccccccccc');
    const restore = await screen.findByRole('button', { name: 'Rétablir l’avatar par défaut' });
    await user.click(restore);
    expect(restore).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/users/u-1/avatar')).toBe(true));
    expect(onClose).toHaveBeenCalled();
  });

  it('erreur du serveur : message affiché, la fenêtre reste ouverte', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) =>
        url === '/api/users/u-1/avatar' && init.method === 'POST'
          ? new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Vous ne pouvez changer que votre propre photo.' } }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' },
            })
          : new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      ),
    );
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AvatarDialog open user={USER} onClose={onClose} />);
    await user.click(within(screen.getByRole('group', { name: 'Ou choisissez un avatar' })).getAllByRole('button')[0]);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vous ne pouvez changer que votre propre photo.');
    expect(onClose).not.toHaveBeenCalled();
  });
});
