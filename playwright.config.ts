import { defineConfig, devices } from '@playwright/test';

// Against a running app when E2E_BASE_URL is set (docker compose), otherwise
// it starts the production build itself. Either way the database must be
// freshly seeded: the flows change data (they approve a meeting, create a
// token, book a slot).
const external = process.env.E2E_BASE_URL;
const port = Number(process.env.E2E_PORT ?? 5512);

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: external ?? `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  // PW_CHANNEL=chrome uses the system Chrome instead of a downloaded browser.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, channel: process.env.PW_CHANNEL || undefined } }],
  webServer: external
    ? undefined
    : {
        command: `npx next start -p ${port}`,
        url: `http://127.0.0.1:${port}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
