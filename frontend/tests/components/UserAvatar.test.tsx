import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAvatarStore, setAvatarUrl } from '../../src/api/avatars';
import { colorFor, DEFAULT_AVATAR_STYLE, initials, UserAvatar } from '../../src/components/UserAvatar';
import { avatarColors } from '../../src/design/tokens';

/** Avatar réutilisable : défaut calculé, photo personnalisée, repli si l'image ne charge pas, tailles, texte alternatif. */

function stubAvatars(rows: Array<{ id: string; avatarUrl: string }>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      return url === '/api/users/avatars'
        ? new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } })
        : new Response(null, { status: 404 });
    }),
  );
  return calls;
}

describe('UserAvatar', () => {
  beforeEach(() => resetAvatarStore());
  afterEach(() => vi.unstubAllGlobals());

  it('avatar par défaut (option A) : initiales sur une couleur douce stable, palette de 9 couleurs', async () => {
    stubAvatars([]);
    expect(DEFAULT_AVATAR_STYLE).toBe('initials');
    expect(avatarColors).toHaveLength(9);
    expect(initials('Reprographie')).toBe('RE');
    expect(initials('Marie Dupont')).toBe('MD');
    expect(colorFor('u-1')).toEqual(colorFor('u-1'));
    const { container } = render(<UserAvatar user={{ id: 'u-1', displayName: 'Reprographie' }} size="lg" />);
    expect(container).toHaveTextContent('RE');
    // Décoratif par défaut : le nom est écrit à côté.
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstChild).toHaveStyle({ width: '40px', height: '40px' });
  });

  it('photo personnalisée : image du compte, texte alternatif quand l’avatar est seul', async () => {
    const calls = stubAvatars([{ id: 'u-2', avatarUrl: '/api/users/u-2/avatar?v=0123456789abcdef' }]);
    render(<UserAvatar user={{ id: 'u-2', displayName: 'Léa Durand' }} size="md" labelled />);
    // Initiales le temps du chargement de la liste, puis la photo.
    await waitFor(() => expect(screen.getByRole('img', { name: 'Photo de Léa Durand' }).tagName).toBe('IMG'));
    const img = screen.getByRole('img', { name: 'Photo de Léa Durand' });
    expect(img).toHaveAttribute('src', '/api/users/u-2/avatar?v=0123456789abcdef');
    expect(img).toHaveAttribute('width', '32');
    // Liste chargée une seule fois, partagée par tous les avatars.
    render(<UserAvatar name="Léa Durand" id="u-2" />);
    await waitFor(() => expect(calls.filter((u) => u === '/api/users/avatars')).toHaveLength(1));
  });

  it('image qui ne charge pas : retour à l’avatar par défaut', async () => {
    stubAvatars([{ id: 'u-3', avatarUrl: '/api/users/u-3/avatar?v=0123456789abcdef' }]);
    const { container } = render(<UserAvatar user={{ id: 'u-3', displayName: 'Paul Martin' }} size="sm" labelled />);
    await waitFor(() => expect(screen.getByRole('img', { name: 'Photo de Paul Martin' }).tagName).toBe('IMG'));
    fireEvent.error(screen.getByRole('img', { name: 'Photo de Paul Martin' }));
    expect(container).toHaveTextContent('PM');
    expect(screen.getByRole('img', { name: 'Photo de Paul Martin' })).toHaveStyle({ width: '24px' });
  });

  it('changement fait dans la session : tous les avatars du compte suivent ; retour au défaut', async () => {
    stubAvatars([]);
    const { container } = render(<UserAvatar user={{ id: 'u-4', displayName: 'Anne Roy' }} />);
    expect(container).toHaveTextContent('AR');
    act(() => setAvatarUrl('u-4', '/api/users/u-4/avatar?v=aaaaaaaaaaaaaaaa'));
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/users/u-4/avatar?v=aaaaaaaaaaaaaaaa');
    act(() => setAvatarUrl('u-4', null));
    expect(container).toHaveTextContent('AR');
  });

  it('liste des photos indisponible (hors ligne) : avatars par défaut, sans erreur', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const { container } = render(<UserAvatar user={{ id: 'u-5', displayName: 'Hors Ligne' }} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toHaveTextContent('HL');
  });
});
