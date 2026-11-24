import { execFile } from 'node:child_process';
import { processVoice } from '../../src/files/voice-processing';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));

/** ffmpeg et ffprobe analysent des fichiers reçus : ils ne doivent hériter d'aucun secret de l'API. */
describe('environnement de ffmpeg et ffprobe', () => {
  const added = ['SESSION_SECRET', 'DATABASE_URL', 'ANTHROPIC_API_KEY', 'VARIABLE_INCONNUE'];
  const saved = Object.fromEntries(added.map((name) => [name, process.env[name]]));

  afterEach(() => {
    for (const name of added) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it('ne contient que le nécessaire pour les lancer', async () => {
    for (const name of added) process.env[name] = 'secret';
    const environments: NodeJS.ProcessEnv[] = [];
    (execFile as unknown as jest.Mock).mockImplementation((_file, _args, options, callback) => {
      environments.push(options.env);
      callback(new Error('arrêt du test'));
    });

    await expect(processVoice('absent', { ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe', maxSeconds: 10 })).rejects.toMatchObject({
      code: 'FILE_TYPE_NOT_ALLOWED',
    });

    expect(environments).toHaveLength(1);
    expect(environments[0]).toBeDefined();
    expect(environments[0].PATH).toBe(process.env.PATH);
    for (const name of added) expect(environments[0]).not.toHaveProperty(name);
  });
});
