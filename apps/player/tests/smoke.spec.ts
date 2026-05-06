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
  await expect(page.locator('#status')).toHaveText('showcase');
  await expect(page.locator('.difficulty')).toHaveCount(2);
  await expect(page.locator('.difficulty.active')).toContainText('Endless Fear');
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').objects).toBe(206);
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').background).toBe('BG.jpg');
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').mods).toEqual(['HD']);
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').autoplay).toBe(true);
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').dynamicColours).toBe(true);

  await page.locator('.difficulty').nth(1).click();
  await expect(page.locator('.difficulty.active')).toContainText("Imouto's Extra");
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').objects).toBe(669);
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').background).toBe('sola-imoutos-extra/bg.jpg');
});
