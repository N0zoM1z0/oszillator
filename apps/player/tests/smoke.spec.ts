import { test, expect } from '@playwright/test';

test('boots the player shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('oszillator')).toBeVisible();
  await expect(page.getByTestId('drop-zone')).toBeVisible();
  await expect(page.getByTestId('stage')).toBeVisible();
  await expect(page.getByTestId('debug')).toContainText('"objects": 0');
});
