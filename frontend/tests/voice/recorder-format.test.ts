import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRecordingSupported, pickRecorderFormat } from '../../src/features/voice/recorderFormat';
import { installFakeMedia } from '../mocks/media-recorder';

describe('pickRecorderFormat', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('préfère WebM/Opus, puis MP4/AAC, puis Ogg/Opus', () => {
    installFakeMedia({ supportedTypes: ['audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm;codecs=opus'] });
    expect(pickRecorderFormat()).toBe('audio/webm;codecs=opus');

    installFakeMedia({ supportedTypes: ['audio/ogg;codecs=opus', 'audio/mp4'] });
    expect(pickRecorderFormat()).toBe('audio/mp4');

    installFakeMedia({ supportedTypes: ['audio/ogg;codecs=opus'] });
    expect(pickRecorderFormat()).toBe('audio/ogg;codecs=opus');
  });

  it('renvoie null si aucun format n’est disponible', () => {
    installFakeMedia({ supportedTypes: ['audio/wav'] });
    expect(pickRecorderFormat()).toBeNull();
  });

  it('détecte l’absence de MediaRecorder ou de micro', () => {
    installFakeMedia({ available: false });
    expect(isRecordingSupported()).toBe(false);
    expect(pickRecorderFormat()).toBeNull();
  });
});
