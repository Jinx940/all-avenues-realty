import { expect, test } from '@playwright/test';

test('login screen renders core access fields', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Secure Access')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Open workspace' })).toBeVisible();
  await expect(page.getByLabel('Username')).toBeVisible();
  await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open workspace' })).toBeVisible();
});

test('invalid credentials show a helpful authentication error', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Username').fill('invalid.user');
  await page.getByPlaceholder('Enter your password').fill('invalid-password');
  await page.getByRole('button', { name: 'Open workspace' }).click();

  await expect(page.getByText('Invalid username or password.')).toBeVisible();
});
