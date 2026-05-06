import { test, expect } from '@playwright/test';

test('boots the player shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('oszillator')).toBeVisible();
  await expect(page.locator('.brand-copy')).toHaveAttribute('href', 'https://github.com/N0zoM1z0/oszillator');
  await expect(page.locator('.brand-mark')).toHaveAttribute('src', '/brand-icon.jpg');
  await expect(page.getByTestId('drop-zone')).toBeVisible();
  await expect(page.getByTestId('starter-card')).toContainText('Try the showcase archive');
  await expect(page.locator('.starter-download')).toHaveAttribute('href', 'https://n0zom1z0.lanzn.com/isZQ33ov1gij');
  await expect(page.getByTestId('starter-card')).toContainText('1nnc');
  await expect(page.getByTestId('stage')).toBeVisible();
  await expect(page.getByTestId('debug')).toContainText('"objects": 0');
});
