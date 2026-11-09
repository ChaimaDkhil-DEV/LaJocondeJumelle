import { useCallback, useEffect, useRef } from 'react';
import { useNotificationPreferences, useUpdateNotificationPreferences } from './api';

/**
 * Ancienne préférence locale (par navigateur) du signal sonore des urgences. Depuis la spec 014 (NC-6),
 * le réglage est sur le compte ; une valeur « off » est reprise une fois si le compte n'a jamais été
 * réglé, puis la clé est supprimée dans tous les cas.
 */
const LEGACY_KEY = 'lajoconde.signalSonoreUrgences';

function takeLegacyPreference(): string | null {
  try {
    const value = localStorage.getItem(LEGACY_KEY);
    if (value !== null) localStorage.removeItem(LEGACY_KEY);
    return value;
  } catch {
    return null;
  }
}

type AudioContextConstructor = new () => AudioContext;

/**
 * Signal sonore facultatif des urgences (T069) : deux notes brèves par Web Audio. Le contexte audio
 * n'est créé qu'après une première interaction avec la page (clic, toucher, clavier) : jamais de son
 * sans geste préalable. Désactivable sur le compte (spec 014) ; toujours accompagné de l'alerte visuelle et de l'annonce.
 */
export function useUrgentSound() {
  const preferences = useNotificationPreferences();
  const { mutate: update } = useUpdateNotificationPreferences();
  // Actif par défaut (préférences pas encore chargées ou indisponibles) : l'alerte visuelle reste de toute façon.
  const enabled = preferences.data?.urgentSound ?? true;
  const context = useRef<AudioContext | null>(null);
  const legacyChecked = useRef(false);

  // Reprise unique de l'ancienne valeur locale (NC-6).
  useEffect(() => {
    if (legacyChecked.current || !preferences.data) return;
    legacyChecked.current = true;
    const legacy = takeLegacyPreference();
    if (legacy === 'off' && !preferences.data.urgentSoundSet) update({ urgentSound: false });
  }, [preferences.data, update]);

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

  const setEnabled = useCallback((value: boolean) => update({ urgentSound: value }), [update]);

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
