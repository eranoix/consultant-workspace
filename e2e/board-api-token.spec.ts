import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('a contributor token creates and moves a task but cannot delete it', async ({ page, request }) => {
  await signIn(page);
  await page.goto('/app/settings/api');
  await page.getByRole('button', { name: 'New token' }).click();
  await page.getByLabel('Name').fill('E2E helper');
  await page.getByRole('radio', { name: /Contributor/ }).check();
  await page.getByTestId('create-token').click();
  const token = (await page.getByTestId('new-token').textContent())!.trim();
  expect(token).toMatch(/^cwk_[a-z0-9]{8}_[a-z0-9]{32}$/);
  await page.getByRole('button', { name: 'I have copied it' }).click();
  await expect(page.getByTestId('token-row').filter({ hasText: 'E2E helper' })).toBeVisible();

  const auth = { Authorization: `Bearer ${token}` };
  expect((await request.get('/api/v1/tasks')).status()).toBe(401);

  const clients = await (await request.get('/api/v1/clients', { headers: auth })).json();
  const orchard = clients.clients.find((c: { name: string }) => c.name === 'Orchard & Pine Foods');

  const created = await request.post('/api/v1/tasks', { headers: auth, data: { title: 'Call the scale supplier', status: 'todo', clientId: orchard.id, priority: 'high' } });
  expect(created.status()).toBe(201);
  const task = await created.json();
  expect(task.side).toBe('direct');
  expect(task.origin).toBe('api');

  const moved = await request.post(`/api/v1/tasks/${task.id}/move`, { headers: auth, data: { status: 'doing' } });
  expect(moved.status()).toBe(200);

  const del = await request.delete(`/api/v1/tasks/${task.id}`, { headers: auth });
  expect(del.status()).toBe(403);
  expect((await del.json()).error).toContain('tasks:delete');

  await page.goto('/app/board');
  await expect(page.getByTestId('column-doing').getByTestId('task-card').filter({ hasText: 'Call the scale supplier' })).toBeVisible();
});
