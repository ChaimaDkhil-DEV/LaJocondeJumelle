import { validateWithDto } from '../../src/common/csv-import';
import { normalizeTunisianPhone } from '../../src/common/tunisian-phone';
import { GuardianDto, UpdateGuardianDto } from '../../src/parent-communications/parent-communications.dto';
import { StudentDto } from '../../src/students/students.dto';

const CLASS_ID = '00000000-0000-4000-8000-000000000001';
const STUDENT_ID = '00000000-0000-4000-8000-000000000002';

const student = (parentPhone: unknown) => validateWithDto(StudentDto, { firstName: 'Aya', lastName: 'Ben Ali', classId: CLASS_ID, parentPhone });
const createGuardian = (phone?: unknown) =>
  validateWithDto(GuardianDto, { firstName: 'Sami', lastName: 'Ben Ali', studentIds: [STUDENT_ID], ...(phone === undefined ? {} : { phone }) });
const updateGuardian = (phone: unknown) => validateWithDto(UpdateGuardianDto, { phone });

/** Écritures d'un même numéro tunisien : 8 chiffres, avec ou sans l'indicatif du pays. */
const VALID = [
  '20123456',
  '20 123 456',
  '20.123.456',
  '20-123-456',
  '  20  123  456  ',
  '+216 20 123 456',
  '+21620123456',
  '00216 20 123 456',
  '0021620123456',
];

const INVALID = [
  ['7 chiffres', '2012345'],
  ['9 chiffres', '201234567'],
  ['numéro français à 10 chiffres', '06 12 34 56 78'],
  ['indicatif étranger', '+33 6 12 34 56 78'],
  ['indicatif tunisien suivi de 7 chiffres', '+216 20 123 45'],
  ['indicatif tunisien suivi de 9 chiffres', '+216 20 123 4567'],
  ['lettres', 'vingt-vingt'],
  ['« + » au milieu', '20+123 456'],
  ['parenthèses', '(20) 123 456'],
  ['vide', ''],
] as const;

describe('normalizeTunisianPhone', () => {
  it.each(VALID)('met « %s » au format +216 XX XXX XXX', (raw) => {
    expect(normalizeTunisianPhone(raw)).toBe('+216 20 123 456');
  });

  it.each(INVALID)('laisse inchangé (à un espacement près) un numéro invalide : %s', (_label, raw) => {
    expect(normalizeTunisianPhone(raw)).toBe(raw.trim().replace(/\s+/g, ' '));
  });

  it('ne touche pas une valeur qui n’est pas du texte', () => {
    expect(normalizeTunisianPhone(null)).toBeNull();
    expect(normalizeTunisianPhone(20123456)).toBe(20123456);
  });
});

describe('Téléphone tunisien : élève (StudentDto.parentPhone)', () => {
  it.each(VALID)('accepte « %s » et le range au format +216 XX XXX XXX', (raw) => {
    const checked = student(raw);
    expect(checked.errors).toEqual([]);
    expect(checked.value?.parentPhone).toBe('+216 20 123 456');
  });

  it.each(INVALID)('refuse %s', (_label, raw) => {
    const checked = student(raw);
    expect(checked.value).toBeNull();
    expect(checked.errors.join(' ')).toContain('8 chiffres');
  });

  it('refuse un numéro absent', () => {
    expect(student(undefined).value).toBeNull();
  });
});

describe('Téléphone tunisien : représentant (GuardianDto et UpdateGuardianDto)', () => {
  it.each(VALID)('accepte « %s » à la création et le range au format +216 XX XXX XXX', (raw) => {
    const checked = createGuardian(raw);
    expect(checked.errors).toEqual([]);
    expect(checked.value?.phone).toBe('+216 20 123 456');
  });

  it.each(VALID)('accepte « %s » à la modification et le range au format +216 XX XXX XXX', (raw) => {
    const checked = updateGuardian(raw);
    expect(checked.errors).toEqual([]);
    expect(checked.value?.phone).toBe('+216 20 123 456');
  });

  it.each(INVALID.filter(([, raw]) => raw !== ''))('refuse %s à la création', (_label, raw) => {
    const checked = createGuardian(raw);
    expect(checked.value).toBeNull();
    expect(checked.errors.join(' ')).toContain('8 chiffres');
  });

  it.each(INVALID.filter(([, raw]) => raw !== ''))('refuse %s à la modification', (_label, raw) => {
    const checked = updateGuardian(raw);
    expect(checked.value).toBeNull();
    expect(checked.errors.join(' ')).toContain('8 chiffres');
  });

  it('garde le téléphone facultatif : absent, null ou vide', () => {
    expect(createGuardian().errors).toEqual([]);
    expect(createGuardian(null).errors).toEqual([]);
    expect(createGuardian('').errors).toEqual([]);
    expect(updateGuardian(null).errors).toEqual([]);
    expect(updateGuardian('').errors).toEqual([]);
  });
});
