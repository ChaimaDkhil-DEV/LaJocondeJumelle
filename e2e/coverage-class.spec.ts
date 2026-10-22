import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { join } from 'node:path';
import type { AccountName } from './support/accounts';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * Affectations des surveillants (004) — trois parcours, chacun à 360, 768 et 1280 px :
 * A. demande d'un enseignant → assignation par l'admin → en cours (QR + photo) → terminée ;
 * B. classe vide déclarée → seconde déclaration en renfort → décision de l'admin → terminée ;
 * C. affectation directe → réassignation → annulation.
 * Chaque parcours termine ou annule ce qu'il ouvre : la base e2e reste rejouable.
 */
const PHOTO = join(__dirname, 'fixtures', 'images', 'preuve.png');
const VIEWPORTS = [
  { width: 360, height: 760 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];
const TZ = 'Europe/Paris';

interface Session {
  context: BrowserContext;
  page: Page;
}

async function open(
  browser: Browser,
  account: AccountName,
  viewport: { width: number; height: number },
): Promise<Session> {
  const context = await browser.newContext({
    viewport,
    hasTouch: viewport.width < 600,
    isMobile: viewport.width < 600,
  });
  const page = await context.newPage();
  await login(page, account);
  return { context, page };
}

async function check(page: Page, screen: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `défilement horizontal sur « ${screen} »`).toBeLessThanOrEqual(0);
  await expectNoA11yViolations(page);
}

/** Choisit une option d'une liste déroulante MUI. */
async function choose(page: Page, label: string | RegExp, option: string | RegExp): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

/**
 * Heure de l'école (0 à 23). `formatToParts` : le format français d'une heure seule donne « 20 h »,
 * que `Number` ne sait pas lire (NaN : la garde de fin de soirée ne s'appliquait jamais).
 */
function schoolHour(): number {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).formatToParts(
    new Date(),
  );
  return Number(parts.find((p) => p.type === 'hour')?.value);
}

const dayOf = (at: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(at);

/** Heure locale de l'école (HH:MM), décalée de `minutes`, plafonnée à 23:59. */
function schoolTime(minutes: number): string {
  const at = new Date(Date.now() + minutes * 60_000);
  if (dayOf(at) !== dayOf(new Date())) return '23:59';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

/** Lien du QR code de la classe (comme imprimé), lu avec le compte du super administrateur. */
async function qrPath(superadmin: Page, className: string): Promise<string> {
  const classes = (await (
    await superadmin.request.get('/api/admin/coverage/classes')
  ).json()) as Array<{ id: string; name: string }>;
  const classId = classes.find((c) => c.name === className)!.id;
  const qr = (await (
    await superadmin.request.get(`/api/admin/coverage/classes/${classId}/qr`)
  ).json()) as { url: string };
  const url = new URL(qr.url);
  return url.pathname + url.search;
}

/**
 * Point de départ identique pour chaque parcours, même après l'échec d'un précédent : l'admin
 * annule par l'API toute affectation encore ouverte (sa session de navigateur, sans connexion de plus).
 */
async function cancelOpenCoverages(admin: Page): Promise<void> {
  const origin = new URL(admin.url()).origin;
  const open = (await (
    await admin.request.get(
      '/api/coverage?mainStatus=PENDING&mainStatus=ASSIGNED&mainStatus=IN_PROGRESS',
    )
  ).json()) as Array<{ id: string; version: number }>;
  for (const c of open) {
    const res = await admin.request.post(`/api/coverage/${c.id}/actions`, {
      headers: { Origin: origin },
      data: { action: 'CANCEL', version: c.version, reason: 'Remise à zéro du test e2e' },
    });
    expect(res.ok(), `annulation de ${c.id}`).toBeTruthy();
  }
}

const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('status').filter({ hasText: text });

async function finish(page: Page, className: string): Promise<void> {
  await page.goto('/gardes');
  await page
    .getByRole('article')
    .filter({ hasText: className })
    .getByRole('button', { name: 'Terminer' })
    .click();
  await page
    .getByRole('dialog', { name: 'Terminer l’affectation ?' })
    .getByRole('button', { name: 'Terminer' })
    .click();
  await expect(toast(page, 'Affectation terminée.')).toBeVisible();
}

for (const viewport of VIEWPORTS) {
  test.describe(`affectations à ${viewport.width} px`, () => {
    // Playwright impose un motif de déstructuration en premier argument, même sans fixture.
    // eslint-disable-next-line no-empty-pattern
    test.beforeEach(({}, testInfo) => {
      test.skip(
        testInfo.project.name !== 'chromium',
        'Largeurs pilotées par le scénario (Chromium)',
      );
      test.skip(
        schoolHour() >= 22,
        'Créneaux du jour : parcours non rejouables en fin de soirée (heure de l’école)',
      );
      test.setTimeout(150_000);
    });

    test('A. demande d’un enseignant → assignation → en cours → terminée', async ({ browser }) => {
      const className = '1ère année Violet';
      const teacher = await open(browser, 'enseignante', viewport);
      const admin = await open(browser, 'admin', viewport);
      const supervisor = await open(browser, 'surveillant', viewport);
      const superadmin = await open(browser, 'superadmin', viewport);
      try {
        await cancelOpenCoverages(admin.page);
        // --- Enseignante : signalement pour aujourd'hui.
        await teacher.page.goto('/gardes');
        await expect(teacher.page.getByRole('tab', { name: 'Mes signalements' })).toHaveAttribute(
          'aria-selected',
          'true',
        );
        await teacher.page.getByRole('link', { name: 'Signaler un retard ou une absence' }).click();
        await expect(
          teacher.page.getByRole('heading', { name: 'Signaler un retard ou une absence' }),
        ).toBeVisible();
        await teacher.page.getByRole('radio', { name: 'Absence' }).check();
        await choose(teacher.page, /Classe/, new RegExp(className));
        await teacher.page.getByRole('radio', { name: /Aujourd’hui/ }).check();
        await teacher.page.getByLabel(/Heure de début/).fill(schoolTime(0));
        await teacher.page.getByLabel(/Heure de fin/).fill(schoolTime(60));
        await teacher.page.getByLabel(/Motif/).fill('Rendez-vous médical');
        await check(teacher.page, 'Signaler un retard ou une absence');
        await teacher.page.getByRole('button', { name: 'Envoyer le signalement' }).click();
        await expect(toast(teacher.page, 'Signalement envoyé')).toBeVisible();
        const myRequest = teacher.page
          .getByRole('list', { name: 'Mes signalements' })
          .getByRole('link', { name: new RegExp(className) })
          .first();
        await expect(myRequest).toContainText('En attente');
        await check(teacher.page, 'Mes signalements');

        // --- Admin : file « En attente », assignation d'un surveillant disponible de l'étage.
        await admin.page.goto('/gardes');
        await expect(admin.page.getByRole('tab', { name: 'En attente' })).toHaveAttribute(
          'aria-selected',
          'true',
        );
        await check(admin.page, 'File de l’admin');
        await admin.page
          .getByRole('link', { name: new RegExp(className) })
          .first()
          .click();
        await expect(admin.page.getByText('Motif : Rendez-vous médical')).toBeVisible();
        await admin.page.getByRole('button', { name: 'Assigner un surveillant' }).click();
        const assign = admin.page.getByRole('dialog', { name: 'Assigner un surveillant' });
        await assign.getByRole('radio', { name: /^Surveillant · 1er étage · Disponible/ }).check();
        await check(admin.page, 'Assigner un surveillant');
        await assign.getByRole('button', { name: 'Assigner' }).click();
        await expect(toast(admin.page, 'Surveillant assigné.')).toBeVisible();
        await expect(admin.page.getByText('Assignée', { exact: true }).first()).toBeVisible();
        const detailPath = new URL(admin.page.url()).pathname;

        // --- Enseignante : nom du surveillant affiché.
        await teacher.page.reload();
        await expect(myRequest).toContainText('Surveillant : Surveillant');

        // --- Surveillant : en route, présence par QR + photo ; jamais le motif.
        await supervisor.page.goto('/gardes');
        await expect(
          supervisor.page.getByRole('tab', { name: 'Mes affectations' }),
        ).toHaveAttribute('aria-selected', 'true');
        const guard = supervisor.page.getByRole('article').filter({ hasText: className });
        await expect(guard).toBeVisible();
        await expect(supervisor.page.getByText('Rendez-vous médical')).toHaveCount(0);
        await check(supervisor.page, 'Mes affectations');
        await guard.getByRole('button', { name: 'Je suis en route' }).click();
        await expect(guard.getByText('En route', { exact: true })).toBeVisible();
        await supervisor.page.goto(await qrPath(superadmin.page, className));
        const confirm = supervisor.page.getByRole('button', { name: 'Confirmer ma présence' });
        await expect(confirm).toBeDisabled();
        await supervisor.page.getByLabel('Prendre la photo').setInputFiles(PHOTO);
        await expect(
          supervisor.page.getByRole('img', { name: 'Photo de présence en classe' }),
        ).toBeVisible();
        await check(supervisor.page, 'Confirmer ma présence (QR)');
        await confirm.click();
        await expect(
          toast(supervisor.page, `Présence confirmée en classe ${className}`),
        ).toBeVisible();
        await expect(guard.getByText('En cours', { exact: true })).toBeVisible();

        // --- Terminer : l'enseignante est arrivée.
        await finish(supervisor.page, className);

        // --- Admin : détail terminé, preuve et historique.
        await admin.page.goto(detailPath);
        await expect(admin.page.getByText('Terminée', { exact: true }).first()).toBeVisible();
        await expect(
          admin.page.getByRole('img', { name: 'Photo de présence prise par Surveillant' }),
        ).toBeVisible();
        const history = admin.page.getByRole('list', { name: 'Historique de l’affectation' });
        await expect(history).toContainText('Affectation créée — demande d’un enseignant');
        await expect(history).toContainText('Présence confirmée (photo + QR code)');
        await check(admin.page, 'Détail de l’affectation (admin)');
      } finally {
        for (const s of [teacher, admin, supervisor, superadmin]) await s.context.close();
      }
    });

    test('B. classe vide → seconde déclaration en renfort → décision de l’admin', async ({
      browser,
    }) => {
      const className = '1ère année Violet';
      const first = await open(browser, 'surveillant', viewport);
      const second = await open(browser, 'remplacant', viewport);
      const admin = await open(browser, 'admin', viewport);
      try {
        await cancelOpenCoverages(admin.page);
        // --- Premier surveillant : déclaration en deux gestes.
        await first.page.goto('/gardes');
        await first.page.getByRole('link', { name: 'Déclarer une classe vide' }).click();
        await expect(
          first.page.getByRole('heading', { name: 'Déclarer une classe vide' }),
        ).toBeVisible();
        await first.page.getByRole('radio', { name: new RegExp(className) }).check();
        await check(first.page, 'Déclarer une classe vide');
        await first.page.getByRole('button', { name: 'Déclarer la classe vide' }).click();
        await expect(
          first.page
            .getByRole('status')
            .filter({ hasText: 'L’affectation est à votre nom, en cours' }),
        ).toBeVisible();
        await check(first.page, 'Classe vide déclarée');

        // --- Second surveillant : même classe, déjà prise en charge → renfort.
        await second.page.goto('/gardes/classe-vide');
        await second.page.getByRole('radio', { name: new RegExp(className) }).check();
        await second.page.getByRole('button', { name: 'Déclarer la classe vide' }).click();
        const outcome = second.page
          .getByRole('status')
          .filter({ hasText: 'déjà prise en charge par Surveillant' });
        await expect(outcome).toBeVisible();
        await expect(outcome).toContainText('renfort');

        // --- Admin : affectation en cours avec renfort ; décide de libérer le renfort.
        await admin.page.goto('/gardes?onglet=en-cours');
        const row = admin.page
          .getByRole('link', { name: new RegExp(className) })
          .filter({ hasText: 'Renfort : Remplaçante' })
          .first();
        await expect(row).toBeVisible();
        await check(admin.page, 'Affectations en cours');
        await row.click();
        const supports = admin.page.getByRole('list', { name: 'Renforts' });
        await expect(supports).toContainText('Remplaçante');
        await check(admin.page, 'Détail : renfort');
        await supports.getByRole('button', { name: 'Libérer Remplaçante' }).click();
        await expect(toast(admin.page, 'Remplaçante est libéré(e)')).toBeVisible();
        await expect(supports).toHaveCount(0);
        const detailPath = new URL(admin.page.url()).pathname;

        // --- Premier surveillant : termine l'affectation.
        await finish(first.page, className);

        await admin.page.goto(detailPath);
        await expect(admin.page.getByText('Terminée', { exact: true }).first()).toBeVisible();
        await expect(
          admin.page.getByRole('list', { name: 'Historique de l’affectation' }),
        ).toContainText('Renfort libéré : Remplaçante');
      } finally {
        for (const s of [first, second, admin]) await s.context.close();
      }
    });

    test('C. affectation directe → réassignation → annulation', async ({ browser }) => {
      const className = '2e année Bleu';
      const admin = await open(browser, 'admin', viewport);
      const floorSupervisor = await open(browser, 'surveillant2', viewport);
      const other = await open(browser, 'remplacant', viewport);
      try {
        await cancelOpenCoverages(admin.page);
        // --- Admin : nouvelle affectation ; surveillants du créneau, étage de la classe d'abord.
        await admin.page.goto('/gardes');
        await admin.page.getByRole('link', { name: 'Nouvelle affectation' }).click();
        await expect(
          admin.page.getByRole('heading', { name: 'Nouvelle affectation' }),
        ).toBeVisible();
        await choose(admin.page, /^Classe/, new RegExp(className));
        await admin.page.getByLabel(/Heure de début/).fill(schoolTime(30));
        await admin.page.getByLabel(/Heure de fin/).fill(schoolTime(90));
        const onFloor = admin.page.getByRole('radio', {
          name: /^Surveillant 2e étage · 2e étage · Disponible/,
        });
        await expect(onFloor).toBeVisible();
        await check(admin.page, 'Nouvelle affectation');
        await onFloor.check();
        await admin.page.getByRole('button', { name: 'Créer l’affectation' }).click();
        await expect(toast(admin.page, 'Affectation créée')).toBeVisible();
        await expect(admin.page.getByText('Assignée', { exact: true }).first()).toBeVisible();
        const detailPath = new URL(admin.page.url()).pathname;

        await floorSupervisor.page.goto('/gardes');
        await expect(
          floorSupervisor.page.getByRole('article').filter({ hasText: className }),
        ).toBeVisible();

        // --- Réassignation : statut inchangé ; l'ancien n'a plus l'affectation.
        await admin.page.getByRole('button', { name: 'Réassigner' }).click();
        const dialog = admin.page.getByRole('dialog', { name: 'Réassigner l’affectation' });
        await dialog.getByRole('radio', { name: /^Remplaçante · 1er étage · Disponible/ }).check();
        await dialog.getByRole('button', { name: 'Réassigner' }).click();
        await expect(toast(admin.page, 'Affectation réassignée.')).toBeVisible();
        await expect(admin.page.getByText('Assignée', { exact: true }).first()).toBeVisible();
        await expect(
          admin.page.getByRole('list', { name: 'Historique de l’affectation' }),
        ).toContainText('Réassignée de Surveillant 2e étage à Remplaçante');
        await check(admin.page, 'Détail après réassignation');

        await floorSupervisor.page.reload();
        await expect(
          floorSupervisor.page.getByRole('article').filter({ hasText: className }),
        ).toHaveCount(0);
        await other.page.goto('/gardes');
        await expect(other.page.getByRole('article').filter({ hasText: className })).toBeVisible();

        // --- Annulation (remet la base dans son état initial).
        await admin.page.goto(detailPath);
        await admin.page.getByRole('button', { name: 'Annuler l’affectation' }).click();
        await admin.page
          .getByRole('dialog', { name: 'Annuler l’affectation' })
          .getByRole('button', { name: 'Annuler l’affectation' })
          .click();
        await expect(toast(admin.page, 'Affectation annulée')).toBeVisible();
        await other.page.reload();
        await expect(other.page.getByRole('article').filter({ hasText: className })).toHaveCount(0);
      } finally {
        for (const s of [admin, floorSupervisor, other]) await s.context.close();
      }
    });
  });
}

/**
 * Spec 006 — modification d'une affectation par l'admin (Chromium, 1280 px) : créneau modifié et vu
 * du surveillant sans rechargement ; chevauchement refusé avec le conflit nommé.
 */
test.describe('modification d’une affectation (spec 006)', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Parcours piloté par le scénario (Chromium)');
    test.skip(schoolHour() >= 20, 'Créneaux du jour sur 3 h 30 : non rejouable en soirée (heure de l’école)');
    test.setTimeout(150_000);
  });

  async function createDirect(admin: Page, className: string, start: number, end: number): Promise<string> {
    await admin.goto('/gardes/nouvelle');
    await choose(admin, /^Classe/, new RegExp(className));
    await admin.getByLabel(/Heure de début/).fill(schoolTime(start));
    await admin.getByLabel(/Heure de fin/).fill(schoolTime(end));
    await admin.getByRole('radio', { name: /^Surveillant · 1er étage · Disponible/ }).check();
    await admin.getByRole('button', { name: 'Créer l’affectation' }).click();
    await expect(toast(admin, 'Affectation créée')).toBeVisible();
    return new URL(admin.url()).pathname;
  }

  test('créneau modifié, vu du surveillant ; conflit nommé', async ({ browser }) => {
    const viewport = { width: 1280, height: 800 };
    const admin = await open(browser, 'admin', viewport);
    const supervisor = await open(browser, 'surveillant', viewport);
    try {
      await cancelOpenCoverages(admin.page);
      const first = await createDirect(admin.page, '1ère année Violet', 30, 90);

      await supervisor.page.goto('/gardes');
      const card = supervisor.page.getByRole('article').filter({ hasText: '1ère année Violet' });
      await expect(card).toContainText('1 h');

      // Fin repoussée de 30 min : 1 h 30, vue du surveillant sans rechargement.
      await admin.page.goto(first);
      await admin.page.getByRole('button', { name: 'Modifier' }).click();
      const dialog = admin.page.getByRole('dialog', { name: 'Modifier l’affectation' });
      await dialog.getByLabel(/^Heure de fin/).fill(schoolTime(120));
      await dialog.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(toast(admin.page, 'Affectation modifiée.')).toBeVisible();
      await expect(admin.page.getByRole('list', { name: 'Historique de l’affectation' })).toContainText(
        'Affectation modifiée :',
      );
      await expect(card).toContainText('1 h 30');

      // Seconde affectation du même surveillant, déplacée sur la première : refus nommé.
      const second = await createDirect(admin.page, '2e année Bleu', 180, 210);
      await admin.page.goto(second);
      await admin.page.getByRole('button', { name: 'Modifier' }).click();
      await dialog.getByLabel(/^Heure de début/).fill(schoolTime(40));
      await dialog.getByLabel(/^Heure de fin/).fill(schoolTime(100));
      await dialog.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(dialog.getByRole('alert')).toContainText('Surveillant déjà affecté : 1ère année Violet');
      await dialog.getByRole('button', { name: 'Annuler' }).click();
    } finally {
      await cancelOpenCoverages(admin.page);
      for (const s of [admin, supervisor]) await s.context.close();
    }
  });

  test('classe changée « En route » : nouvelle classe vue, présence par son QR code', async ({ browser }) => {
    const viewport = { width: 1280, height: 800 };
    const admin = await open(browser, 'admin', viewport);
    const supervisor = await open(browser, 'surveillant', viewport);
    const superadmin = await open(browser, 'superadmin', viewport);
    try {
      await cancelOpenCoverages(admin.page);
      const path = await createDirect(admin.page, '1ère année Violet', 0, 60);

      await supervisor.page.goto('/gardes');
      const guard = supervisor.page.getByRole('article');
      await guard.filter({ hasText: '1ère année Violet' }).getByRole('button', { name: 'Je suis en route' }).click();
      await expect(guard.getByText('En route', { exact: true })).toBeVisible();

      await admin.page.goto(path);
      await admin.page.getByRole('button', { name: 'Modifier' }).click();
      const dialog = admin.page.getByRole('dialog', { name: 'Modifier l’affectation' });
      await choose(admin.page, /^Classe/, /2e année Bleu/);
      await dialog.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(toast(admin.page, 'Affectation modifiée.')).toBeVisible();

      // Sans rechargement : nouvelle classe, toujours « En route » (clarification Q3).
      await expect(guard.filter({ hasText: '2e année Bleu' })).toBeVisible();
      await expect(guard.getByText('En route', { exact: true })).toBeVisible();

      await supervisor.page.goto(await qrPath(superadmin.page, '2e année Bleu'));
      await supervisor.page.getByLabel('Prendre la photo').setInputFiles(PHOTO);
      await supervisor.page.getByRole('button', { name: 'Confirmer ma présence' }).click();
      await expect(toast(supervisor.page, 'Présence confirmée en classe 2e année Bleu')).toBeVisible();
    } finally {
      await cancelOpenCoverages(admin.page);
      for (const s of [admin, supervisor, superadmin]) await s.context.close();
    }
  });
});
