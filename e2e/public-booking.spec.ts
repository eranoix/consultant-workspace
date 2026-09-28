import { expect, test } from '@playwright/test';

test('a visitor books a discovery call and can cancel it', async ({ page }) => {
  await page.goto('/book');
  await page.getByTestId('service').filter({ hasText: 'Discovery call' }).click();
  await page.getByTestId('day').and(page.locator(':not([disabled])')).first().click();
  await page.getByTestId('slot').first().click();
  await page.getByLabel('Name').fill('Robin Vale');
  await page.getByLabel('Email').fill('robin@quillfield.example.com');
  await page.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.getByTestId('booking-confirmed')).toBeVisible();

  await page.getByRole('link', { name: 'Manage your booking' }).click();
  await page.getByRole('button', { name: 'Cancel this booking' }).click();
  await expect(page.getByText('Cancelled')).toBeVisible();
});
