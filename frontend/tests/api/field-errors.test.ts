import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe('fieldErrors', () => {
  it('translates the field messages sent by the API', async () => {
    localStorage.setItem('ljj-language', 'en');
    vi.resetModules();
    const { ApiError, fieldErrors } = await import('../../src/api/client');
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Certaines informations sont manquantes ou invalides.', {
      fields: [
        { field: 'unknown', messages: ['Message sans traduction'] },
        { field: 'empty', messages: [] },
      ],
    });
    expect(error.message).toBe('Some information is missing or invalid.');
    expect(fieldErrors(error)).toEqual({ unknown: 'Message sans traduction', empty: 'Invalid value' });
  });
});
