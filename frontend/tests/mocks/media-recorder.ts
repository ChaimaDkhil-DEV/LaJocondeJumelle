import { vi } from 'vitest';

/**
 * Faux MediaRecorder réutilisable : permet de choisir les formats « supportés »,
 * de simuler un refus de micro ou l'absence complète de l'API.
 */
export interface FakeMediaOptions {
  supportedTypes?: string[];
  permission?: 'granted' | 'denied';
  available?: boolean;
}

export class FakeMediaRecorder {
  static supportedTypes: string[] = ['audio/webm;codecs=opus'];
  static instances: FakeMediaRecorder[] = [];

  static isTypeSupported(type: string): boolean {
    return FakeMediaRecorder.supportedTypes.includes(type);
  }

  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  readonly mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(
    readonly stream: MediaStream,
    options?: { mimeType?: string },
  ) {
    this.mimeType = options?.mimeType ?? FakeMediaRecorder.supportedTypes[0] ?? '';
    FakeMediaRecorder.instances.push(this);
  }

  start(): void {
    this.state = 'recording';
  }

  stop(): void {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

export function installFakeMedia(options: FakeMediaOptions = {}): void {
  const { supportedTypes, permission = 'granted', available = true } = options;
  FakeMediaRecorder.instances = [];
  if (supportedTypes) FakeMediaRecorder.supportedTypes = supportedTypes;

  if (!available) {
    vi.stubGlobal('MediaRecorder', undefined);
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    return;
  }

  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  const track = { stop: vi.fn() };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        if (permission === 'denied') {
          throw new DOMException('Permission refusée', 'NotAllowedError');
        }
        return { getTracks: () => [track] } as unknown as MediaStream;
      }),
    },
  });
}
