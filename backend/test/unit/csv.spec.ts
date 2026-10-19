import { csvCell, toCsv } from '../../src/common/csv';

describe('Export CSV', () => {
  it('laisse vides les valeurs absentes et écrit les dates en ISO 8601', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(new Date('2026-10-20T08:30:00.000Z'))).toBe('2026-10-20T08:30:00.000Z');
  });

  it('entoure de guillemets les cellules avec séparateur, guillemet ou retour à la ligne', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('dit "oui"')).toBe('"dit ""oui"""');
    expect(csvCell('ligne\nsuivante')).toBe('"ligne\nsuivante"');
  });

  it('neutralise les formules à l’ouverture dans un tableur', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+33')).toBe("'+33");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('assemble un fichier avec BOM, séparateur « ; » et fins de ligne CRLF', () => {
    expect(toCsv(['A', 'B'], [['1', null], ['x;y', 2]])).toBe('\uFEFFA;B\r\n1;\r\n"x;y";2\r\n');
  });
});
