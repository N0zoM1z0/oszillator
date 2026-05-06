import { expect, test, type Page } from '@playwright/test';

import { computePlayfieldTransform, playfieldToScreen } from '@oszillator/core';

type ZipEntry = {
  name: string;
  data: Uint8Array;
};

const PLAYFIELD_PADDING_OSU = 72;
const STAGE_INSET = {
  top: 28,
  right: 28,
  bottom: 18,
  left: 28
};

const textEncoder = new TextEncoder();

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const writeUInt16 = (target: Uint8Array, offset: number, value: number): void => {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
};

const writeUInt32 = (target: Uint8Array, offset: number, value: number): void => {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
};

const concatBytes = (chunks: readonly Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

const createStoredZip = (entries: readonly ZipEntry[]): Uint8Array => {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = textEncoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const localHeader = new Uint8Array(30 + name.byteLength);
    writeUInt32(localHeader, 0, 0x04034b50);
    writeUInt16(localHeader, 4, 20);
    writeUInt16(localHeader, 8, 0);
    writeUInt32(localHeader, 14, checksum);
    writeUInt32(localHeader, 18, entry.data.byteLength);
    writeUInt32(localHeader, 22, entry.data.byteLength);
    writeUInt16(localHeader, 26, name.byteLength);
    localHeader.set(name, 30);
    localChunks.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + name.byteLength);
    writeUInt32(centralHeader, 0, 0x02014b50);
    writeUInt16(centralHeader, 4, 20);
    writeUInt16(centralHeader, 6, 20);
    writeUInt16(centralHeader, 10, 0);
    writeUInt32(centralHeader, 16, checksum);
    writeUInt32(centralHeader, 20, entry.data.byteLength);
    writeUInt32(centralHeader, 24, entry.data.byteLength);
    writeUInt16(centralHeader, 28, name.byteLength);
    writeUInt32(centralHeader, 42, localOffset);
    centralHeader.set(name, 46);
    centralChunks.push(centralHeader);

    localOffset += localHeader.byteLength + entry.data.byteLength;
  }

  const centralDirectory = concatBytes(centralChunks);
  const endOfCentralDirectory = new Uint8Array(22);
  writeUInt32(endOfCentralDirectory, 0, 0x06054b50);
  writeUInt16(endOfCentralDirectory, 8, entries.length);
  writeUInt16(endOfCentralDirectory, 10, entries.length);
  writeUInt32(endOfCentralDirectory, 12, centralDirectory.byteLength);
  writeUInt32(endOfCentralDirectory, 16, localOffset);

  return concatBytes([...localChunks, centralDirectory, endOfCentralDirectory]);
};

const createSilentWav = (seconds: number): Uint8Array => {
  const sampleRate = 44_100;
  const bytesPerSample = 2;
  const sampleCount = Math.floor(sampleRate * seconds);
  const dataSize = sampleCount * bytesPerSample;
  const wav = new Uint8Array(44 + dataSize);
  const view = new DataView(wav.buffer);

  wav.set(textEncoder.encode('RIFF'), 0);
  view.setUint32(4, 36 + dataSize, true);
  wav.set(textEncoder.encode('WAVEfmt '), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  wav.set(textEncoder.encode('data'), 36);
  view.setUint32(40, dataSize, true);

  return wav;
};

const osuDifficulty = (
  version: string,
  mode: number,
  hitObjects: string,
  difficulty: { circleSize: number; overallDifficulty: number; approachRate: number } = {
    circleSize: 4,
    overallDifficulty: 6,
    approachRate: 7
  }
): string => `osu file format v14
[General]
AudioFilename: audio.wav
Mode: ${mode}
[Metadata]
Title: Synthetic E2E
Artist: Test Artist
Creator: Playwright
Version: ${version}
[Difficulty]
CircleSize: ${difficulty.circleSize}
OverallDifficulty: ${difficulty.overallDifficulty}
ApproachRate: ${difficulty.approachRate}
SliderMultiplier: 1.4
SliderTickRate: 1
[Events]
0,0,"bg.png",0,0
[TimingPoints]
0,500,4,2,0,60,1,0
[HitObjects]
${hitObjects}
`;

const syntheticOsz = (): Buffer =>
  Buffer.from(
    createStoredZip([
      { name: 'audio.wav', data: createSilentWav(8) },
      { name: 'bg.png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
      { name: 'standard.osu', data: textEncoder.encode(osuDifficulty('Standard', 0, '256,192,2000,1,0,0:0:0:0:')) },
      {
        name: 'normal.osu',
        data: textEncoder.encode(
          osuDifficulty('Normal', 0, '128,192,2200,1,0,0:0:0:0:', { circleSize: 3, overallDifficulty: 3, approachRate: 3 })
        )
      },
      { name: 'unsupported.osu', data: textEncoder.encode(osuDifficulty('Unsupported', 3, '256,192,1000,1,0,0:0:0:0:')) }
    ])
  );

const spinnerOsz = (): Buffer =>
  Buffer.from(
    createStoredZip([
      { name: 'audio.wav', data: createSilentWav(5) },
      {
        name: 'spinner.osu',
        data: textEncoder.encode(osuDifficulty('Spinner', 0, '256,192,800,12,0,2800,0:0:0:0:'))
      }
    ])
  );

const moveMouseToPlayfield = async (page: Page, x: number, y: number): Promise<void> => {
  const canvasBox = await page.locator('canvas').boundingBox();
  expect(canvasBox).not.toBeNull();
  if (!canvasBox) {
    return;
  }

  const transform = computePlayfieldTransform({
    width: canvasBox.width,
    height: canvasBox.height,
    playfieldPadding: PLAYFIELD_PADDING_OSU,
    insetTop: STAGE_INSET.top,
    insetRight: STAGE_INSET.right,
    insetBottom: STAGE_INSET.bottom,
    insetLeft: STAGE_INSET.left
  });
  const screenPosition = playfieldToScreen(transform, { x, y });
  await page.mouse.move(canvasBox.x + screenPosition.x, canvasBox.y + screenPosition.y);
};

test('imports a local osz and exercises playback controls', async ({ page }) => {
  const realErrors: string[] = [];
  page.on('pageerror', (error) => realErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      realErrors.push(message.text());
    }
  });

  await page.goto('/');
  await page.locator('#file-input').setInputFiles({
    name: 'synthetic-e2e.osz',
    mimeType: 'application/zip',
    buffer: syntheticOsz()
  });

  await expect(page.locator('#status')).toHaveText('ready');
  await expect(page.locator('.difficulty')).toHaveCount(3);
  await expect(page.locator('.difficulty:disabled')).toHaveCount(1);
  await expect(page.locator('.difficulty strong')).toHaveText(['Normal', 'Standard', 'Unsupported']);
  await expect(page.getByTestId('debug')).toContainText('"objects": 1');
  await expect(page.locator('#dynamic-colours-button')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#dynamic-colours-button')).toHaveText('Dynamic colours: off');
  await page.locator('#dynamic-colours-button').click();
  await expect(page.locator('#dynamic-colours-button')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#dynamic-colours-button')).toHaveText('Dynamic colours: on');
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').dynamicColours).toBe(true);
  await page.locator('#dynamic-colours-button').click();
  await expect(page.locator('#dynamic-colours-button')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#dynamic-colours-button')).toHaveText('Dynamic colours: off');
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').dynamicColours).toBe(false);

  await moveMouseToPlayfield(page, 256, 192);
  await page.click('#play-button');
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').audio).toBe('playing');
  await page.waitForFunction(
    () => ((window as Window & { __oszillatorDebug?: { getGameTimeMs: () => number } }).__oszillatorDebug?.getGameTimeMs() ?? 0) >= 1980,
    undefined,
    { polling: 20 }
  );
  await page.keyboard.press('z');
  await expect.poll(async () => Number(await page.locator('#score').textContent())).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  await page.click('#pause-button');
  await page.waitForTimeout(200);
  const pausedTime = await page.evaluate(() => JSON.parse(document.querySelector('#debug')?.textContent ?? '{}').gameTimeMs as number);

  await page.click('#play-button');
  await page.waitForTimeout(500);
  const resumedTime = await page.evaluate(() => JSON.parse(document.querySelector('#debug')?.textContent ?? '{}').gameTimeMs as number);
  expect(resumedTime).toBeGreaterThan(pausedTime);

  await page.click('#seek-button');
  await page.waitForTimeout(100);
  const restartedTime = await page.evaluate(() => JSON.parse(document.querySelector('#debug')?.textContent ?? '{}').gameTimeMs as number);
  expect(restartedTime).toBeLessThan(400);

  await page.locator('.difficulty:not([disabled])').first().click();
  await expect(page.getByTestId('debug')).toContainText('normal.osu');

  const downloadPromise = page.waitForEvent('download');
  await page.click('#export-button');
  await expect((await downloadPromise).suggestedFilename()).toBe('oszillator-debug-report.json');
  expect(realErrors).toEqual([]);
});

test('supports autoplay and gameplay mod toggles', async ({ page }) => {
  const realErrors: string[] = [];
  page.on('pageerror', (error) => realErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      realErrors.push(message.text());
    }
  });

  await page.goto('/');
  await page.locator('#file-input').setInputFiles({
    name: 'synthetic-e2e.osz',
    mimeType: 'application/zip',
    buffer: syntheticOsz()
  });

  await expect(page.locator('#status')).toHaveText('ready');
  await page.locator('[data-mod="HD"]').click();
  await page.locator('[data-mod="HR"]').click();
  await page.locator('[data-mod="DT"]').click();
  await expect(page.locator('[data-mod="HD"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-mod="HR"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-mod="DT"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').mods).toEqual(['HD', 'HR', 'DT']);
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').playbackRate).toBe(1.5);
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').preservePitch).toBe(true);

  await page.locator('[data-mod="NC"]').click();
  await expect(page.locator('[data-mod="DT"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-mod="NC"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').mods).toEqual(['HD', 'HR', 'NC']);
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').playbackRate).toBe(1.5);
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').preservePitch).toBe(false);

  await page.locator('[data-mod="DT"]').click();
  await expect(page.locator('[data-mod="DT"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-mod="NC"]')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').mods).toEqual(['HD', 'HR', 'DT']);
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').preservePitch).toBe(true);

  await page.locator('#autoplay-button').click();
  await expect(page.locator('#autoplay-button')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#play-button');
  await expect.poll(async () => Number(await page.locator('#score').textContent()), { timeout: 6000 }).toBeGreaterThan(0);
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').autoplay).toBe(true);

  expect(realErrors).toEqual([]);
});

test('keeps controls responsive after repeated restarts and beatmap rebuilds', async ({ page }) => {
  const realErrors: string[] = [];
  page.on('pageerror', (error) => realErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      realErrors.push(message.text());
    }
  });

  await page.goto('/');
  await page.locator('#file-input').setInputFiles({
    name: 'synthetic-e2e.osz',
    mimeType: 'application/zip',
    buffer: syntheticOsz()
  });

  await expect(page.locator('#status')).toHaveText('ready');
  await page.locator('[data-mod="HD"]').click();
  await page.locator('[data-mod="DT"]').click();
  await page.locator('.difficulty:not([disabled])').first().click();
  await expect(page.getByTestId('debug')).toContainText('normal.osu');
  await page.locator('[data-mod="NC"]').click();
  await page.locator('[data-mod="HR"]').click();
  await page.locator('.difficulty:not([disabled])').nth(1).click();
  await expect(page.getByTestId('debug')).toContainText('standard.osu');

  for (let index = 0; index < 3; index += 1) {
    await page.click('#seek-button');
    await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').gameTimeMs).toBeLessThan(400);
  }

  await page.locator('[data-mod="HD"]').click();
  await page.locator('[data-mod="HR"]').click();
  await page.locator('[data-mod="NC"]').click();
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').mods).toEqual([]);
  await moveMouseToPlayfield(page, 256, 192);
  await page.click('#play-button');
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').audio).toBe('playing');
  await page.waitForFunction(
    () => ((window as Window & { __oszillatorDebug?: { getGameTimeMs: () => number } }).__oszillatorDebug?.getGameTimeMs() ?? 0) >= 1980,
    undefined,
    { polling: 20 }
  );
  await page.keyboard.press('z');
  await expect.poll(async () => Number(await page.locator('#score').textContent())).toBeGreaterThan(0);

  expect(realErrors).toEqual([]);
});

test('renders spinner playback without browser errors', async ({ page }) => {
  const realErrors: string[] = [];
  page.on('pageerror', (error) => realErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      realErrors.push(message.text());
    }
  });

  await page.goto('/');
  await page.locator('#file-input').setInputFiles({
    name: 'synthetic-spinner.osz',
    mimeType: 'application/zip',
    buffer: spinnerOsz()
  });

  await expect(page.locator('#status')).toHaveText('ready');
  await expect(page.getByTestId('debug')).toContainText('"objects": 1');
  await page.click('#play-button');
  await page.waitForTimeout(1400);
  await expect.poll(async () => JSON.parse((await page.getByTestId('debug').textContent()) ?? '{}').audio).toBe('playing');

  expect(realErrors).toEqual([]);
});
