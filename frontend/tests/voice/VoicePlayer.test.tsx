import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoicePlayer } from '../../src/features/voice/VoicePlayer';

describe('VoicePlayer', () => {
  afterEach(() => {
    vi.mocked(HTMLMediaElement.prototype.play).mockReset();
  });

  it('a des contrôles libellés : lecture/pause et position', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockResolvedValue(undefined);
    render(<VoicePlayer src="/api/files/v1" durationSeconds={12} />);
    expect(screen.getByRole('slider', { name: 'Position dans le message vocal' })).toHaveAttribute(
      'aria-valuetext',
      '0:00 sur 0:12',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Lire le message vocal' }));
    expect(screen.getByRole('button', { name: 'Mettre en pause le message vocal' })).toBeVisible();
  });

  it('signale clairement un vocal impossible à lire sur l’appareil', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new DOMException('non pris en charge', 'NotSupportedError'));
    render(<VoicePlayer src="/api/files/v1" durationSeconds={12} />);
    await userEvent.click(screen.getByRole('button', { name: 'Lire le message vocal' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Lecture impossible');
    expect(screen.getByRole('button', { name: 'Lire le message vocal' })).toBeVisible();
  });
});
