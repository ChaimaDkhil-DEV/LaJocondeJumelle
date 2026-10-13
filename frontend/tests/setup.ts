import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom n'implémente ni les URL d'objets ni la lecture audio.
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => 'blob:simulé');
  URL.revokeObjectURL = vi.fn();
}
Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn(async () => undefined) });
Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: vi.fn() });
Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() });

afterEach(() => {
  cleanup();
});
