import { test, expect } from '@playwright/test';

test('boots the player shell', async ({ page }) => {
  const mediaRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/showcase\/.*\.(mp3|mp4|jpg)$/.test(request.url())) mediaRequests.push(new URL(request.url()).pathname);
  });
  await page.goto('/');

  await expect(page.getByText('oszillator')).toBeVisible();
  await expect(page.locator('.brand-copy')).toHaveAttribute('href', 'https://github.com/N0zoM1z0/oszillator');
  await expect(page.locator('.brand-mark')).toHaveAttribute('src', '/brand-icon.jpg');
  await expect(page.getByTestId('drop-zone')).toBeVisible();
  await expect(page.getByTestId('starter-card')).toContainText('Grab a showcase map');
  await expect(page.locator('.starter-download')).toHaveAttribute('href', 'https://n0zom1z0.lanzn.com/isZQ33ov1gij');
  await expect(page.getByTestId('starter-card')).toContainText('1nnc');
  await expect(page.getByTestId('stage')).toBeVisible();
  await expect(page.locator('#status')).toHaveText('showcase');
  await expect(page.locator('.difficulty')).toHaveCount(3);
  await expect(page.locator('.difficulty.active')).toContainText('Endless Fear');
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').objects).toBe(206);
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').background).toBe('BG.jpg');
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').mods).toEqual(['HD']);
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').autoplay).toBe(true);
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').dynamicColours).toBe(true);
  expect(mediaRequests.sort()).toEqual(['/showcase/BG.jpg', '/showcase/audio.mp3']);

  await page.locator('.difficulty').nth(1).click();
  await expect(page.locator('.difficulty.active')).toContainText("Imouto's Extra");
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').objects).toBe(669);
  await expect
    .poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').background)
    .toBe('sola-imoutos-extra/bg.jpg');
  await expect
    .poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').video)
    .toBe('sola-imoutos-extra/video.mp4');
  await expect(page.locator('#stage video.stage-video')).toHaveCount(1);
  await expect(page.locator('#stage img.stage-background')).toHaveCount(0);

  await page.locator('.difficulty').nth(2).click();
  await expect(page.locator('.difficulty.active')).toContainText('Time Freeze');
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').objects).toBe(1590);
  await expect
    .poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').background)
    .toBe('everything-will-freeze/bg.jpg');
  await expect(page.locator('#stage video.stage-video')).toHaveCount(0);
  await expect(page.locator('#stage img.stage-background')).toHaveCount(1);
});

test('resets showcase playback when switching maps', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#status')).toHaveText('showcase');
  await expect(page.locator('.difficulty.active')).toContainText('Endless Fear');
  await page.waitForFunction(
    () =>
      ((
        window as Window & {
          __oszillatorDebug?: { getGameTimeMs: () => number };
        }
      ).__oszillatorDebug?.getGameTimeMs() ?? 0) >= 2500,
    undefined,
    { polling: 20 }
  );

  await page.locator('.difficulty').nth(1).click();
  await expect(page.locator('.difficulty.active')).toContainText("Imouto's Extra");
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').gameTimeMs).toBeLessThan(500);
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').audio).toBe('ready');

  await page.click('#play-button');
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').audio).toBe('playing');
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').gameTimeMs).toBeLessThan(1500);

  await page.click('#pause-button');
  const video = await page.locator('video.stage-video').elementHandle();
  await video?.evaluate((element) => {
    (element as HTMLVideoElement).currentTime = 1;
  });
  await page.locator('[data-mod="HD"]').click();
  await expect(page.locator('[data-mod="HD"]')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').audio).toBe('ready');
  expect(await video?.evaluate((element) => element.isConnected)).toBe(true);
  // Some codecs seek to the first presentation timestamp (e.g. 33 ms), not exactly zero.
  expect(await video?.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeLessThan(0.1);
});
