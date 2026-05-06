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

const osuDifficulty = (version: string, mode: number, hitObjects: string): string => `osu file format v14
[General]
AudioFilename: audio.wav
Mode: ${mode}
[Metadata]
Title: Synthetic E2E
Artist: Test Artist
Creator: Playwright
Version: ${version}
[Difficulty]
CircleSize: 4
OverallDifficulty: 6
ApproachRate: 7
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
      { name: 'normal.osu', data: textEncoder.encode(osuDifficulty('Normal', 0, '128,192,2200,1,0,0:0:0:0:')) },
      { name: 'unsupported.osu', data: textEncoder.encode(osuDifficulty('Unsupported', 3, '256,192,1000,1,0,0:0:0:0:')) }
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
  await expect(page.getByTestId('debug')).toContainText('"objects": 1');

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
  expect(restartedTime).toBeLessThan(250);

  await page.locator('.difficulty:not([disabled])').nth(1).click();
  await expect(page.getByTestId('debug')).toContainText('normal.osu');

  const downloadPromise = page.waitForEvent('download');
  await page.click('#export-button');
  await expect((await downloadPromise).suggestedFilename()).toBe('oszillator-debug-report.json');
  expect(realErrors).toEqual([]);
});
