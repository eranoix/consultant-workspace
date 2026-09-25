import { expect, type Page } from '@playwright/test';

export const DEMO = { email: 'maya@lumen.example.com', password: process.env.DEMO_PASSWORD ?? 'workspace-demo' };

export async function signIn(page: Page) {
  const res = await page.request.post('/api/auth/login', { data: DEMO });
  expect(res.ok()).toBeTruthy();
}

/**
 * HTML5 drag and drop, dispatched in the page with a real DataTransfer, at a
 * given offset inside the target. More reliable across browsers than
 * emulating the mouse, and it exercises the same handlers.
 */
export async function dragAndDrop(page: Page, source: string, target: string, offsetY = 120) {
  await page.evaluate(
    ({ source, target, offsetY }) => {
      const s = document.querySelector(source);
      const d = document.querySelector(target);
      if (!s || !d) throw new Error(`drag: missing ${!s ? source : target}`);
      const dt = new DataTransfer();
      const r = d.getBoundingClientRect();
      const at = { clientX: r.left + r.width / 2, clientY: r.top + offsetY };
      s.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      d.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, ...at }));
      d.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, ...at }));
      s.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
    },
    { source, target, offsetY },
  );
}
