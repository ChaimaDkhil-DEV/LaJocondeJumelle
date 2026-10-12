import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRecorder, type VoiceRecording } from '../../src/features/voice/VoiceRecorder';
import { FakeMediaRecorder, installFakeMedia } from '../mocks/media-recorder';

/** T034 — enregistreur vocal : enregistrer, réécouter, refaire, limites, refus du micro. */

function Harness({ maxSeconds = 180, onChange }: { maxSeconds?: number; onChange?: (r: VoiceRecording | null) => void }) {
  const [value, setValue] = useState<VoiceRecording | null>(null);
  return (
    <>
      <VoiceRecorder
        maxSeconds={maxSeconds}
        value={value}
        onChange={(recording) => {
          setValue(recording);
          onChange?.(recording);
        }}
      />
      <p data-testid="value">{value ? `${value.mimeType} ${value.durationSeconds}s` : 'aucun'}</p>
    </>
  );
}

describe('VoiceRecorder', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  async function record(u: ReturnType<typeof user>, seconds: number): Promise<void> {
    await u.click(screen.getByRole('button', { name: 'Enregistrer un message vocal' }));
    await act(async () => {
      vi.advanceTimersByTime(seconds * 1000);
    });
    await u.click(await screen.findByRole('button', { name: 'Arrêter l’enregistrement' }));
  }

  it('enregistre, propose la réécoute, et renvoie le vocal au formulaire', async () => {
    installFakeMedia({ supportedTypes: ['audio/mp4'] });
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const u = user();

    await record(u, 5);

    expect(screen.getByTestId('value')).toHaveTextContent('audio/mp4 5s');
    expect(screen.getByRole('button', { name: 'Lire le message vocal' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refaire l’enregistrement' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(/Enregistrement terminé/);
    expect(FakeMediaRecorder.instances[0].mimeType).toBe('audio/mp4');
  });

  it('« Refaire » remplace l’ancien enregistrement', async () => {
    installFakeMedia();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const u = user();

    await record(u, 3);
    await u.click(screen.getByRole('button', { name: 'Refaire l’enregistrement' }));
    expect(screen.getByTestId('value')).toHaveTextContent('aucun');
    await record(u, 7);

    expect(screen.getByTestId('value')).toHaveTextContent('7s');
    expect(FakeMediaRecorder.instances).toHaveLength(2);
  });

  it('« Supprimer » retire le vocal', async () => {
    installFakeMedia();
    render(<Harness />);
    const u = user();
    await record(u, 3);
    await u.click(screen.getByRole('button', { name: 'Supprimer le message vocal' }));
    expect(screen.getByTestId('value')).toHaveTextContent('aucun');
    expect(screen.getByRole('button', { name: 'Enregistrer un message vocal' })).toBeVisible();
  });

  it('avertit à 80 % de la durée maximale et arrête automatiquement à 100 %', async () => {
    installFakeMedia();
    render(<Harness maxSeconds={10} />);
    const u = user();

    await u.click(screen.getByRole('button', { name: 'Enregistrer un message vocal' }));
    await act(async () => {
      vi.advanceTimersByTime(8_000);
    });
    expect(screen.getByText(/Plus que 2 secondes/)).toBeVisible();

    await act(async () => {
      vi.advanceTimersByTime(2_500);
    });
    expect(FakeMediaRecorder.instances[0].state).toBe('inactive');
    expect(screen.getByTestId('value')).toHaveTextContent('10s');
    expect(screen.getByRole('status')).toHaveTextContent(/Durée maximale atteinte/);
  });

  it('refuse un enregistrement de moins d’une seconde', async () => {
    installFakeMedia();
    render(<Harness />);
    const u = user();

    await u.click(screen.getByRole('button', { name: 'Enregistrer un message vocal' }));
    await u.click(await screen.findByRole('button', { name: 'Arrêter l’enregistrement' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Le message est trop court');
    expect(screen.getByTestId('value')).toHaveTextContent('aucun');
  });

  it('explique comment autoriser le micro quand l’accès est refusé', async () => {
    installFakeMedia({ permission: 'denied' });
    render(<Harness />);
    await user().click(screen.getByRole('button', { name: 'Enregistrer un message vocal' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/micro/);
    expect(alert).toHaveTextContent(/description écrite/);
  });

  it('signale un navigateur qui ne permet pas d’enregistrer', () => {
    installFakeMedia({ available: false });
    render(<Harness />);
    expect(screen.getByRole('alert')).toHaveTextContent(/ne permet pas d’enregistrer/);
    expect(screen.queryByRole('button', { name: 'Enregistrer un message vocal' })).not.toBeInTheDocument();
  });
});
