import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { ClassesAdminPage } from '../../src/features/coverage/ClassesAdminPage';

// jsdom n'a pas de canvas : l'image du QR code n'est pas l'objet de ces tests.
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,AAAA') } }));

/**
 * Dialogue du QR code d'une classe : le lien est affiché en texte et copiable, pour tester le parcours du
 * QR code sans le scanner (en local, un téléphone ne joint pas « localhost »). Le lien n'est jamais imprimé.
 */

const LINK = 'http://localhost:5173/gardes/presence?c=c1.0a1b2c3d-1111-4222-8333-444455556666.1.c2ln';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mount() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/admin/coverage/classes') {
        return json(200, [{ id: 'k1', name: '1ère année Violet', room: 'Salle 12', active: true, floor: null, qrVersion: 1, updatedAt: '2026-11-05T08:00:00.000Z' }]);
      }
      if (url === '/api/admin/coverage/classes/k1/qr') {
        return json(200, { classId: 'k1', name: '1ère année Violet', room: 'Salle 12', version: 1, url: LINK });
      }
      return json(200, []);
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter>
          <ClassesAdminPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function openQrDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'QR code de la classe 1ère année Violet' }));
  return screen.findByRole('dialog', { name: 'QR code : 1ère année Violet' });
}

afterEach(() => vi.unstubAllGlobals());

describe('Lien du QR code d’une classe', () => {
  it('affiche le lien complet en texte, en lecture seule', async () => {
    const user = userEvent.setup();
    mount();
    const dialog = await openQrDialog(user);
    const field = await within(dialog).findByRole('textbox', { name: 'Lien du QR code' });
    expect(field).toHaveValue(LINK);
    expect(field).toHaveAttribute('readonly');
  });

  it('le lien n’est pas dans la fiche imprimée', async () => {
    const user = userEvent.setup();
    mount();
    const dialog = await openQrDialog(user);
    const field = await within(dialog).findByRole('textbox', { name: 'Lien du QR code' });
    expect(await within(dialog).findByAltText('QR code de la classe 1ère année Violet')).toBeInTheDocument();
    // Seul le contenu de « .qr-print » est imprimé (voir la feuille de style d'impression du dialogue).
    expect(field.closest('.qr-print')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Copier le lien' }).closest('.qr-print')).toBeNull();
  });

  it('« Copier le lien » met le lien dans le presse-papiers et le confirme', async () => {
    const user = userEvent.setup();
    mount();
    const dialog = await openQrDialog(user);
    await user.click(await within(dialog).findByRole('button', { name: 'Copier le lien' }));
    expect(await screen.findByText('Lien copié.')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(LINK);
  });

  it('presse-papiers refusé : message clair, le lien reste sélectionnable à la main', async () => {
    const user = userEvent.setup();
    mount();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('refusé'));
    const dialog = await openQrDialog(user);
    await user.click(await within(dialog).findByRole('button', { name: 'Copier le lien' }));
    expect(await screen.findByText('Copie impossible : sélectionnez le lien et copiez-le avec Ctrl+C.')).toBeInTheDocument();
    expect(screen.queryByText('Lien copié.')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Lien du QR code' })).toHaveValue(LINK);
  });
});
