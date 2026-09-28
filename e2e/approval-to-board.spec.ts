import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('approving a meeting sends only approved tasks to the board', async ({ page }) => {
  await signIn(page);
  await page.goto('/app/approvals');
  await page.getByTestId('source-card').filter({ hasText: 'Brightwater pilot week 1 check-in' }).click();

  const drawer = page.getByRole('dialog');
  await expect(drawer.getByTestId('source-title')).toContainText('Brightwater Logistics');
  const tasks = drawer.getByTestId('candidate');
  await expect(tasks).toHaveCount(3);

  await tasks.nth(0).getByRole('button', { name: 'Approve' }).click();
  await expect(tasks.nth(0)).toHaveAttribute('data-decision', 'approved');
  await tasks.nth(1).getByRole('button', { name: 'No action' }).click();
  await expect(tasks.nth(1)).toHaveAttribute('data-decision', 'no_action');

  const done = drawer.getByRole('button', { name: 'Done' });
  await expect(done).toBeDisabled();

  await tasks.nth(1).getByRole('button', { name: 'Undo' }).click();
  await expect(tasks.nth(1)).toHaveAttribute('data-decision', 'pending');
  await tasks.nth(1).getByRole('button', { name: 'No action' }).click();
  await tasks.nth(2).getByRole('button', { name: 'Approve' }).click();
  await expect(drawer.getByTestId('classified-count')).toHaveText('3 of 3 tasks classified');

  await done.click();
  await page.getByTestId('confirm-done').click();
  await expect(page.getByText('Review finished: 2 tasks sent to the board')).toBeVisible();

  await page.goto('/app/board');
  const backlog = page.getByTestId('column-backlog');
  const card = backlog.getByTestId('task-card').filter({ hasText: 'Prepare the week 1 pilot report' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Brightwater Logistics');
  await expect(backlog.getByTestId('task-card').filter({ hasText: 'Fix the label printer on aisle 2' })).toHaveCount(0);

  await page.goto('/app/approvals?tab=reviewed');
  await expect(page.getByTestId('source-card').filter({ hasText: 'Brightwater pilot week 1 check-in' })).toContainText('Approved');
});
