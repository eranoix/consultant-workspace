// Captures the README screenshots from a running, freshly seeded instance.
//
//   node scripts/screenshots.mjs http://127.0.0.1:3000 docs/screenshots
//
// Uses the Playwright library with the system Chrome (channel "chrome"), so
// nothing extra is downloaded. Each capture waits for a selector that only
// exists once the data has loaded, never for a fixed time.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [, , base = 'http://127.0.0.1:3000', out = 'docs/screenshots'] = process.argv;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();

const login = await page.request.post(`${base}/api/auth/login`, { data: { email: 'maya@lumen.example.com', password: process.env.DEMO_PASSWORD ?? 'workspace-demo' } });
if (!login.ok()) throw new Error(`login failed: ${login.status()}`);

const shots = [
  { name: '01-dashboard', path: '/app', wait: '[data-testid="insights"]' },
  { name: '02-approvals', path: '/app/approvals', wait: '[data-testid="source-card"]' },
  { name: '03-approval-drawer', path: '/app/approvals', wait: '[data-testid="source-card"]', click: '[data-testid="source-card"]', after: '[data-testid="candidate"]' },
  { name: '04-board', path: '/app/board', wait: '[data-testid="task-card"]' },
  { name: '05-timeline', path: '/app/timeline', wait: '[data-testid="timeline-entry"]' },
  { name: '06-goals', path: '/app/goals', wait: '[data-testid="objective"]' },
  { name: '07-notes', path: '/app/notes', wait: '[data-testid="note-item"]', click: '[data-testid="note-item"]', after: '.ProseMirror' },
  { name: '08-alerts-jobs', path: '/app/alerts?tab=jobs', wait: '[data-testid="job-row"]' },
  { name: '09-alert-rules', path: '/app/alerts?tab=rules', wait: '[data-testid="rule"]' },
  { name: '10-api-tokens', path: '/app/settings/api', wait: '[data-testid="token-row"]' },
  { name: '11-integrations', path: '/app/settings/integrations', wait: '[data-testid="integration-account"]', settle: '[data-testid="probe"]' },
  { name: '12-public-booking', path: '/book/intro-call', wait: '[data-testid="slot"]' },
];

for (const s of shots) {
  await page.goto(base + s.path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(s.wait, { timeout: 30_000 });
  if (s.settle) await page.waitForFunction((sel) => document.querySelectorAll(sel).length >= 3, s.settle, { timeout: 30_000 });
  if (s.click) {
    await page.locator(s.click).first().click();
    await page.waitForSelector(s.after, { timeout: 30_000 });
  }
  // Park the pointer away from the rail, which expands on hover.
  await page.mouse.move(1439, 520);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${s.name}.png` });
  console.log(`captured ${s.name}`);
}

await browser.close();
