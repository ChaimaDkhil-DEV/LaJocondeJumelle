import { useCallback, useEffect, useRef, useState } from 'react';

/** Préférence locale (par navigateur) : signal sonore des notifications urgentes. */
const PREFERENCE_KEY = 'lajoconde.signalSonoreUrgences';

function readPreference(): boolean {
  try {
    return localStorage.getItem(PREFERENCE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function writePreference(enabled: boolean): void {
  try {
    localStorage.setItem(PREFERENCE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Stockage indisponible : la préférence vaut pour cette session seulement.
  }
}

type AudioContextConstructor = new () => AudioContext;

/**
 * Signal sonore facultatif des urgences (T069) : deux notes brèves par Web Audio. Le contexte audio
 * n'est créé qu'après une première interaction avec la page (clic, toucher, clavier) : jamais de son
 * sans geste préalable. Désactivable ; toujours accompagné de l'alerte visuelle et de l'annonce.
 */
export function useUrgentSound() {
  const [enabled, setEnabledState] = useState(readPreference);
  const context = useRef<AudioContext | null>(null);

  useEffect(() => {
    const unlock = () => {
      if (context.current) return;
      const Ctor = (globalThis as { AudioContext?: AudioContextConstructor }).AudioContext;
      if (!Ctor) return;
      try {
        context.current = new Ctor();
      } catch {
        context.current = null;
      }
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    writePreference(value);
  }, []);

  const play = useCallback(() => {
    const audio = context.current;
    if (!enabled || !audio) return;
    try {
      void audio.resume?.();
      const start = audio.currentTime;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, start);
      oscillator.frequency.setValueAtTime(660, start + 0.18);
      gain.gain.setValueAtTime(0.2, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.4);
    } catch {
      // Son impossible : l'alerte visuelle suffit.
    }
  }, [enabled]);

  return { enabled, setEnabled, play };
}
