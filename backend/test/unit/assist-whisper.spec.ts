import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  nodeTransport,
  whisperTranscriptionProvider,
  type WhisperRequest,
  type WhisperTransport,
} from '../../src/assist/providers/whisper-transcription';

/** 010, US2 (T011) et 011 (T022) : connecteur Whisper, sur un transport simulé (aucun appel réseau). */
describe('whisperTranscriptionProvider', () => {
  let dir: string;
  let audio: string;
  let ca: string;
  const AUDIO = Buffer.from('faux contenu audio');

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'whisper-'));
    audio = join(dir, 'vocal.m4a');
    ca = join(dir, 'root.crt');
    await writeFile(audio, AUDIO);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const input = () => ({ path: audio, mimeType: 'audio/mp4', durationSeconds: 3 });
  const config = (extra: Partial<{ url: string; model: string; apiKey: string | null; caFile: string | null }> = {}) => ({
    url: 'https://whisper.ecole.fr/',
    model: 'Systran/faster-whisper-small',
    apiKey: null,
    caFile: null,
    ...extra,
  });
  const reply = (status: number, body: unknown) =>
    jest.fn<ReturnType<WhisperTransport>, [WhisperRequest]>(async () => ({ status, text: typeof body === 'string' ? body : JSON.stringify(body) }));
  const formOf = (request: WhisperRequest) => new Response(new Uint8Array(request.body), { headers: { 'content-type': request.headers['content-type']! } }).formData();

  it('envoie le vocal, le modèle et la langue française au serveur, puis renvoie le texte', async () => {
    const transport = reply(200, { text: 'La photocopieuse est en panne.' });
    const provider = whisperTranscriptionProvider(config(), transport);
    const signal = new AbortController().signal;

    expect(provider.name).toBe('whisper');
    await expect(provider.transcribe(input(), signal)).resolves.toBe('La photocopieuse est en panne.');

    expect(transport).toHaveBeenCalledTimes(1);
    const request = transport.mock.calls[0]![0];
    expect(request.url.href).toBe('https://whisper.ecole.fr/v1/audio/transcriptions');
    expect(request.signal).toBe(signal);
    // Sans clé ni certificat configurés : aucun en-tête d'autorisation, autorités système.
    expect(request.headers.authorization).toBeUndefined();
    expect(request.ca).toBeUndefined();
    expect(request.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(request.headers['content-length']).toBe(String(request.body.length));
    const form = await formOf(request);
    expect(form.get('model')).toBe('Systran/faster-whisper-small');
    expect(form.get('language')).toBe('fr');
    expect(form.get('response_format')).toBe('json');
    const file = form.get('file') as File;
    expect(file.type).toBe('audio/mp4');
    expect(Buffer.from(await file.arrayBuffer())).toEqual(AUDIO);
  });

  it('ajoute la clé en en-tête Bearer quand elle est configurée', async () => {
    const transport = reply(200, { text: 'ok' });
    await whisperTranscriptionProvider(config({ url: 'http://whisper.local:8000', apiKey: 'secret' }), transport).transcribe(
      input(),
      new AbortController().signal,
    );
    const request = transport.mock.calls[0]![0];
    expect(request.url.href).toBe('http://whisper.local:8000/v1/audio/transcriptions');
    expect(request.headers.authorization).toBe('Bearer secret');
  });

  it('lit le certificat de l’autorité interne à chaque appel (créé après le démarrage de l’API)', async () => {
    const transport = reply(200, { text: 'ok' });
    const provider = whisperTranscriptionProvider(config({ caFile: ca }), transport);
    await writeFile(ca, 'CERTIFICAT 1');
    await provider.transcribe(input(), new AbortController().signal);
    await writeFile(ca, 'CERTIFICAT 2');
    await provider.transcribe(input(), new AbortController().signal);
    expect(transport.mock.calls.map(([r]) => r.ca)).toEqual(['CERTIFICAT 1', 'CERTIFICAT 2']);
  });

  it('certificat absent : erreur sans chemin, aucun envoi', async () => {
    const transport = reply(200, { text: 'ok' });
    const error = await whisperTranscriptionProvider(config({ caFile: join(dir, 'absent.crt') }), transport)
      .transcribe(input(), new AbortController().signal)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('absent.crt');
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    ['un statut d’erreur', reply(500, { error: 'boom http://whisper.interne secret' })],
    ['un JSON invalide', reply(200, 'pas du json')],
    ['un texte absent', reply(200, { segments: [] })],
  ])('échoue sur %s, sans adresse, clé ni corps dans le message', async (_label, transport) => {
    const provider = whisperTranscriptionProvider(config({ url: 'http://whisper.interne', apiKey: 'secret' }), transport);
    const error = await provider.transcribe(input(), new AbortController().signal).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).not.toContain('whisper.interne');
    expect(message).not.toContain('secret');
    expect(message).not.toContain('boom');
  });
});

/** Transport natif de Node, contre un serveur HTTP local de test (127.0.0.1, aucun service externe). */
describe('nodeTransport', () => {
  let server: Server;
  let base: string;
  let received: { method?: string; url?: string; headers: Record<string, unknown>; body: string } | null = null;
  let delayMs = 0;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        received = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() };
        setTimeout(() => {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end('{"text":"bonjour"}');
        }, delayMs);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    received = null;
    delayMs = 0;
  });

  it('envoie la requête et renvoie le statut et le corps', async () => {
    const response = await nodeTransport({
      url: new URL(`${base}/v1/audio/transcriptions`),
      headers: { 'content-type': 'text/plain', 'content-length': '5' },
      body: Buffer.from('salut'),
      signal: new AbortController().signal,
    });
    expect(response).toEqual({ status: 201, text: '{"text":"bonjour"}' });
    expect(received).toMatchObject({ method: 'POST', url: '/v1/audio/transcriptions', body: 'salut' });
    expect(received!.headers['content-type']).toBe('text/plain');
  });

  it('s’interrompt sur annulation', async () => {
    delayMs = 2000;
    const controller = new AbortController();
    const pending = nodeTransport({ url: new URL(base), headers: {}, body: Buffer.alloc(0), signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toBeDefined();
  });
});
