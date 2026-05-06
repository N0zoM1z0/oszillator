import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const localFixturePath = fileURLToPath(
  new URL('../../../osz_files/765778 Icon For Hire - Make a Move (Speed Up Ver.).osz', import.meta.url)
);

test.skip(!existsSync(localFixturePath), 'local .osz compatibility fixture is not present');

test('imports and plays the local ignored osz compatibility fixture', async ({ page }) => {
  const realErrors: string[] = [];
  page.on('pageerror', (error) => realErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      realErrors.push(message.text());
    }
  });

  await page.goto('/');
  await page.locator('#file-input').setInputFiles(localFixturePath);
  await expect(page.locator('#status')).toHaveText('ready', { timeout: 30_000 });
  await expect(page.locator('.difficulty')).toHaveCount(17);
  await expect(page.locator('.difficulty:disabled')).toHaveCount(3);
  await expect(page.getByTestId('debug')).toContainText('"objects": 194');

  await page.click('#play-button');
  await page.waitForTimeout(800);
  await page.click('#pause-button');
  const pausedTime = await page.evaluate(() => JSON.parse(document.querySelector('#debug')?.textContent ?? '{}').gameTimeMs as number);
  await page.click('#play-button');
  await page.waitForTimeout(800);
  const resumedTime = await page.evaluate(() => JSON.parse(document.querySelector('#debug')?.textContent ?? '{}').gameTimeMs as number);
  expect(resumedTime).toBeGreaterThan(pausedTime);

  await page.locator('.difficulty:not([disabled])').nth(1).click();
  await expect(page.getByTestId('debug')).toContainText('"objects": 87');

  expect(realErrors).toEqual([]);
});
