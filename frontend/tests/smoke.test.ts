import { describe, expect, it } from 'vitest';
import { FakeMediaRecorder, installFakeMedia } from './mocks/media-recorder';

describe('outillage de test', () => {
  it('installe un faux MediaRecorder', () => {
    installFakeMedia({ supportedTypes: ['audio/mp4'] });
    expect(MediaRecorder.isTypeSupported('audio/mp4')).toBe(true);
    expect(FakeMediaRecorder.isTypeSupported('audio/webm;codecs=opus')).toBe(false);
  });
});
