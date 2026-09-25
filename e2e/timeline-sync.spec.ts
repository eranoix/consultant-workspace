import { expect, test } from '@playwright/test';
import { dragAndDrop, signIn } from './helpers';

// Critical flow 3: plan a task on the week, edit its duration with a live end
// preview, and sync the week to the calendar.
test('a task dragged onto the week is edited and synced to the calendar', async ({ page }) => {
  await signIn(page);
  await page.goto('/app/timeline');
  const firstDay = page.locator('[data-testid^="day-"]').first();
  await expect(firstDay).toBeVisible();
  const before = await firstDay.getByTestId('timeline-entry').count();

  const task = page.getByTestId('backlog-task').filter({ hasText: 'Renew professional liability insurance' });
  await expect(task).toBeVisible();
  await task.evaluate((el) => el.setAttribute('data-e2e-source', '1'));
  const dayId = await firstDay.getAttribute('data-testid');
  // 7:00 is the top of the grid at 0.8 px per minute: 600 px is 19:30, a free slot.
  await dragAndDrop(page, '[data-e2e-source="1"]', `[data-testid="${dayId}"]`, 600);

  const entry = firstDay.getByTestId('timeline-entry').filter({ hasText: 'Renew professional liability insurance' });
  await expect(entry).toBeVisible();
  expect(await firstDay.getByTestId('timeline-entry').count()).toBe(before + 1);

  await entry.click();
  const duration = page.getByRole('spinbutton', { name: 'Duration (min)' });
  await expect(duration).toHaveValue('');
  await duration.fill('45');
  await expect(page.getByTestId('end-preview')).toContainText('Ends at 20:15');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();

  await page.getByTestId('sync-week').click();
  await expect(page.getByText(/Synced to Harbor & Vale calendar: \d+ new/)).toBeVisible();
});
