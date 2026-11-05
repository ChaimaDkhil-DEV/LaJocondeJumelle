import { afterEach, describe, expect, it, vi } from 'vitest';
import { csvTemplate, downloadTextFile, readCsvFile } from '../../src/features/admin/csvImport';

/** Fichiers CSV du navigateur : encodage des fichiers Excel, modèle téléchargeable, téléchargement. */

const BOM = String.fromCharCode(0xfeff);
const file = (bytes: number[] | string) => new File([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)], 'import.csv', { type: 'text/csv' });

afterEach(() => vi.restoreAllMocks());

describe('readCsvFile', () => {
  it('lit de l’UTF-8 avec ses accents', async () => {
    expect(await readCsvFile(file('prénom;nom\nÉlodie;Bœuf'))).toBe('prénom;nom\nÉlodie;Bœuf');
  });

  it('retire le BOM d’un fichier UTF-8 enregistré par Excel', async () => {
    const text = await readCsvFile(file(`${BOM}prenom;nom`));
    expect(text).toBe('prenom;nom');
  });

  it('lit un ancien fichier Excel en Windows-1252 : « é » est l’octet 0xE9, pas de caractère de remplacement', async () => {
    // « prénom;Élodie » en Windows-1252 : é = 0xE9, É = 0xC9.
    const bytes = [...'pr'].map((c) => c.charCodeAt(0)).concat([0xe9], [...'nom;'].map((c) => c.charCodeAt(0)), [0xc9], [...'lodie'].map((c) => c.charCodeAt(0)));
    const text = await readCsvFile(file(bytes));
    expect(text).toBe('prénom;Élodie');
    expect(text).not.toContain('�');
  });
});

describe('csvTemplate', () => {
  it('produit le format que le serveur attend et qu’Excel en français ouvre : BOM, « ; », CRLF', () => {
    const text = csvTemplate(['identifiant', 'nom_affiche'], [['amine', 'Amine Ben Salah']]);
    expect(text).toBe(`${BOM}identifiant;nom_affiche\r\namine;Amine Ben Salah\r\n`);
  });

  it('met entre guillemets une cellule qui contient « ; », un guillemet ou un retour à la ligne', () => {
    const text = csvTemplate(['a'], [['x;y'], ['dit "oui"'], ['ligne 1\nligne 2']]);
    expect(text).toBe(`${BOM}a\r\n"x;y"\r\n"dit ""oui"""\r\n"ligne 1\nligne 2"\r\n`);
  });
});

describe('downloadTextFile', () => {
  it('fait télécharger le texte sous le nom donné, puis libère l’adresse temporaire', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:fichier');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('mots-de-passe.csv');
      expect(this.href).toBe('blob:fichier');
    });

    downloadTextFile('mots-de-passe.csv', 'a;b');

    expect(click).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(await readCsvFile(blob)).toBe('a;b');
    // Le lien temporaire ne reste pas dans la page.
    expect(document.querySelector('a[download]')).toBeNull();
    await vi.waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:fichier'));
  });
});
