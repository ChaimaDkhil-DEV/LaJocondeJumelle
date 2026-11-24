import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatComposer } from '../../src/features/parent-communications/ChatComposer';
import { FilePickerButton } from '../../src/features/thread/FilePickerButton';
import { VoiceRecorder } from '../../src/features/voice/VoiceRecorder';
import { installFakeMedia } from '../mocks/media-recorder';

/** Un contenu masqué mesure 1 px : dans `sx`, `width: 1` vaut 100 % et peut élargir toute la page (page Élèves). */
describe('contenus masqués visuellement', () => {
  afterEach(() => vi.unstubAllGlobals());

  const hidden = { position: 'absolute', width: '1px', height: '1px' };

  it('champ fichier du sélecteur, toujours atteignable', () => {
    render(<FilePickerButton label="Joindre un fichier" icon={null} accept="image/png" onChange={() => undefined} />);
    const input = screen.getByLabelText('Joindre un fichier');
    expect(input).toHaveStyle(hidden);
    expect(input).toBeEnabled();
  });

  it('annonce de la zone de saisie d’une conversation', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ChatComposer onSend={async () => undefined} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('status')).toHaveStyle(hidden);
  });

  it('libellé « Arrêter l’enregistrement » de l’enregistreur vocal', async () => {
    installFakeMedia();
    render(<VoiceRecorder variant="hero" maxSeconds={180} value={null} onChange={() => undefined} />);
    await userEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('Arrêter l’enregistrement')).toHaveStyle(hidden);
  });
});
