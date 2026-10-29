import { loadConfig } from '../../src/config/config';
import { demoSuggest } from '../../src/assist/domain/demo-suggest';
import { suggestionProviderFor, transcriptionProviderFor, type SuggestionInput } from '../../src/assist/providers/assist-providers';

/** 011 : le fournisseur rules réutilise le moteur demoSuggest, sans réseau ni fausse transcription. */
const env = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  SESSION_SECRET: '0123456789abcdef0123456789abcdef',
  FILES_DIR: '/tmp/files',
  APP_ORIGIN: 'https://app.example.org',
  NODE_ENV: 'production',
};

const INPUT: SuggestionInput = {
  text: 'La photocopieuse du premier étage est en panne, c’est urgent.',
  categories: [{ id: 'c1', name: 'Photocopies' }],
  guidelines: [{ id: 'g1', title: 'Pannes de reprographie', body: 'Priorité : Haute.', categoryId: 'c1' }],
  similar: [],
};

describe('fournisseurs de l’assistance', () => {
  it('rules : moteur demoSuggest, nommé « rules », utilisable en production', async () => {
    const config = loadConfig({ ...env, ASSIST_SUGGESTION_PROVIDER: 'rules' });
    const provider = suggestionProviderFor(config.assist);
    expect(provider?.name).toBe('rules');
    await expect(provider!.suggest(INPUT, new AbortController().signal)).resolves.toEqual(demoSuggest(INPUT));
  });

  it('rules respecte l’annulation', async () => {
    const provider = suggestionProviderFor(loadConfig({ ...env, ASSIST_SUGGESTION_PROVIDER: 'rules' }).assist)!;
    const controller = new AbortController();
    controller.abort();
    await expect(provider.suggest(INPUT, controller.signal)).rejects.toBeDefined();
  });

  it('rules ne fournit aucune transcription', () => {
    expect(transcriptionProviderFor(loadConfig({ ...env, ASSIST_SUGGESTION_PROVIDER: 'rules' }).assist)).toBeNull();
  });
});
