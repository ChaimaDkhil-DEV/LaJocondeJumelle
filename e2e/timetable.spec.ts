import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { AccountName } from './support/accounts';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * Emplois du temps (020) : l'administration saisit une séance (conflit refusé et expliqué), l'enseignante la voit
 * dans « Mon emploi du temps », la liste « Enseignants attendus » donne son statut à partir du pointage QR existant
 * (« Non arrivé » après la tolérance, « En retard » une fois arrivée), un surveillant n'a pas accès. Rejouable : les
 * séances du jour laissées par un lancement précédent sont annulées d'abord, et le statut attendu suit l'état de
 * présence du jour (déjà arrivée ou non).
 */
const CLASS_NAME = '1ère année Violet';
const OTHER_CLASS = '2e année Bleu';
const TZ = 'Europe/Paris';
const PHONE = { width: 320, height: 720 };
const DESKTOP = { width: 1280, height: 800 };

interface Session {
  context: BrowserContext;
  page: Page;
}

async function open(browser: Browser, account: AccountName, viewport: { width: number; height: number }): Promise<Session> {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600, isMobile: viewport.width < 600 });
  const page = await context.newPage();
  await login(page, account);
  return { context, page };
}

async function check(page: Page, screen: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `défilement horizontal sur « ${screen} »`).toBeLessThanOrEqual(0);
  await expectNoA11yViolations(page);
}

/** Date (AAAA-MM-JJ) et heure (HH:MM) dans le fuseau de l'école, décalées de `minutes`. */
function schoolClock(minutes: number): { date: string; time: string } {
  const at = new Date(Date.now() + minutes * 60_000);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
  return { date, time };
}

const origin = (page: Page) => ({ Origin: new URL(page.url()).origin });

/** Annule les séances prévues aujourd'hui pour l'enseignante (lancements précédents). */
async function cancelToday(admin: Page, teacherId: string, date: string): Promise<void> {
  const sessions = (await (await admin.request.get(`/api/timetable/sessions?from=${date}&to=${date}&teacherId=${teacherId}`)).json()) as Array<{ id: string }>;
  for (const s of sessions) {
    await admin.request.post(`/api/timetable/sessions/${s.id}/cancel`, { headers: origin(admin), data: { reason: 'Nettoyage du test' } });
  }
}

test.describe('Emplois du temps', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Largeurs pilotées par le scénario (Chromium)');
    const now = schoolClock(0).time;
    test.skip(now < '00:30' || now > '23:00', 'La séance du test doit tenir dans la journée');
    test.setTimeout(120_000);
  });

  test('séance saisie, conflit refusé, vue de l’enseignante, statut d’après le pointage', async ({ browser }) => {
    const admin = await open(browser, 'admin', DESKTOP);
    const teacher = await open(browser, 'enseignante', PHONE);
    const supervisor = await open(browser, 'surveillant', PHONE);
    const superadmin = await open(browser, 'superadmin', DESKTOP);
    try {
      const start = schoolClock(-15);
      const end = schoolClock(25);
      await admin.page.goto('/admin/emplois-du-temps');
      const teachers = (await (await admin.page.request.get('/api/admin/teacher-classes')).json()) as Array<{ teacher: { id: string; displayName: string } }>;
      const me = teachers.find((t) => t.teacher.displayName === 'Enseignante')!.teacher;
      await cancelToday(admin.page, me.id, start.date);

      // --- Administration : séance commencée il y a 15 minutes, pour l'enseignante.
      await expect(admin.page.getByRole('heading', { name: 'Emplois du temps' })).toBeVisible();
      await admin.page.getByRole('combobox', { name: 'Enseignant' }).click();
      await admin.page.getByRole('option', { name: me.displayName }).click();
      await check(admin.page, 'Emplois du temps (administration)');
      const create = async (className: string) => {
        await admin.page.getByRole('button', { name: 'Nouvelle séance' }).click();
        const dialog = admin.page.getByRole('dialog', { name: 'Nouvelle séance' });
        await dialog.getByRole('combobox', { name: /Classe/ }).click();
        await admin.page.getByRole('option', { name: className }).click();
        await dialog.getByLabel(/^Date/).fill(start.date);
        await dialog.getByLabel(/^Début/).fill(start.time);
        await dialog.getByLabel(/^Fin/).fill(end.time);
        await dialog.getByLabel(/Matière/).fill('Mathématiques');
        await dialog.getByRole('button', { name: 'Enregistrer' }).click();
        return dialog;
      };
      const first = await create(CLASS_NAME);
      await expect(first).toBeHidden();
      await expect(admin.page.getByRole('listitem', { name: new RegExp(`Séance de ${start.time} à ${end.time}, ${CLASS_NAME}`) })).toBeVisible();

      // Même enseignante, même moment, autre classe : refusé, le conflit est expliqué.
      const second = await create(OTHER_CLASS);
      const alert = second.getByRole('alert');
      await expect(alert).toContainText('Conflit d’horaires : rien n’a été enregistré');
      await expect(alert).toContainText(`a déjà une séance en ${CLASS_NAME}`);
      await check(admin.page, 'Conflit d’horaires');
      await second.getByRole('button', { name: 'Annuler' }).click();

      // --- Enseignante : la séance figure dans son emploi du temps du jour.
      await teacher.page.goto('/');
      await teacher.page.getByRole('link', { name: /Mon emploi du temps/ }).click();
      await expect(teacher.page.getByRole('heading', { name: 'Mon emploi du temps' })).toBeVisible();
      await teacher.page.getByRole('button', { name: 'Jour', exact: true }).click();
      await expect(teacher.page.getByRole('listitem', { name: new RegExp(`Séance de ${start.time} à ${end.time}, ${CLASS_NAME}`) })).toBeVisible();
      await check(teacher.page, 'Mon emploi du temps');

      // --- Administration : « Enseignants attendus ». Sans pointage du jour, « Non arrivé » (15 min > tolérance).
      await admin.page.goto(`/gardes?onglet=attendus&enseignant=${me.id}`);
      const rows = admin.page.getByRole('list', { name: 'Séances du jour' });
      const row = rows.getByRole('listitem').filter({ hasText: `${start.time} – ${end.time} · ${CLASS_NAME}` });
      await expect(row).toHaveCount(1);
      await check(admin.page, 'Enseignants attendus');
      const status = (await row.getByText(/^(Non arrivé|Présent|En retard)$/).textContent())!;

      if (status === 'Non arrivé') {
        // L'enseignante scanne le QR de la classe (parcours existant, inchangé) : arrivée ou retour.
        const classes = (await (await superadmin.page.request.get('/api/admin/coverage/classes')).json()) as Array<{ id: string; name: string }>;
        const classId = classes.find((c) => c.name === CLASS_NAME)!.id;
        const qr = (await (await superadmin.page.request.get(`/api/admin/coverage/classes/${classId}/qr`)).json()) as { url: string };
        await teacher.page.goto(new URL(qr.url).pathname + new URL(qr.url).search);
        await expect(teacher.page.getByRole('heading', { name: CLASS_NAME })).toBeVisible();
        const arrive = teacher.page.getByRole('button', { name: 'Enregistrer mon arrivée' });
        if (await arrive.isVisible()) {
          // Pas encore arrivée : la page du QR rappelle la séance en cours.
          await expect(teacher.page.getByText(new RegExp(`Séance en cours : ${start.time} – ${end.time}, ${CLASS_NAME}`))).toBeVisible();
          await arrive.click();
        } else {
          // Partie plus tôt dans la journée (scénario 019) : le scan vaut retour.
          await teacher.page.getByRole('button', { name: /Enregistrer mon retour/ }).click();
        }
        // La liste de l'administration suit sans rechargement : « En retard », avec les minutes.
        await expect(row.getByText('En retard', { exact: true })).toBeVisible({ timeout: 20_000 });
        await expect(row).toContainText('min de retard');
      } else {
        expect(['Présent', 'En retard']).toContain(status);
      }

      // --- Un surveillant n'a ni emploi du temps ni accès à la gestion.
      await supervisor.page.goto('/emploi-du-temps');
      await expect(supervisor.page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
      const refused = await supervisor.page.request.get(`/api/timetable/sessions?from=${start.date}&to=${start.date}`);
      expect(refused.status()).toBe(404);
    } finally {
      const date = schoolClock(0).date;
      const teachers = (await (await admin.page.request.get('/api/admin/teacher-classes')).json()) as Array<{ teacher: { id: string; displayName: string } }>;
      const me = teachers.find((t) => t.teacher.displayName === 'Enseignante');
      if (me) await cancelToday(admin.page, me.teacher.id, date);
      for (const s of [admin, teacher, supervisor, superadmin]) await s.context.close();
    }
  });
});
