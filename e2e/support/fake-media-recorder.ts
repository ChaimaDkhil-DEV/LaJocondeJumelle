import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * WebKit (dont le profil iPhone 13) n'a pas de micro simulé dans Playwright.
 * Ce script remplace getUserMedia et MediaRecorder par une simulation qui produit
 * un vrai Blob audio/mp4 (fixture), afin que l'envoi et la lecture restent réels.
 */
export async function installFakeMediaRecorder(
  page: Page,
  fixture = join(__dirname, '..', 'fixtures', 'audio', 'sample.m4a'),
): Promise<void> {
  const base64 = readFileSync(fixture).toString('base64');
  await page.addInitScript((audioBase64: string) => {
    const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    const fakeStream = { getTracks: () => [{ stop: () => undefined }] } as unknown as MediaStream;

    class SimulatedMediaRecorder {
      static isTypeSupported(type: string): boolean {
        return type === 'audio/mp4';
      }
      state: RecordingState = 'inactive';
      mimeType = 'audio/mp4';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      constructor(readonly stream: MediaStream) {}
      start(): void {
        this.state = 'recording';
      }
      stop(): void {
        if (this.state === 'inactive') return;
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob([bytes], { type: 'audio/mp4' }) });
        this.onstop?.();
      }
    }

    Object.defineProperty(window, 'MediaRecorder', { value: SimulatedMediaRecorder, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => fakeStream },
    });
  }, base64);
}
