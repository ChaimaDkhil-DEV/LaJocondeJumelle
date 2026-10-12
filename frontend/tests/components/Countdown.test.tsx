import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, resetClockOffset } from '../../src/api/client';
import { Countdown, formatRemaining } from '../../src/components/Countdown';

/** T082 — compte à rebours des délais : temps restant, alerte, retard, heure du serveur. */

const NOW = new Date('2026-10-12T10:00:00.000Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

describe('formatRemaining', () => {
  it.each([
    [45_000, '45 s'],
    [90_000, '1 min 30 s'],
    [15 * 60_000, '15 min'],
    [125 * 60_000, '2 h 05'],
    [27 * 3_600_000, '1 j 3 h'],
  ])('%i ms → %s', (ms, text) => {
    expect(formatRemaining(ms)).toBe(text);
  });
});

describe('Countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    resetClockOffset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetClockOffset();
  });

  it('n’affiche rien sans délai suivi', () => {
    const { container } = render(<Countdown stage={null} dueAt={null} warnAt={null} overdueStage={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('affiche le temps restant pour l’étape en cours', () => {
    render(<Countdown stage="TAKEOVER" dueAt={at(125)} warnAt={at(100)} overdueStage={null} />);
    expect(screen.getByText('Reste 2 h 05 pour la prise en charge')).toBeVisible();
  });

  it('signale une échéance proche à partir du seuil d’alerte', () => {
    render(<Countdown stage="COMPLETION" dueAt={at(1.5)} warnAt={at(-1)} overdueStage={null} />);
    expect(screen.getByText('Bientôt en retard : reste 1 min 30 s pour la réalisation')).toBeVisible();
  });

  it('signale le retard marqué par le serveur, avec l’étape concernée', () => {
    render(<Countdown stage="COMPLETION" dueAt={at(-5)} warnAt={at(-10)} overdueStage="COMPLETION" />);
    expect(screen.getByText('En retard (réalisation)')).toBeVisible();
  });

  it('signale le retard dès l’échéance, avant même le passage du job', () => {
    render(<Countdown stage="VALIDATION" dueAt={at(-0.1)} warnAt={at(-1)} overdueStage={null} />);
    expect(screen.getByText('En retard (validation)')).toBeVisible();
  });

  it('se met à jour avec le temps, sans annonce aux lecteurs d’écran à chaque seconde', () => {
    const { container } = render(<Countdown stage="TAKEOVER" dueAt={at(10)} warnAt={at(8)} overdueStage={null} />);
    expect(screen.getByText('Reste 10 min pour la prise en charge')).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(3 * 60_000);
    });
    expect(screen.getByText('Reste 7 min pour la prise en charge')).toBeVisible();
    expect(container.querySelector('[aria-live]')).toBeNull();
  });

  it('se cale sur l’heure du serveur (décalage d’horloge)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'X-Server-Time': at(5) } })),
    );
    await apiFetch('/api/auth/me');
    render(<Countdown stage="TAKEOVER" dueAt={at(10)} warnAt={at(2)} overdueStage={null} />);
    // Le serveur a 5 min d'avance : il reste 5 min, et l'alerte est déjà active.
    expect(screen.getByText('Bientôt en retard : reste 5 min pour la prise en charge')).toBeVisible();
  });
});
