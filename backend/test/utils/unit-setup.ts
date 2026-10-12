import { join } from 'node:path';
import { loadEnvFile } from '../../src/config/load-env-file';

// Chemins de ffmpeg/ffprobe éventuellement définis dans backend/.env (tests de conversion des vocaux).
loadEnvFile(join(__dirname, '..', '..'));
