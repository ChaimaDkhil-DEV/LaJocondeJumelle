import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { whisperTranscriptionProvider } from '../../src/assist/providers/whisper-transcription';

/** 010, US2 (T011) : connecteur Whisper auto-hébergé, sur un `fetch` simulé (aucun appel réseau). */
describe('whisperTranscriptionProvider', () => {
  let dir: string;
  let audio: string;
  const AUDIO = Buffer.from('faux contenu audio');

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'whisper-'));
    audio = join(dir, 'vocal.m4a');
    await writeFile(audio, AUDIO);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const input = () => ({ path: audio, mimeType: 'audio/mp4', durationSeconds: 3 });
  const reply = (status: number, body: unknown) =>
    jest.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

  it('envoie le vocal, le modèle et la langue française au serveur, puis renvoie le texte', async () => {
    const fetchMock = reply(200, { text: 'La photocopieuse est en panne.' });
    const provider = whisperTranscriptionProvider({ url: 'https://whisper.ecole.fr/', model: 'Systran/faster-whisper-small', apiKey: null }, fetchMock);
    const signal = new AbortController().signal;

    expect(provider.name).toBe('whisper');
    await expect(provider.transcribe(input(), signal)).resolves.toBe('La photocopieuse est en panne.');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://whisper.ecole.fr/v1/audio/transcriptions');
    expect(init.method).toBe('POST');
    expect(init.signal).toBe(signal);
    // Sans clé configurée : aucun en-tête d'autorisation.
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
    const form = init.body as FormData;
    expect(form.get('model')).toBe('Systran/faster-whisper-small');
    expect(form.get('language')).toBe('fr');
    expect(form.get('response_format')).toBe('json');
    const file = form.get('file') as File;
    expect(file.type).toBe('audio/mp4');
    expect(Buffer.from(await file.arrayBuffer())).toEqual(AUDIO);
  });

  it('ajoute la clé en en-tête Bearer quand elle est configurée', async () => {
    const fetchMock = reply(200, { text: 'ok' });
    await whisperTranscriptionProvider({ url: 'http://whisper.local:8000', model: 'm', apiKey: 'secret' }, fetchMock).transcribe(
      input(),
      new AbortController().signal,
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://whisper.local:8000/v1/audio/transcriptions');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer secret');
  });

  it.each([
    ['un statut d’erreur', reply(500, { error: 'boom http://whisper.interne secret' })],
    ['un JSON invalide', reply(200, 'pas du json')],
    ['un texte absent', reply(200, { segments: [] })],
  ])('échoue sur %s, sans adresse, clé ni corps dans le message', async (_label, fetchMock) => {
    const provider = whisperTranscriptionProvider({ url: 'http://whisper.interne', model: 'm', apiKey: 'secret' }, fetchMock);
    const error = await provider.transcribe(input(), new AbortController().signal).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).not.toContain('whisper.interne');
    expect(message).not.toContain('secret');
    expect(message).not.toContain('boom');
  });

  it('propage l’annulation', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return new Response('{}');
    }) as unknown as typeof fetch;
    await expect(
      whisperTranscriptionProvider({ url: 'http://w', model: 'm', apiKey: null }, fetchMock).transcribe(input(), controller.signal),
    ).rejects.toThrow();
  });
});
