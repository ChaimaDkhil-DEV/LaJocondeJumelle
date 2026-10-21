/**
 * Vidéo compilée : un écran-titre (3 s) avant chaque scénario, toutes les vidéos ramenées en
 * 1280×720 à 25 images/s (les vues mobiles sont centrées sur fond clair), puis concaténées.
 */
import type { Browser } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ffmpegInDir, TMP_DIR, VIDEOS_DIR, type Scenario } from './demo';

const NORMALIZE = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0xF4F4F5,fps=25,format=yuv420p';
const ENCODE = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-an'];

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

async function titleCard(browser: Browser, file: string, eyebrow: string, title: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(`<!doctype html><html lang="fr"><body style="margin:0;height:720px;display:flex;flex-direction:column;
    justify-content:center;align-items:center;background:#4f46e5;color:#fff;font-family:Arial,sans-serif;text-align:center">
    <div style="font-size:28px;opacity:.85;letter-spacing:.04em">${escapeHtml(eyebrow)}</div>
    <div style="font-size:52px;font-weight:bold;margin-top:18px;max-width:1100px">${escapeHtml(title)}</div>
    </body></html>`);
  await page.screenshot({ path: file });
  await page.close();
}

export async function compileAll(browser: Browser, done: Array<{ scenario: Scenario; file: string }>): Promise<string> {
  const parts: string[] = [];
  const intro = join(TMP_DIR, 'titre-00.png');
  await titleCard(browser, intro, 'La Joconde Jumelle', 'Démonstration — super administrateur');
  ffmpegInDir(['-v', 'error', '-y', '-loop', '1', '-t', '3', '-i', basename(intro), '-vf', NORMALIZE, ...ENCODE, 'part-00.mp4'], TMP_DIR);
  parts.push('part-00.mp4');

  for (const [index, { scenario, file }] of done.entries()) {
    const n = String(index + 1).padStart(2, '0');
    const card = join(TMP_DIR, `titre-${n}.png`);
    await titleCard(browser, card, scenario.id, scenario.title);
    ffmpegInDir(['-v', 'error', '-y', '-loop', '1', '-t', '3', '-i', basename(card), '-vf', NORMALIZE, ...ENCODE, `part-${n}a.mp4`], TMP_DIR);
    ffmpegInDir(['-v', 'error', '-y', '-i', file, '-vf', NORMALIZE, ...ENCODE, `part-${n}b.mp4`], TMP_DIR);
    parts.push(`part-${n}a.mp4`, `part-${n}b.mp4`);
  }

  writeFileSync(join(TMP_DIR, 'parts.txt'), parts.map((p) => `file '${p}'`).join('\n'), 'utf8');
  const output = join(VIDEOS_DIR, 'demo-superadmin-complete.mp4');
  ffmpegInDir(['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'parts.txt', '-c', 'copy', '-movflags', '+faststart', output], TMP_DIR);
  return output;
}
