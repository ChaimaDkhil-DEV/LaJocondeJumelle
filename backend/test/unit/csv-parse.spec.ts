import { CsvSyntaxError, normalizeHeader, normalizeText, parseCsv } from '../../src/common/csv-parse';

/** Lecture des CSV de tableur : Excel en français (« ; », BOM, CRLF), guillemets, lignes vides. */

describe('parseCsv', () => {
  it('lit un fichier Excel français : BOM, séparateur « ; » et fins de ligne CRLF', () => {
    const parsed = parseCsv('﻿identifiant;nom\r\namine;Amine Ben Salah\r\nsarra;Sarra Trabelsi\r\n');
    expect(parsed.delimiter).toBe(';');
    expect(parsed.headers).toEqual(['identifiant', 'nom']);
    expect(parsed.records).toEqual([
      { line: 2, cells: ['amine', 'Amine Ben Salah'] },
      { line: 3, cells: ['sarra', 'Sarra Trabelsi'] },
    ]);
  });

  it.each([
    ['virgule', 'a,b,c\n1,2,3', ','],
    ['tabulation', 'a\tb\tc\n1\t2\t3', '\t'],
    ['point-virgule', 'a;b;c\n1;2;3', ';'],
    ['une seule colonne', 'a\n1', ';'],
  ])('détecte le séparateur : %s', (_label, text, delimiter) => {
    expect(parseCsv(text).delimiter).toBe(delimiter);
  });

  it('un séparateur dans des guillemets ne compte pas pour la détection ni pour le découpage', () => {
    const parsed = parseCsv('nom;fonction\n"Ben Salah, Amine";"Directeur; adjoint"');
    expect(parsed.delimiter).toBe(';');
    expect(parsed.records[0].cells).toEqual(['Ben Salah, Amine', 'Directeur; adjoint']);
  });

  it('guillemets doublés, retour à la ligne dans une cellule, numéros de ligne du fichier', () => {
    const parsed = parseCsv('a;b\n"dit ""oui""";"ligne 1\nligne 2"\nsuite;fin');
    expect(parsed.records[0]).toEqual({ line: 2, cells: ['dit "oui"', 'ligne 1\nligne 2'] });
    // La ligne suivante est la 4e du fichier, pas la 3e enregistrement.
    expect(parsed.records[1].line).toBe(4);
  });

  it('ignore les lignes vides ou faites de séparateurs seuls, sans décaler les numéros de ligne', () => {
    const parsed = parseCsv('a;b\n\n1;2\n;;\n   \n3;4\n');
    expect(parsed.records.map((r) => [r.line, r.cells[0]])).toEqual([
      [3, '1'],
      [6, '3'],
    ]);
  });

  it('accepte un dernier enregistrement sans fin de ligne et une dernière cellule vide', () => {
    expect(parseCsv('a;b;c\n1;2;').records[0].cells).toEqual(['1', '2', '']);
  });

  it('rogne les titres et conserve le contenu des cellules (rogné plus tard par l’import)', () => {
    const parsed = parseCsv('  nom ;  fonction \n x ; y ');
    expect(parsed.headers).toEqual(['nom', 'fonction']);
    expect(parsed.records[0].cells).toEqual([' x ', ' y ']);
  });

  it('un guillemet au milieu d’une cellule non quotée est un caractère comme un autre', () => {
    expect(parseCsv('a;b\n5" écran;ok').records[0].cells).toEqual(['5" écran', 'ok']);
  });

  it('les titres peuvent commencer après des lignes vides', () => {
    const parsed = parseCsv('\n\na;b\n1;2');
    expect(parsed.headers).toEqual(['a', 'b']);
    expect(parsed.records[0].line).toBe(4);
  });

  describe('fichiers illisibles', () => {
    it.each([
      ['vide', ''],
      ['espaces seuls', '  \n \n'],
      ['séparateurs seuls', ';;;\n;;;'],
    ])('refuse : %s', (_label, text) => {
      expect(() => parseCsv(text)).toThrow(CsvSyntaxError);
    });

    it('guillemet jamais refermé : dit où il a été ouvert', () => {
      try {
        parseCsv('a;b\n1;"pas fermé\n2;3');
        throw new Error('devait échouer');
      } catch (error) {
        expect(error).toBeInstanceOf(CsvSyntaxError);
        expect((error as CsvSyntaxError).line).toBe(2);
        expect((error as CsvSyntaxError).message).toMatch(/ligne 2/);
      }
    });

    it('texte collé après un guillemet fermant', () => {
      try {
        parseCsv('a;b\n"x"y;2');
        throw new Error('devait échouer');
      } catch (error) {
        expect((error as CsvSyntaxError).line).toBe(2);
      }
    });
  });
});

describe('normalisation', () => {
  it('compare sans tenir compte des accents, de la casse ni des espaces multiples', () => {
    expect(normalizeText('  Étage   1 ')).toBe('etage 1');
    expect(normalizeText('Préparatoire')).toBe(normalizeText('PREPARATOIRE'));
  });

  it.each([
    ['Nom affiché', 'nom_affiche'],
    ['Téléphone du parent', 'telephone_du_parent'],
    ['  Identifiant ', 'identifiant'],
    ['Étage (n°)', 'etage_n'],
  ])('titre de colonne « %s » → %s', (header, key) => {
    expect(normalizeHeader(header)).toBe(key);
  });
});
