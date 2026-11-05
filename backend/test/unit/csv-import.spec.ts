import { indexByName, mapPool, readImportFile, resolveName, splitList, type ColumnsSpec } from '../../src/common/csv-import';

/** Socle des imports CSV : colonnes attendues, listes dans une cellule, noms, parallélisme borné. */

const SPEC: ColumnsSpec<'nom' | 'ville' | 'age'> = {
  nom: { aliases: ['nom', 'nom_complet'], required: true },
  ville: { aliases: ['ville', 'commune'] },
  age: { aliases: ['age'] },
};

describe('readImportFile', () => {
  it('associe les colonnes par leur titre, sans tenir compte de la casse, des accents ni de l’ordre', () => {
    const read = readImportFile('Âge;COMMUNE;Nom Complet\n12;Tunis;Amine', SPEC, 10);
    expect(read.fileErrors).toEqual([]);
    expect(read.rows).toEqual([{ line: 2, values: { nom: 'Amine', ville: 'Tunis', age: '12' }, errors: [] }]);
  });

  it('une colonne facultative absente donne une valeur vide', () => {
    expect(readImportFile('nom\nAmine', SPEC, 10).rows[0].values).toEqual({ nom: 'Amine', ville: '', age: '' });
  });

  it('rogne les valeurs mais garde les numéros de ligne du fichier', () => {
    const read = readImportFile('nom;ville\n\n  Amine ; Tunis \n', SPEC, 10);
    expect(read.rows).toEqual([{ line: 3, values: { nom: 'Amine', ville: 'Tunis', age: '' }, errors: [] }]);
  });

  it.each([
    ['titre inconnu', 'nom;pays\nA;B', /Colonne inconnue : « pays »/],
    ['colonne obligatoire absente', 'ville\nTunis', /Colonne obligatoire absente : « nom »/],
    ['colonne en double (alias différents)', 'nom;nom_complet\nA;B', /« nom » apparaît deux fois/],
    ['aucune ligne de données', 'nom;ville\n', /aucune ligne de données/],
    ['guillemet jamais refermé', 'nom;ville\n"A;B', /Ligne 2 : .*jamais refermé/],
  ])('refuse le fichier entier : %s', (_label, csv, message) => {
    const read = readImportFile(csv, SPEC, 10);
    expect(read.rows).toEqual([]);
    expect(read.fileErrors.join(' ')).toMatch(message);
  });

  it('plus de lignes que la limite : fichier refusé, sans examiner les lignes', () => {
    const csv = ['nom', ...Array.from({ length: 4 }, (_, i) => `N${i}`)].join('\n');
    const read = readImportFile(csv, SPEC, 3);
    expect(read.rows).toEqual([]);
    expect(read.fileErrors).toEqual(['Le fichier contient 4 lignes : l’import est limité à 3 lignes à la fois. Découpez le fichier.']);
  });

  it('une colonne sans titre est tolérée vide, refusée remplie', () => {
    expect(readImportFile('nom;\nA;', SPEC, 10).fileErrors).toEqual([]);
    expect(readImportFile('nom;\nA;secret', SPEC, 10).fileErrors.join(' ')).toMatch(/colonne 2 contient des données mais n’a pas de titre/);
  });

  it('des cellules en trop sur une ligne la signalent sans refuser les autres', () => {
    const read = readImportFile('nom;ville\nA;B\nC;D;E', SPEC, 10);
    expect(read.fileErrors).toEqual([]);
    expect(read.rows[0].errors).toEqual([]);
    expect(read.rows[1].errors[0]).toMatch(/Trop de colonnes : 2 attendues/);
  });
});

describe('listes et noms', () => {
  it('une liste dans une cellule est séparée par « | », sans doublon ni vide', () => {
    expect(splitList(' A | B ||A | ')).toEqual(['A', 'B']);
    expect(splitList('')).toEqual([]);
  });

  it('résout un nom sans tenir compte de la casse ni des accents', () => {
    const index = indexByName([{ id: 1, name: 'Étage 1' }], (e) => e.name);
    const errors: string[] = [];
    expect(resolveName(index, 'ETAGE  1', 'Étage', errors)).toEqual({ id: 1, name: 'Étage 1' });
    expect(errors).toEqual([]);
  });

  it('nom inconnu ou ambigu : une erreur accordée en genre, et rien n’est renvoyé', () => {
    const index = indexByName(
      [
        { id: 1, name: 'Garde' },
        { id: 2, name: 'garde' },
      ],
      (c) => c.name,
    );
    const errors: string[] = [];
    expect(resolveName(index, 'Autre', 'Catégorie', errors, true)).toBeNull();
    expect(resolveName(index, 'GARDE', 'Catégorie', errors, true)).toBeNull();
    expect(resolveName(index, 'Autre', 'Étage', errors)).toBeNull();
    expect(errors).toEqual([
      'Catégorie inconnue : « Autre ».',
      'Catégorie ambiguë : « GARDE » correspond à plusieurs éléments.',
      'Étage inconnu : « Autre ».',
    ]);
  });
});

describe('mapPool', () => {
  it('garde l’ordre des résultats', async () => {
    const results = await mapPool([30, 5, 20, 1], 3, async (ms, i) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return i;
    });
    expect(results).toEqual([0, 1, 2, 3]);
  });

  it('ne dépasse jamais le nombre de tâches simultanées demandé (le hachage de mots de passe est coûteux en mémoire)', async () => {
    let running = 0;
    let peak = 0;
    await mapPool(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
    });
    expect(peak).toBe(4);
  });

  it('liste vide : aucun travail', async () => {
    expect(await mapPool([], 4, async () => 1)).toEqual([]);
  });

  it('une tâche qui échoue fait échouer l’ensemble', async () => {
    await expect(
      mapPool([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('échec');
        return n;
      }),
    ).rejects.toThrow('échec');
  });
});
