import { describe, expect, it } from 'vitest';
import { isTunisianPhone } from '../../src/features/students/tunisianPhone';

/** Même règle que le serveur : 8 chiffres, avec ou sans l'indicatif tunisien. */

describe('isTunisianPhone', () => {
  it.each(['20123456', '20 123 456', '20.123.456', '20-123-456', '  20  123  456  ', '+216 20 123 456', '+21620123456', '00216 20 123 456'])(
    'accepte « %s »',
    (value) => expect(isTunisianPhone(value)).toBe(true),
  );

  it.each(['', '2012345', '201234567', '06 12 34 56 78', '+33 6 12 34 56 78', '+216 20 123 45', '+216 20 123 4567', 'abcdefgh', '20+123 456', '(20) 123 456'])(
    'refuse « %s »',
    (value) => expect(isTunisianPhone(value)).toBe(false),
  );
});
