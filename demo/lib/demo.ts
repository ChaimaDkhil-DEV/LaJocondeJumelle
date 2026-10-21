/**
 * Outils d'enregistrement d'un scénario : contexte Playwright filmé (curseur visible, pauses),
 * sous-titres français horodatés sur la vidéo, puis incrustation par ffmpeg en .mp4.
 */
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';
import { devices } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { Api } from './api';
import { BASE_URL, DEMO_PASSWORD } from './config';

export const DEMO_DIR = join(__dirname, '..');
export const TMP_DIR = join(DEMO_DIR, 'tmp');
export const VIDEOS_DIR = join(DEMO_DIR, 'videos');

export const STEP_MS = 1500;
export const SHOW_MS = 2500;

export interface SeedContext {
  prisma: PrismaClient;
  as: (username: string) => Promise<Api>;
  log: (message: string) => void;
}

export interface Scenario {
  id: string;
  slug: string;
  title: string;
  /** desktop 1280×720 (défaut) ou mobile 390×844. */
  viewport?: 'desktop' | 'mobile';
  /** Données fictives propres au scénario, créées après la remise à zéro de la base. */
  prepare?: (ctx: SeedContext) => Promise<void>;
  play: (demo: Demo) => Promise<void>;
}

interface Cue {
  start: number;
  end: number;
  text: string;
}

/** Curseur rond visible à l'écran (le pointeur système n'apparaît pas dans les vidéos). */
function installCursor(): void {
  const add = () => {
    if (document.getElementById('__demo_cursor')) return;
    const cursor = document.createElement('div');
    cursor.id = '__demo_cursor';
    Object.assign(cursor.style, {
      position: 'fixed',
      left: '-40px',
      top: '-40px',
      width: '22px',
      height: '22px',
      marginLeft: '-11px',
      marginTop: '-11px',
      borderRadius: '50%',
      background: 'rgba(79, 70, 229, 0.35)',
      border: '2px solid rgba(79, 70, 229, 0.95)',
      boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.9)',
      pointerEvents: 'none',
      zIndex: '2147483647',
      transition: 'transform 120ms ease',
    });
    document.body.appendChild(cursor);
    document.addEventListener('mousemove', (e) => {
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
    }, true);
    document.addEventListener('mousedown', () => (cursor.style.transform = 'scale(0.7)'), true);
    document.addEventListener('mouseup', () => (cursor.style.transform = 'scale(1)'), true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
  else add();
}

function srtTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = Math.floor(ms % 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(r, 3)}`;
}

export class Demo {
  private readonly cues: Cue[] = [];
  private constructor(
    readonly page: Page,
    readonly context: BrowserContext,
    private readonly startedAt: number,
    readonly mobile: boolean,
  ) {}

  static async open(browser: Browser, scenario: Scenario): Promise<Demo> {
    const mobile = scenario.viewport === 'mobile';
    const size = mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 };
    const context = await browser.newContext({
      ...(mobile ? devices['iPhone 13'] : {}),
      viewport: size,
      locale: 'fr-FR',
      timezoneId: 'Europe/Paris',
      permissions: ['microphone'],
      recordVideo: { dir: join(TMP_DIR, 'raw', scenario.id), size },
    });
    // Source injectée telle quelle : tsx (esbuild) ajoute des appels à __name, absent de la page.
    await context.addInitScript({ content: `var __name = (f) => f;\n(${installCursor.toString()})();` });
    const page = await context.newPage();
    return new Demo(page, context, Date.now(), mobile);
  }

  private now(): number {
    return Date.now() - this.startedAt;
  }

  /** Nouveau sous-titre, affiché jusqu'au suivant. */
  say(text: string): void {
    const at = this.now();
    const last = this.cues.at(-1);
    if (last && last.end === -1) last.end = at;
    this.cues.push({ start: at, end: -1, text });
  }

  pause(ms = STEP_MS): Promise<void> {
    return this.page.waitForTimeout(ms);
  }

  /** Déplace le curseur visible jusqu'à l'élément, puis clique. */
  async click(target: Locator): Promise<void> {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (box) {
      await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
      await this.page.waitForTimeout(250);
    }
    await target.click();
  }

  async hover(target: Locator): Promise<void> {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (box) await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  }

  async type(target: Locator, text: string): Promise<void> {
    await this.click(target);
    await target.pressSequentially(text, { delay: 45 });
  }

  /** Choix dans une liste déroulante MUI (combobox puis option). */
  async choose(label: string | RegExp, option: string | RegExp): Promise<void> {
    await this.click(this.page.getByRole('combobox', { name: label }));
    await this.pause(700);
    await this.click(this.page.getByRole('listbox').getByRole('option', { name: option }));
    await this.pause(700);
  }

  /**
   * Choix multiples dans une liste à saisie (Autocomplete) d'une boîte de dialogue : la liste est
   * rouverte pour chaque choix (elle se ferme après une sélection), puis refermée par un clic sur le
   * titre de la boîte (Échap fermerait la boîte entière).
   */
  async pickOptions(dialog: Locator, combobox: string, options: Array<string | RegExp>): Promise<void> {
    for (const option of options) {
      await this.click(dialog.getByRole('combobox', { name: combobox }));
      await this.pause(500);
      await this.click(this.page.getByRole('option', { name: option }).first());
      await this.pause(600);
    }
    await this.click(dialog.getByRole('heading').first());
    await this.pause(500);
  }

  button(name: string | RegExp): Locator {
    return this.page.getByRole('button', { name }).filter({ visible: true }).first();
  }

  link(name: string | RegExp): Locator {
    return this.page.getByRole('link', { name }).filter({ visible: true }).first();
  }

  async login(username: string, label?: string): Promise<void> {
    if (label) this.say(label);
    await this.page.goto(`${BASE_URL}/connexion`);
    await this.pause(1000);
    await this.type(this.page.getByLabel('Identifiant'), username);
    await this.page.getByLabel('Mot de passe', { exact: true }).fill(DEMO_PASSWORD);
    await this.pause(600);
    await this.click(this.page.getByRole('button', { name: 'Se connecter' }));
    await this.page.getByRole('button', { name: 'Se connecter' }).waitFor({ state: 'hidden' });
    await this.pause();
  }

  async logout(): Promise<void> {
    await this.click(this.button('Se déconnecter'));
    await this.page.getByRole('button', { name: 'Se connecter' }).waitFor();
    await this.pause(800);
  }

  /** Menu latéral : directement en desktop, dans le tiroir en mobile. */
  async nav(label: string): Promise<void> {
    if (this.mobile) {
      await this.click(this.button('Ouvrir le menu'));
      await this.pause(600);
    }
    await this.click(this.page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: label }).filter({ visible: true }).first());
    await this.pause();
  }

  /** Onglet de l'administration. */
  async adminTab(label: string): Promise<void> {
    await this.click(this.page.getByRole('navigation', { name: 'Sections de l’espace Administrateur' }).getByRole('link', { name: label }));
    await this.pause();
  }

  /** Ferme le contexte (finalise la vidéo) et renvoie le chemin du .webm et le .srt écrit. */
  async finish(scenario: Scenario): Promise<{ webm: string; srt: string }> {
    await this.pause(1200);
    const end = this.now();
    const last = this.cues.at(-1);
    if (last && last.end === -1) last.end = end;
    const video = this.page.video();
    await this.context.close();
    mkdirSync(TMP_DIR, { recursive: true });
    const webm = join(TMP_DIR, `${scenario.id}.webm`);
    await video!.saveAs(webm);
    await video!.delete();
    const srt = join(TMP_DIR, `${scenario.id}.srt`);
    writeFileSync(
      srt,
      this.cues
        .filter((c) => c.end > c.start)
        .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
        .join('\n'),
      'utf8',
    );
    return { webm, srt };
  }
}

export function ffmpegPath(): string {
  return process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
}

function run(args: string[], cwd: string): void {
  const result = spawnSync(ffmpegPath(), args, { cwd, stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffmpeg a échoué : ${result.stderr?.split('\n').slice(-6).join('\n')}`);
}

/**
 * Incruste les sous-titres (texte blanc sur fond semi-transparent) et encode en .mp4.
 * ffmpeg est lancé dans demo/tmp avec des chemins relatifs (le filtre « subtitles » gère mal les
 * chemins Windows absolus).
 */
export function burnSubtitles(scenario: Scenario, output: string): void {
  const mobile = scenario.viewport === 'mobile';
  // En haut de l'écran : les messages de confirmation de l'application s'affichent en bas.
  // La taille est relative à la hauteur de la vidéo (844 px en mobile) : plus petite en mobile.
  const style = [
    'FontName=Arial',
    `FontSize=${mobile ? 8 : 14}`,
    'PrimaryColour=&H00FFFFFF',
    'BackColour=&H50000000',
    'BorderStyle=4',
    'Outline=0',
    'Shadow=0',
    `MarginV=${mobile ? 8 : 10}`,
    // Sous-titres SRT : libass applique la numérotation SSA historique (6 = en haut au centre).
    'Alignment=6',
  ].join(',');
  run(
    [
      '-v', 'error', '-y',
      '-i', `${scenario.id}.webm`,
      '-vf', `subtitles=${scenario.id}.srt:force_style='${style}'`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
      output,
    ],
    TMP_DIR,
  );
}

export function ffmpegInDir(args: string[], cwd: string): void {
  run(args, cwd);
}
