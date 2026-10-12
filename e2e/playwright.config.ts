import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3100;
const WEB_PORT = 5174;
const baseURL = `http://localhost:${WEB_PORT}`;

const fakeMediaArgs = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: fakeMediaArgs } },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: {
            'media.navigator.streams.fake': true,
            'media.navigator.permission.disabled': true,
          },
        },
      },
    },
    // WebKit n'a pas de micro simulé : les tests d'enregistrement injectent
    // e2e/support/fake-media-recorder.ts (la lecture audio reste réelle).
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'iPhone 13', use: { ...devices['iPhone 13'] } },
    {
      name: 'Pixel 7',
      use: { ...devices['Pixel 7'], launchOptions: { args: fakeMediaArgs } },
    },
    {
      name: 'mobile-320',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 320, height: 640 },
        isMobile: true,
        hasTouch: true,
        launchOptions: { args: fakeMediaArgs },
      },
    },
  ],
  webServer: [
    {
      // Base PostgreSQL embarquée jetable + migrations + seed e2e + API.
      command: 'npm run -w backend e2e:server',
      url: `http://localhost:${API_PORT}/api/health`,
      env: { PORT: String(API_PORT), APP_ORIGIN: baseURL },
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run -w frontend dev -- --port ${WEB_PORT} --strictPort`,
      url: baseURL,
      env: { API_URL: `http://localhost:${API_PORT}` },
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
