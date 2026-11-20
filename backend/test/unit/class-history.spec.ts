import { appendClassHistory } from '../../src/students/class-history';

/** Écriture d'une période de classe (021) : l'heure est celle du serveur, jamais une valeur du client. */
describe('appendClassHistory', () => {
  const createdRows: Array<{ data: Record<string, unknown> }> = [];
  const tx = { studentClassHistory: { create: jest.fn(async (args: { data: Record<string, unknown> }) => { createdRows.push(args); return args.data; }) } };

  beforeEach(() => {
    createdRows.length = 0;
    jest.useFakeTimers().setSystemTime(new Date('2026-11-12T09:42:10.500Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('ajoute une ligne datée de l’heure du serveur, avec l’auteur, non reconstituée', async () => {
    await appendClassHistory(tx as never, { studentId: 's1', classId: 'c1', changedById: 'u1' });
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0].data).toEqual({
      studentId: 's1',
      classId: 'c1',
      changedById: 'u1',
      startedAt: new Date('2026-11-12T09:42:10.500Z'),
      reconstructed: false,
    });
  });

  it('exige un auteur : une ligne sans auteur est réservée à la reprise de l’existant', async () => {
    await expect(appendClassHistory(tx as never, { studentId: 's1', classId: 'c1', changedById: null as never })).rejects.toThrow(/auteur/);
    expect(createdRows).toHaveLength(0);
  });
});
