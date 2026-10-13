import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { documentName, validateDocument } from '../../src/files/document-validation';

/** T058 — documents joints : type réel vérifié, liste blanche, nom d'origine nettoyé. */
describe('validateDocument', () => {
  const fixtures = join(__dirname, '..', 'fixtures');
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'ljj-doc-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('accepte un PDF et conserve le fichier tel quel', async () => {
    const path = join(workDir, 'upload');
    copyFileSync(join(fixtures, 'docs', 'sample.pdf'), path);
    await expect(validateDocument(path, { allowedTypes: ['application/pdf'] })).resolves.toEqual({
      mimeType: 'application/pdf',
    });
    expect(existsSync(path)).toBe(true);
  });

  it('refuse un exécutable renommé en .pdf', async () => {
    const path = join(workDir, 'upload');
    copyFileSync(join(fixtures, 'images', 'exe-renamed.jpg'), path);
    await expect(validateDocument(path, { allowedTypes: ['application/pdf'] })).rejects.toMatchObject({
      code: 'FILE_TYPE_NOT_ALLOWED',
    });
  });

  it('refuse un type reconnu mais absent de allowedDocumentTypes', async () => {
    const path = join(workDir, 'upload');
    copyFileSync(join(fixtures, 'docs', 'sample.pdf'), path);
    await expect(validateDocument(path, { allowedTypes: [] })).rejects.toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
  });

  it('refuse un fichier texte quelconque', async () => {
    const path = join(workDir, 'upload');
    writeFileSync(path, 'simple texte');
    await expect(validateDocument(path, { allowedTypes: ['application/pdf'] })).rejects.toMatchObject({
      code: 'FILE_TYPE_NOT_ALLOWED',
    });
  });
});

describe('documentName', () => {
  it('retire le chemin et les caractères de contrôle', () => {
    expect(documentName('C:\\Users\\prof\\Bureau\\consignes\u0007 "brevet".pdf')).toBe('consignes brevet.pdf');
    expect(documentName('../../etc/passwd.pdf')).toBe('passwd.pdf');
  });

  it('tronque à 255 caractères en conservant l’extension', () => {
    const name = documentName(`${'a'.repeat(400)}.pdf`);
    expect(name).toHaveLength(255);
    expect(name.endsWith('.pdf')).toBe(true);
  });

  it('donne un nom par défaut quand il ne reste rien', () => {
    expect(documentName('   ')).toBe('document');
  });
});
