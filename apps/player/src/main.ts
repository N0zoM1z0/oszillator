import { WebAudioEngine } from '@oszillator/audio-engine';
import type { GameplayButton, GameplayInputEvent, Vec2 } from '@oszillator/core';
import {
  RulesetStdGame,
  deriveDifficulty,
  prepareBeatmap,
  type GameplayMod,
  type HitResult,
  type JudgementEvent,
  type PreparedBeatmap,
  type PreparedObject
} from '@oszillator/ruleset-std';
import { PixiPlayfieldRenderer, type CursorTrailPoint, type SmokePuff } from '@oszillator/renderer-pixi';
import type { OszArchiveManifest, BeatmapManifestEntry } from '@oszillator/osz-loader';
import { openOszillatorDb, saveBeatmapSet, saveLocalScore } from '@oszillator/storage';
import { getSliderPositionAtDistance } from '@oszillator/slider-geometry';

import { InputManager } from './input/input-manager';
import { isShowcaseBeatmap, loadShowcaseManifest } from './showcase';
import './styles.css';

type AppState = {
  manifest: OszArchiveManifest | null;
  selected: BeatmapManifestEntry | null;
  prepared: PreparedBeatmap | null;
  importStatus: string;
  errors: string[];
};

type HitHistoryEntry = {
  result: HitResult;
  offsetMs: number;
  timeMs: number;
};

declare global {
  interface Window {
    __oszillatorDebug?: {
      getGameTimeMs: () => number;
    };
  }
}

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing #app root');
}

const state: AppState = {
  manifest: null,
  selected: null,
  prepared: null,
  importStatus: 'idle',
  errors: []
};

let renderer: PixiPlayfieldRenderer | null = null;
let audioEngine: WebAudioEngine | null = null;
let game = new RulesetStdGame();
let inputManager: InputManager | null = null;
let rafId = 0;
let scoreSavedForDifficulty: string | null = null;
let loopEnabled = false;
let lastDebugRenderMs = 0;
let preparedEndTimeMs = 0;
let mediaObjectUrls: string[] = [];
let audioObjectUrl: string | null = null;
let videoElement: HTMLVideoElement | null = null;
let smokeActive = false;
let lastSmokePuffMs = -Infinity;
let autoplayEnabled = false;
let autoplayLastTimeMs = 0;
let autoplayInputId = 0;
let selectionQueue: Promise<void> = Promise.resolve();
let selectionRequestId = 0;
let lastCursorTrailMs = -Infinity;
let dynamicColoursEnabled = false;
let userImportStarted = false;
let showcasePreviewActive = false;
let showcasePreviewStartMs = 0;
let showcasePreviewStartGameMs = 0;
let showcasePreviewPausedAtMs = 0;

const hitHistory: HitHistoryEntry[] = [];
const smokePuffs: SmokePuff[] = [];
const cursorTrail: CursorTrailPoint[] = [];
const activeMods = new Set<GameplayMod>();

const PLAYFIELD_PADDING_OSU = 72;
const STAGE_INSET = {
  top: 28,
  right: 28,
  bottom: 18,
  left: 28
};
const OFFSET_RANGE_MS = 160;
const MAX_HIT_HISTORY = 56;
const SMOKE_LIFETIME_MS = 900;
const SMOKE_INTERVAL_MS = 42;
const SPINNER_AUTOPLAY_STEP_MS = 35;
const AUTOPLAY_SPINNER_RADIUS = 120;
const CURSOR_TRAIL_LIFETIME_MS = 260;
const MAX_CURSOR_TRAIL = 28;
const AUTOPLAY_AIM_MS = 520;
const WAIT_OVERLAY_THRESHOLD_MS = 2500;

root.innerHTML = `
  <main class="shell">
    <aside class="sidebar">
      <header class="brand">
        <a class="brand-link" href="https://github.com/N0zoM1z0/oszillator" target="_blank" rel="noreferrer" aria-label="Open oszillator on GitHub">
          <img class="brand-mark" src="${import.meta.env.BASE_URL}brand-icon.jpg" alt="" />
        </a>
        <a class="brand-copy" href="https://github.com/N0zoM1z0/oszillator" target="_blank" rel="noreferrer">
          <h1>oszillator</h1>
          <p>local osu!standard trainer</p>
        </a>
      </header>
      <label class="drop-zone" data-testid="drop-zone">
        <input id="file-input" type="file" accept=".osz,.zip" />
        <span>Import local .osz</span>
      </label>
      <section class="starter-card" data-testid="starter-card">
        <p class="eyebrow">No beatmap yet?</p>
        <h2>Try the showcase archive</h2>
        <p>Download the showcase .osz, then import it here from your machine. Playback still stays local in your browser.</p>
        <div class="starter-actions">
          <a class="starter-download" href="https://n0zom1z0.lanzn.com/isZQ33ov1gij" target="_blank" rel="noreferrer">Download .osz</a>
          <button id="copy-demo-password-button" class="starter-copy" type="button" data-password="1nnc">Copy password</button>
        </div>
        <p class="starter-password">Password <code>1nnc</code></p>
      </section>
      <section>
        <h2>Difficulties</h2>
        <div id="difficulty-list" class="difficulty-list"></div>
      </section>
      <section>
        <h2>Controls</h2>
        <div class="toolbar">
          <button id="play-button" type="button" disabled>Play</button>
          <button id="pause-button" type="button" disabled>Pause</button>
          <button id="seek-button" type="button" disabled>Restart</button>
          <button id="loop-button" type="button" aria-pressed="false">Loop</button>
          <button id="autoplay-button" type="button" aria-pressed="false">Autoplay</button>
          <button id="export-button" type="button">Export report</button>
        </div>
      </section>
      <section>
        <h2>Mods</h2>
        <div class="mod-grid">
          <button class="mod-toggle" type="button" data-mod="HD" aria-pressed="false">
            <strong>HD</strong><span>Hidden</span>
          </button>
          <button class="mod-toggle" type="button" data-mod="HR" aria-pressed="false">
            <strong>HR</strong><span>HardRock</span>
          </button>
          <button class="mod-toggle" type="button" data-mod="DT" aria-pressed="false">
            <strong>DT</strong><span>Double Time</span>
          </button>
          <button class="mod-toggle" type="button" data-mod="NC" aria-pressed="false">
            <strong>NC</strong><span>Nightcore</span>
          </button>
        </div>
      </section>
      <section>
        <h2>Visual</h2>
        <div class="toolbar">
          <button id="dynamic-colours-button" type="button" aria-pressed="false">Dynamic colours: off</button>
        </div>
      </section>
    </aside>
    <section class="stage-column">
      <div id="stage" class="stage" data-testid="stage">
        <div id="stage-media" class="stage-media" aria-hidden="true"></div>
        <div id="wait-overlay" class="wait-overlay" data-testid="wait-overlay" aria-hidden="true">
          <div class="wait-card">
            <span class="wait-kicker">incoming pattern</span>
            <strong id="wait-countdown">0.0s</strong>
            <div class="wait-bar" aria-hidden="true"><i id="wait-progress"></i></div>
          </div>
        </div>
      </div>
      <div class="hud">
        <div><span>Import</span><strong id="status">idle</strong></div>
        <div><span>Score</span><strong id="score">0</strong></div>
        <div><span>Acc</span><strong id="accuracy">100.00%</strong></div>
        <div><span>Combo</span><strong id="combo">0</strong></div>
        <div class="judgement-panel">
          <div class="result-strip">
            <span>300 <strong id="count-300">0</strong></span>
            <span>100 <strong id="count-100">0</strong></span>
            <span>50 <strong id="count-50">0</strong></span>
            <span>Miss <strong id="count-miss">0</strong></span>
            <span>Last <strong id="last-result">-</strong></span>
          </div>
          <div class="offset-row">
            <span>Fast</span>
            <div id="offset-chart" class="offset-chart" aria-label="Recent hit offset distribution"></div>
            <span>Slow</span>
          </div>
        </div>
      </div>
      <pre id="debug" class="debug" data-testid="debug"></pre>
    </section>
  </main>
`;

const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
const dropZone = document.querySelector<HTMLLabelElement>('.drop-zone')!;
const difficultyList = document.querySelector<HTMLDivElement>('#difficulty-list')!;
const statusElement = document.querySelector<HTMLElement>('#status')!;
const debugElement = document.querySelector<HTMLPreElement>('#debug')!;
const scoreElement = document.querySelector<HTMLElement>('#score')!;
const accuracyElement = document.querySelector<HTMLElement>('#accuracy')!;
const comboElement = document.querySelector<HTMLElement>('#combo')!;
const stageElement = document.querySelector<HTMLDivElement>('#stage')!;
const stageMediaElement = document.querySelector<HTMLDivElement>('#stage-media')!;
const waitOverlayElement = document.querySelector<HTMLDivElement>('#wait-overlay')!;
const waitCountdownElement = document.querySelector<HTMLElement>('#wait-countdown')!;
const waitProgressElement = document.querySelector<HTMLElement>('#wait-progress')!;
const count300Element = document.querySelector<HTMLElement>('#count-300')!;
const count100Element = document.querySelector<HTMLElement>('#count-100')!;
const count50Element = document.querySelector<HTMLElement>('#count-50')!;
const countMissElement = document.querySelector<HTMLElement>('#count-miss')!;
const lastResultElement = document.querySelector<HTMLElement>('#last-result')!;
const offsetChartElement = document.querySelector<HTMLDivElement>('#offset-chart')!;
const playButton = document.querySelector<HTMLButtonElement>('#play-button')!;
const pauseButton = document.querySelector<HTMLButtonElement>('#pause-button')!;
const seekButton = document.querySelector<HTMLButtonElement>('#seek-button')!;
const loopButton = document.querySelector<HTMLButtonElement>('#loop-button')!;
const autoplayButton = document.querySelector<HTMLButtonElement>('#autoplay-button')!;
const dynamicColoursButton = document.querySelector<HTMLButtonElement>('#dynamic-colours-button')!;
const copyDemoPasswordButton = document.querySelector<HTMLButtonElement>('#copy-demo-password-button')!;
const exportButton = document.querySelector<HTMLButtonElement>('#export-button')!;
const modButtons = [...document.querySelectorAll<HTMLButtonElement>('.mod-toggle')];

window.__oszillatorDebug = {
  getGameTimeMs: () => Math.round(currentGameTimeMs())
};

const showcasePreviewTimeMs = (): number => {
  if (!showcasePreviewActive) {
    return showcasePreviewPausedAtMs;
  }

  return showcasePreviewStartGameMs + performance.now() - showcasePreviewStartMs;
};

const startShowcasePreview = (timeMs = showcasePreviewPausedAtMs): void => {
  showcasePreviewActive = true;
  showcasePreviewStartMs = performance.now();
  showcasePreviewStartGameMs = Math.max(timeMs, 0);
  showcasePreviewPausedAtMs = showcasePreviewStartGameMs;
};

const stopShowcasePreview = (timeMs = showcasePreviewTimeMs()): void => {
  showcasePreviewActive = false;
  showcasePreviewPausedAtMs = Math.max(timeMs, 0);
  showcasePreviewStartGameMs = showcasePreviewPausedAtMs;
  showcasePreviewStartMs = performance.now();
};

const resetShowcasePreview = (): void => {
  showcasePreviewActive = false;
  showcasePreviewStartMs = 0;
  showcasePreviewStartGameMs = 0;
  showcasePreviewPausedAtMs = 0;
};

const currentGameTimeMs = (): number => {
  if (isShowcaseBeatmap(state.selected) && showcasePreviewActive && audioEngine?.getState() !== 'playing') {
    return showcasePreviewTimeMs();
  }

  return audioEngine?.getGameTimeMs() ?? game.getCurrentTimeMs();
};

const renderSidebar = (): void => {
  statusElement.textContent = state.importStatus;
  difficultyList.innerHTML = '';

  const beatmaps = sortedBeatmaps(state.manifest?.beatmaps ?? []);
  if (beatmaps.length === 0) {
    difficultyList.innerHTML = '<p class="empty">No beatmap loaded</p>';
  }

  for (const beatmap of beatmaps) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = beatmap === state.selected ? 'difficulty active' : 'difficulty';
    button.disabled = !beatmap.supported;
    button.innerHTML = `
      <strong>${escapeHtml(beatmap.parsed.metadata.version || beatmap.normalizedPath)}</strong>
      <span>${escapeHtml(beatmap.parsed.metadata.title)} - ${escapeHtml(beatmap.parsed.metadata.artist)}</span>
      <small>${beatmap.parsed.hitObjects.length} objects ${beatmap.supported ? '' : 'unsupported mode'}</small>
    `;
    button.addEventListener('click', () => {
      void requestSelectBeatmap(beatmap);
    });
    difficultyList.append(button);
  }

  playButton.disabled = !state.prepared;
  pauseButton.disabled = !state.prepared;
  seekButton.disabled = !state.prepared;
  autoplayButton.classList.toggle('active', autoplayEnabled);
  autoplayButton.setAttribute('aria-pressed', String(autoplayEnabled));
  dynamicColoursButton.classList.toggle('active', dynamicColoursEnabled);
  dynamicColoursButton.setAttribute('aria-pressed', String(dynamicColoursEnabled));
  dynamicColoursButton.textContent = `Dynamic colours: ${dynamicColoursEnabled ? 'on' : 'off'}`;
  for (const button of modButtons) {
    const mod = button.dataset.mod as GameplayMod | undefined;
    const active = mod ? activeMods.has(mod) : false;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
};

const sortedBeatmaps = (beatmaps: readonly BeatmapManifestEntry[]): BeatmapManifestEntry[] =>
  [...beatmaps].sort((left, right) => {
    const leftKey = musicSortKey(left);
    const rightKey = musicSortKey(right);
    return (
      leftKey.localeCompare(rightKey) ||
      difficultySortValue(left) - difficultySortValue(right) ||
      left.parsed.metadata.version.localeCompare(right.parsed.metadata.version)
    );
  });

const musicSortKey = (beatmap: BeatmapManifestEntry): string =>
  `${beatmap.parsed.metadata.artist}\u0000${beatmap.parsed.metadata.title}`.toLowerCase();

const difficultySortValue = (beatmap: BeatmapManifestEntry): number => {
  const difficulty = deriveDifficulty(beatmap.parsed.difficulty);
  return (
    difficulty.overallDifficulty * 1.7 +
    difficulty.approachRate * 1.35 +
    difficulty.circleSize * 0.9 +
    difficulty.hpDrainRate * 0.2 +
    Math.log2(Math.max(1, beatmap.parsed.hitObjects.length)) * 0.6
  );
};

const renderDebug = (force = false): void => {
  const now = performance.now();
  if (!force && now - lastDebugRenderMs < 250) {
    return;
  }

  lastDebugRenderMs = now;
  const gameState = game.getState();
  scoreElement.textContent = String(gameState.score.score);
  accuracyElement.textContent = `${(gameState.score.accuracy * 100).toFixed(2)}%`;
  comboElement.textContent = String(gameState.score.combo);
  renderJudgementHud(gameState.score.counts);
  debugElement.textContent = JSON.stringify(
    {
      archiveId: state.manifest?.archiveId ?? null,
      selected: state.selected?.normalizedPath ?? null,
      background: state.selected?.backgroundPath ?? null,
      video: state.selected?.videoPath ?? null,
      audio: audioEngine?.getState() ?? 'idle',
      autoplay: autoplayEnabled,
      mods: selectedMods(),
      dynamicColours: dynamicColoursEnabled,
      playbackRate: audioEngine?.getPlaybackRate() ?? state.prepared?.timeRate ?? 1,
      preservePitch: audioEngine?.getPreservePitch() ?? true,
      gameTimeMs: Math.round(currentGameTimeMs()),
      objects: state.prepared?.objects.length ?? 0,
      counts: gameState.score.counts,
      customSamples: state.selected?.customSamplePaths ?? [],
      warnings: [...(state.selected?.parsed.warnings ?? []), ...(state.prepared?.warnings ?? []), ...state.errors].slice(0, 12)
    },
    null,
    2
  );
};

const renderJudgementHud = (counts: Record<HitResult, number>): void => {
  count300Element.textContent = String(counts.great);
  count100Element.textContent = String(counts.ok);
  count50Element.textContent = String(counts.meh);
  countMissElement.textContent = String(counts.miss);

  const last = hitHistory.at(-1);
  lastResultElement.textContent = last ? `${labelForHitResult(last.result)} ${formatOffset(last.offsetMs)}` : '-';
  offsetChartElement.innerHTML = hitHistory
    .slice(-MAX_HIT_HISTORY)
    .map((hit) => {
      const clamped = Math.min(Math.max(hit.offsetMs, -OFFSET_RANGE_MS), OFFSET_RANGE_MS);
      const left = ((clamped + OFFSET_RANGE_MS) / (OFFSET_RANGE_MS * 2)) * 100;
      return `<i class="offset-dot ${hit.result}" style="left:${left.toFixed(2)}%"></i>`;
    })
    .join('');
};

const renderWaitOverlay = (gameTimeMs: number): void => {
  const beatmap = state.prepared;
  if (!beatmap || beatmap.objects.length === 0) {
    hideWaitOverlay();
    return;
  }

  const nextIndex = beatmap.objects.findIndex((object) => object.startTimeMs > gameTimeMs);
  const nextObject = nextIndex === -1 ? null : beatmap.objects[nextIndex]!;
  if (!nextObject) {
    hideWaitOverlay();
    return;
  }

  const previousObject = nextIndex > 0 ? beatmap.objects[nextIndex - 1] : null;
  const waitStartMs = previousObject ? Math.max(previousObject.endTimeMs, previousObject.startTimeMs) : 0;
  const totalWaitMs = nextObject.startTimeMs - waitStartMs;
  const remainingMs = nextObject.startTimeMs - gameTimeMs;
  if (remainingMs <= 0 || totalWaitMs < WAIT_OVERLAY_THRESHOLD_MS || gameTimeMs < waitStartMs) {
    hideWaitOverlay();
    return;
  }

  const progress = clamp01((gameTimeMs - waitStartMs) / Math.max(1, totalWaitMs));
  waitOverlayElement.classList.add('visible');
  waitOverlayElement.setAttribute('aria-hidden', 'false');
  waitCountdownElement.textContent = `${Math.max(0, remainingMs / 1000).toFixed(1)}s`;
  waitProgressElement.style.transform = `scaleX(${progress.toFixed(4)})`;
};

const hideWaitOverlay = (): void => {
  waitOverlayElement.classList.remove('visible');
  waitOverlayElement.setAttribute('aria-hidden', 'true');
  waitProgressElement.style.transform = 'scaleX(0)';
};

const labelForHitResult = (result: HitResult): string => {
  if (result === 'great') {
    return '300';
  }
  if (result === 'ok') {
    return '100';
  }
  if (result === 'meh') {
    return '50';
  }
  return 'Miss';
};

const formatOffset = (offsetMs: number): string => {
  const rounded = Math.round(offsetMs);
  return `${rounded > 0 ? '+' : ''}${rounded}ms`;
};

const recordJudgements = (judgements: readonly JudgementEvent[]): void => {
  for (const judgement of judgements) {
    if (typeof judgement.offsetMs !== 'number' || !Number.isFinite(judgement.offsetMs)) {
      continue;
    }

    hitHistory.push({
      result: judgement.result,
      offsetMs: judgement.offsetMs,
      timeMs: judgement.timeMs
    });
  }

  if (hitHistory.length > MAX_HIT_HISTORY) {
    hitHistory.splice(0, hitHistory.length - MAX_HIT_HISTORY);
  }
};

const selectedMods = (): GameplayMod[] => [...activeMods];

const importFile = async (file: File): Promise<void> => {
  userImportStarted = true;
  state.importStatus = 'reading';
  state.errors = [];
  autoplayEnabled = false;
  dynamicColoursEnabled = false;
  activeMods.clear();
  resetShowcasePreview();
  renderSidebar();

  const worker = new Worker(new URL('./workers/import-worker.ts', import.meta.url), { type: 'module' });
  const importId = crypto.randomUUID();
  const buffer = await file.arrayBuffer();

  worker.onmessage = (event: MessageEvent) => {
    if (event.data.importId !== importId) {
      return;
    }

    if (event.data.type === 'progress') {
      state.importStatus = event.data.phase;
      renderSidebar();
      return;
    }

    if (event.data.type === 'manifest') {
      state.manifest = event.data.manifest as OszArchiveManifest;
      state.importStatus = 'ready';
      void persistImportedLibrary(state.manifest);
      void requestSelectBeatmap(state.manifest.beatmaps.find((beatmap) => beatmap.supported) ?? null);
      worker.terminate();
      renderDebug(true);
      return;
    }

    if (event.data.type === 'error') {
      state.importStatus = 'error';
      state.errors.push(String(event.data.error));
      renderSidebar();
      renderDebug(true);
      worker.terminate();
    }
  };

  worker.postMessage({ type: 'import-osz', importId, buffer }, [buffer]);
};

const requestSelectBeatmap = (beatmap: BeatmapManifestEntry | null): Promise<void> => {
  const requestId = ++selectionRequestId;
  selectionQueue = selectionQueue
    .catch(() => undefined)
    .then(async () => {
      if (requestId !== selectionRequestId) {
        return;
      }
      await selectBeatmap(beatmap, requestId);
    });
  return selectionQueue;
};

const selectBeatmap = async (beatmap: BeatmapManifestEntry | null, requestId: number): Promise<void> => {
  if (requestId !== selectionRequestId) {
    return;
  }

  await teardownAudio();
  if (requestId !== selectionRequestId) {
    return;
  }

  teardownStageMedia();
  teardownRenderer();
  state.selected = beatmap;
  state.prepared = beatmap ? prepareBeatmap(beatmap.parsed, { mods: selectedMods() }) : null;
  if (!isShowcaseBeatmap(beatmap)) {
    resetShowcasePreview();
  }
  scoreSavedForDifficulty = null;
  preparedEndTimeMs = state.prepared?.objects.reduce((endTime, object) => Math.max(endTime, object.endTimeMs), 0) ?? 0;
  game = new RulesetStdGame();
  resetVisualState();

  if (state.prepared) {
    game.start(state.prepared);
  }

  setupStageMedia(beatmap);
  await mountRenderer();
  if (requestId !== selectionRequestId) {
    teardownRenderer();
    return;
  }

  await setupAudio();
  if (requestId !== selectionRequestId) {
    await teardownAudio();
    return;
  }

  renderSidebar();
  renderDebug(true);
};

const resetVisualState = (): void => {
  hitHistory.length = 0;
  smokePuffs.length = 0;
  cursorTrail.length = 0;
  hideWaitOverlay();
  smokeActive = false;
  lastSmokePuffMs = -Infinity;
  autoplayLastTimeMs = 0;
  lastCursorTrailMs = -Infinity;
};

const setupStageMedia = (beatmap: BeatmapManifestEntry | null): void => {
  if (!beatmap || !state.manifest) {
    return;
  }

  stageMediaElement.innerHTML = '';
  if (beatmap.videoPath) {
    const videoUrl = createObjectUrlForArchiveEntry(beatmap.videoPath);
    if (videoUrl) {
      videoElement = document.createElement('video');
      videoElement.src = videoUrl;
      videoElement.className = 'stage-video';
      videoElement.muted = true;
      videoElement.playsInline = true;
      videoElement.preload = 'auto';
      videoElement.addEventListener('error', () => {
        state.errors.push(`Video unavailable: ${beatmap.videoPath}`);
        renderDebug(true);
      });
      stageMediaElement.append(videoElement);
      return;
    }
  }

  if (beatmap.backgroundPath) {
    const backgroundUrl = createObjectUrlForArchiveEntry(beatmap.backgroundPath);
    if (backgroundUrl) {
      const backgroundElement = document.createElement('img');
      backgroundElement.src = backgroundUrl;
      backgroundElement.alt = '';
      backgroundElement.decoding = 'async';
      backgroundElement.className = 'stage-background';
      backgroundElement.addEventListener('error', () => {
        state.errors.push(`Background unavailable: ${beatmap.backgroundPath}`);
        renderDebug(true);
      });
      stageMediaElement.append(backgroundElement);
    }
  }
};

const teardownStageMedia = (): void => {
  stageMediaElement.innerHTML = '';
  videoElement = null;
  for (const url of mediaObjectUrls) {
    URL.revokeObjectURL(url);
  }
  mediaObjectUrls = [];
};

const createObjectUrlForArchiveEntry = (path: string): string | null => {
  const bytes = state.manifest?.entryBytes[path];
  if (!bytes) {
    state.errors.push(`Media file not found: ${path}`);
    return null;
  }

  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy], { type: mimeTypeForPath(path) }));
  mediaObjectUrls.push(url);
  return url;
};

const mimeTypeForPath = (path: string): string => {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') {
    return 'image/jpeg';
  }
  if (extension === 'png') {
    return 'image/png';
  }
  if (extension === 'webp') {
    return 'image/webp';
  }
  if (extension === 'bmp') {
    return 'image/bmp';
  }
  if (extension === 'mp3') {
    return 'audio/mpeg';
  }
  if (extension === 'wav') {
    return 'audio/wav';
  }
  if (extension === 'ogg') {
    return 'audio/ogg';
  }
  if (extension === 'flac') {
    return 'audio/flac';
  }
  if (extension === 'm4a') {
    return 'audio/mp4';
  }
  if (extension === 'webm') {
    return 'video/webm';
  }
  if (extension === 'ogv') {
    return 'video/ogg';
  }
  if (extension === 'avi') {
    return 'video/x-msvideo';
  }
  if (extension === 'mp4' || extension === 'm4v') {
    return 'video/mp4';
  }
  return 'application/octet-stream';
};

const persistImportedLibrary = async (manifest: OszArchiveManifest): Promise<void> => {
  const firstBeatmap = manifest.beatmaps[0];
  if (!firstBeatmap) {
    return;
  }

  try {
    const database = await openOszillatorDb();
    await saveBeatmapSet(
      database,
      {
        id: manifest.archiveId,
        title: firstBeatmap.parsed.metadata.title,
        artist: firstBeatmap.parsed.metadata.artist,
        creator: firstBeatmap.parsed.metadata.creator,
        importedAt: Date.now()
      },
      manifest.beatmaps.map((beatmap) => ({
        id: beatmap.normalizedPath,
        setId: manifest.archiveId,
        version: beatmap.parsed.metadata.version,
        objectCount: beatmap.parsed.hitObjects.length,
        audioPath: beatmap.audioPath,
        backgroundPath: beatmap.backgroundPath
      }))
    );
  } catch (error) {
    state.errors.push(`Library persistence failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const setupAudio = async (): Promise<void> => {
  await teardownAudio();

  if (!state.manifest || !state.selected?.audioPath) {
    return;
  }

  const audioBytes = state.manifest.entryBytes[state.selected.audioPath];
  if (!audioBytes) {
    state.errors.push(`Audio file not found: ${state.selected.audioPath}`);
    return;
  }

  try {
    audioEngine = new WebAudioEngine();
    const audioCopy = new Uint8Array(audioBytes.byteLength);
    audioCopy.set(audioBytes);
    audioObjectUrl = URL.createObjectURL(new Blob([audioCopy], { type: mimeTypeForPath(state.selected.audioPath) }));
    const audioElement = new Audio(audioObjectUrl);
    audioElement.preload = 'auto';
    await waitForMediaReady(audioElement);
    audioEngine.setMediaElement(audioElement);
    audioEngine.setPlaybackRate(state.prepared?.timeRate ?? 1);
    audioEngine.setPreservePitch(!activeMods.has('NC'));
  } catch (error) {
    if (audioObjectUrl) {
      URL.revokeObjectURL(audioObjectUrl);
      audioObjectUrl = null;
    }
    state.errors.push(`Audio unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const teardownAudio = async (): Promise<void> => {
  if (!audioEngine) {
    return;
  }

  const oldEngine = audioEngine;
  audioEngine = null;
  await oldEngine.destroy();
  if (audioObjectUrl) {
    URL.revokeObjectURL(audioObjectUrl);
    audioObjectUrl = null;
  }
};

const waitForMediaReady = (media: HTMLMediaElement): Promise<void> =>
  new Promise((resolve, reject) => {
    const cleanup = (): void => {
      media.removeEventListener('canplay', handleReady);
      media.removeEventListener('loadedmetadata', handleReady);
      media.removeEventListener('error', handleError);
    };
    const handleReady = (): void => {
      cleanup();
      resolve();
    };
    const handleError = (): void => {
      cleanup();
      reject(new Error(media.error?.message || 'Media element failed to load audio'));
    };

    media.addEventListener('canplay', handleReady, { once: true });
    media.addEventListener('loadedmetadata', handleReady, { once: true });
    media.addEventListener('error', handleError, { once: true });
    media.load();
  });

const mountRenderer = async (): Promise<void> => {
  if (!state.prepared) {
    return;
  }

  const nextRenderer = new PixiPlayfieldRenderer();
  await nextRenderer.mount(stageElement, stageSize());
  renderer = nextRenderer;

  inputManager = new InputManager({
    target: stageElement,
    getScreenRect: stageSize,
    getGameTimeMs: currentGameTimeMs,
    onSmokeActive: (active) => {
      smokeActive = active;
    },
    onInput: (event) => {
      if (autoplayEnabled) {
        return;
      }
      const judgements = game.handleInput(event);
      applyJudgements(judgements);
      renderDebug(true);
    }
  });

  tick();
};

const teardownRenderer = (): void => {
  cancelAnimationFrame(rafId);
  inputManager?.destroy();
  inputManager = null;
  renderer?.destroy();
  renderer = null;
  stageElement.querySelectorAll('canvas').forEach((canvas) => canvas.remove());
};

const tick = (): void => {
  if (state.prepared && renderer) {
    const time = currentGameTimeMs();
    syncStageVideo(time);
    if (autoplayEnabled) {
      updateAutoplayVisualCursor(time);
    }
    applyJudgements(autoplayEnabled ? advanceAutoplayTo(time) : []);
    const scheduledJudgements = game.updateTo(time);
    applyJudgements(scheduledJudgements);
    if (loopEnabled && state.prepared.objects.length > 0) {
      if (time > preparedEndTimeMs + 1000) {
        audioEngine?.seek(0);
        if (isShowcaseBeatmap(state.selected)) {
          startShowcasePreview(0);
        }
        game.start(state.prepared);
        scoreSavedForDifficulty = null;
        resetVisualState();
      }
    }
    if (
      isShowcaseBeatmap(state.selected) &&
      showcasePreviewActive &&
      audioEngine?.getState() !== 'playing' &&
      time > preparedEndTimeMs + 1000
    ) {
      stopShowcasePreview(preparedEndTimeMs + 1000);
    }
    void persistScoreIfComplete();
    const gameState = game.getState();
    const visualTimeMs = performance.now();
    renderWaitOverlay(time);
    updateSmokePuffs(time, gameState.cursor);
    updateCursorTrail(visualTimeMs, gameState.cursor);
    renderer.renderFrame({
      beatmap: state.prepared,
      gameTimeMs: time,
      visualTimeMs,
      gameplayState: gameState,
      settings: stageSize(),
      hidden: activeMods.has('HD'),
      dynamicColours: dynamicColoursEnabled,
      smokePuffs,
      cursorTrail
    });
    renderDebug();
  }

  rafId = requestAnimationFrame(tick);
};

const applyJudgements = (judgements: readonly JudgementEvent[]): void => {
  recordJudgements(judgements);
  if (judgements.some((judgement) => judgement.result !== 'miss')) {
    audioEngine?.playHitsound('normal');
  }
};

const persistScoreIfComplete = async (): Promise<void> => {
  if (
    !state.prepared ||
    !state.selected ||
    autoplayEnabled ||
    activeMods.size > 0 ||
    scoreSavedForDifficulty === state.selected.normalizedPath
  ) {
    return;
  }

  const judgedCount = game.getJudgedObjectCount();
  if (judgedCount !== state.prepared.objects.length || judgedCount === 0) {
    return;
  }

  try {
    const database = await openOszillatorDb();
    const gameState = game.getState();
    await saveLocalScore(database, {
      id: crypto.randomUUID(),
      difficultyId: state.selected.normalizedPath,
      playedAt: Date.now(),
      score: gameState.score.score,
      accuracy: gameState.score.accuracy,
      maxCombo: gameState.score.maxCombo,
      counts: gameState.score.counts
    });
    scoreSavedForDifficulty = state.selected.normalizedPath;
  } catch (error) {
    state.errors.push(`Score persistence failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const syncStageVideo = (gameTimeMs: number): void => {
  const video = videoElement;
  if (!video || !state.selected) {
    return;
  }

  const targetSeconds = (gameTimeMs - state.selected.parsed.events.videoOffsetMs) / 1000;
  video.playbackRate = state.prepared?.timeRate ?? 1;
  const audioState = audioEngine?.getState() ?? 'idle';
  if (targetSeconds < 0 || audioState !== 'playing') {
    if (!video.paused) {
      video.pause();
    }
    if (targetSeconds < 0 && video.currentTime !== 0) {
      video.currentTime = 0;
    }
    return;
  }

  const clampedTarget = Number.isFinite(video.duration)
    ? Math.min(Math.max(targetSeconds, 0), video.duration)
    : Math.max(targetSeconds, 0);
  if (Math.abs(video.currentTime - clampedTarget) > 0.08) {
    video.currentTime = clampedTarget;
  }

  if (video.paused) {
    video.play().catch(() => {
      // Browser or codec may reject autoplay; keep audio authoritative.
    });
  }
};

type AutoplayAction =
  | { kind: 'circle'; timeMs: number; object: Extract<PreparedObject, { kind: 'circle' }> }
  | { kind: 'slider-head'; timeMs: number; object: Extract<PreparedObject, { kind: 'slider' }> }
  | { kind: 'slider-checkpoint'; timeMs: number; position: Vec2 }
  | { kind: 'slider-tail'; timeMs: number; object: Extract<PreparedObject, { kind: 'slider' }>; position: Vec2 }
  | { kind: 'spinner-head'; timeMs: number; object: Extract<PreparedObject, { kind: 'spinner' }> }
  | { kind: 'spinner-move'; timeMs: number; position: Vec2 }
  | { kind: 'spinner-tail'; timeMs: number; object: Extract<PreparedObject, { kind: 'spinner' }> };

const actionPriority = (action: AutoplayAction): number => {
  if (action.kind === 'slider-checkpoint' || action.kind === 'spinner-move') {
    return 0;
  }
  if (action.kind === 'slider-tail' || action.kind === 'spinner-tail') {
    return 1;
  }
  return 2;
};

const advanceAutoplayTo = (gameTimeMs: number): JudgementEvent[] => {
  const beatmap = state.prepared;
  if (!beatmap) {
    return [];
  }

  if (gameTimeMs < autoplayLastTimeMs) {
    autoplayLastTimeMs = 0;
  }

  const fromMs = autoplayLastTimeMs;
  autoplayLastTimeMs = gameTimeMs;
  if (gameTimeMs <= fromMs) {
    return [];
  }

  const actions = collectAutoplayActions(beatmap.objects, fromMs, gameTimeMs);
  actions.sort((left, right) => left.timeMs - right.timeMs || actionPriority(left) - actionPriority(right));

  const events: JudgementEvent[] = [];
  for (const action of actions) {
    events.push(...runAutoplayAction(action));
  }

  return events;
};

const collectAutoplayActions = (objects: readonly PreparedObject[], fromMs: number, toMs: number): AutoplayAction[] => {
  const actions: AutoplayAction[] = [];
  const renderStates = game.getState().objects;

  for (let index = 0; index < objects.length; index += 1) {
    const object = objects[index]!;
    if (object.startTimeMs > toMs) {
      break;
    }
    if (object.endTimeMs < fromMs) {
      continue;
    }
    if (renderStates[index]?.status === 'judged') {
      continue;
    }

    if (object.kind === 'circle') {
      if (isInAutoplayWindow(object.startTimeMs, fromMs, toMs)) {
        actions.push({ kind: 'circle', timeMs: object.startTimeMs, object });
      }
      continue;
    }

    if (object.kind === 'slider') {
      if (isInAutoplayWindow(object.startTimeMs, fromMs, toMs)) {
        actions.push({ kind: 'slider-head', timeMs: object.startTimeMs, object });
      }
      for (const checkpoint of object.checkpoints) {
        if (isInAutoplayWindow(checkpoint.time, fromMs, toMs)) {
          actions.push({ kind: 'slider-checkpoint', timeMs: checkpoint.time, position: checkpoint.position });
        }
      }
      if (isInAutoplayWindow(object.endTimeMs, fromMs, toMs)) {
        actions.push({ kind: 'slider-tail', timeMs: object.endTimeMs, object, position: sliderPositionAt(object, object.endTimeMs) });
      }
      continue;
    }

    if (isInAutoplayWindow(object.startTimeMs, fromMs, toMs)) {
      actions.push({ kind: 'spinner-head', timeMs: object.startTimeMs, object });
    }

    const firstMove = Math.max(object.startTimeMs, Math.floor(fromMs / SPINNER_AUTOPLAY_STEP_MS) * SPINNER_AUTOPLAY_STEP_MS);
    for (let timeMs = firstMove; timeMs <= Math.min(object.endTimeMs, toMs); timeMs += SPINNER_AUTOPLAY_STEP_MS) {
      if (timeMs > fromMs && timeMs >= object.startTimeMs) {
        actions.push({ kind: 'spinner-move', timeMs, position: spinnerAutoplayPosition(timeMs) });
      }
    }

    if (isInAutoplayWindow(object.endTimeMs, fromMs, toMs)) {
      actions.push({ kind: 'spinner-tail', timeMs: object.endTimeMs, object });
    }
  }

  return actions;
};

const isInAutoplayWindow = (timeMs: number, fromMs: number, toMs: number): boolean => timeMs > fromMs && timeMs <= toMs;

const runAutoplayAction = (action: AutoplayAction): JudgementEvent[] => {
  if (action.kind === 'circle') {
    emitAutoplayInput('move', action.timeMs, action.object.position);
    const events = emitAutoplayInput('press', action.timeMs, action.object.position, nextAutoplayKey());
    emitAutoplayInput('release', action.timeMs, action.object.position, 'K1');
    emitAutoplayInput('release', action.timeMs, action.object.position, 'K2');
    return events;
  }

  if (action.kind === 'slider-head') {
    emitAutoplayInput('move', action.timeMs, action.object.position);
    return emitAutoplayInput('press', action.timeMs, action.object.position, nextAutoplayKey());
  }

  if (action.kind === 'slider-checkpoint') {
    emitAutoplayInput('move', action.timeMs, action.position);
    return game.updateTo(action.timeMs);
  }

  if (action.kind === 'slider-tail') {
    emitAutoplayInput('move', action.timeMs, action.position);
    const events = game.updateTo(action.timeMs);
    emitAutoplayInput('release', action.timeMs, action.position, 'K1');
    emitAutoplayInput('release', action.timeMs, action.position, 'K2');
    return events;
  }

  if (action.kind === 'spinner-head') {
    return emitAutoplayInput('press', action.timeMs, spinnerAutoplayPosition(action.timeMs), nextAutoplayKey());
  }

  if (action.kind === 'spinner-move') {
    const events = game.updateTo(action.timeMs);
    emitAutoplayInput('move', action.timeMs, action.position);
    return events;
  }

  const events = game.updateTo(action.timeMs);
  emitAutoplayInput('release', action.timeMs, spinnerAutoplayPosition(action.timeMs), 'K1');
  emitAutoplayInput('release', action.timeMs, spinnerAutoplayPosition(action.timeMs), 'K2');
  return events;
};

const updateAutoplayVisualCursor = (gameTimeMs: number): void => {
  const beatmap = state.prepared;
  if (!beatmap) {
    return;
  }

  const position = autoplayCursorPositionAt(beatmap.objects, gameTimeMs);
  if (!position) {
    return;
  }

  emitAutoplayInput('move', gameTimeMs, position);
};

const autoplayCursorPositionAt = (objects: readonly PreparedObject[], gameTimeMs: number): Vec2 | null => {
  let previousPosition: Vec2 = { x: 256, y: 192 };
  let previousTimeMs = Math.max(0, gameTimeMs - AUTOPLAY_AIM_MS);

  for (const object of objects) {
    if (gameTimeMs >= object.startTimeMs && gameTimeMs <= object.endTimeMs) {
      return objectPositionAt(object, gameTimeMs);
    }

    if (object.startTimeMs > gameTimeMs) {
      const aimStartMs = Math.max(previousTimeMs, object.startTimeMs - AUTOPLAY_AIM_MS);
      const progress = easeInOut(clamp01((gameTimeMs - aimStartMs) / Math.max(1, object.startTimeMs - aimStartMs)));
      return lerpVec2(previousPosition, objectPositionAt(object, object.startTimeMs), progress);
    }

    previousPosition = objectPositionAt(object, object.endTimeMs);
    previousTimeMs = object.endTimeMs;
  }

  return previousPosition;
};

const objectPositionAt = (object: PreparedObject, gameTimeMs: number): Vec2 => {
  if (object.kind === 'slider') {
    return sliderPositionAt(object, gameTimeMs);
  }
  if (object.kind === 'spinner') {
    return spinnerAutoplayPosition(gameTimeMs);
  }
  return object.position;
};

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

const easeInOut = (value: number): number => (value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2);

const lerpVec2 = (from: Vec2, to: Vec2, progress: number): Vec2 => ({
  x: from.x + (to.x - from.x) * progress,
  y: from.y + (to.y - from.y) * progress
});

const emitAutoplayInput = (
  kind: GameplayInputEvent['kind'],
  gameTimestampMs: number,
  playfieldPosition: Vec2,
  key?: GameplayButton
): JudgementEvent[] => {
  const event: GameplayInputEvent = {
    id: `autoplay-${autoplayInputId++}`,
    kind,
    source: 'keyboard',
    playfieldPosition,
    browserTimestampMs: performance.now(),
    gameTimestampMs
  };
  if (key) {
    event.key = key;
  }
  return game.handleInput(event);
};

const nextAutoplayKey = (): GameplayButton => (autoplayInputId % 2 === 0 ? 'K1' : 'K2');

const sliderPositionAt = (object: Extract<PreparedObject, { kind: 'slider' }>, gameTimeMs: number): Vec2 => {
  const elapsed = Math.min(Math.max(gameTimeMs - object.startTimeMs, 0), object.endTimeMs - object.startTimeMs);
  const spanIndex = Math.min(object.repeatCount - 1, Math.floor(elapsed / object.spanDurationMs));
  const spanProgress = Math.min(Math.max((elapsed - spanIndex * object.spanDurationMs) / Math.max(1, object.spanDurationMs), 0), 1);
  const distance = spanIndex % 2 === 1 ? object.pixelLength * (1 - spanProgress) : object.pixelLength * spanProgress;
  return getSliderPositionAtDistance(object.path, distance);
};

const spinnerAutoplayPosition = (gameTimeMs: number): Vec2 => {
  const angle = (gameTimeMs / 1000) * Math.PI * 12;
  return {
    x: 256 + Math.cos(angle) * AUTOPLAY_SPINNER_RADIUS,
    y: 192 + Math.sin(angle) * AUTOPLAY_SPINNER_RADIUS
  };
};

const updateSmokePuffs = (gameTimeMs: number, cursor: { x: number; y: number }): void => {
  if (smokeActive && gameTimeMs - lastSmokePuffMs >= SMOKE_INTERVAL_MS) {
    smokePuffs.push({ x: cursor.x, y: cursor.y, createdAtMs: gameTimeMs });
    lastSmokePuffMs = gameTimeMs;
  }

  const firstVisible = smokePuffs.findIndex((puff) => gameTimeMs - puff.createdAtMs <= SMOKE_LIFETIME_MS);
  if (firstVisible > 0) {
    smokePuffs.splice(0, firstVisible);
  }
  if (smokePuffs.length > 96) {
    smokePuffs.splice(0, smokePuffs.length - 96);
  }
};

const updateCursorTrail = (visualTimeMs: number, cursor: { x: number; y: number }): void => {
  const last = cursorTrail.at(-1);
  const dx = last ? cursor.x - last.x : Infinity;
  const dy = last ? cursor.y - last.y : Infinity;
  const movedEnough = dx * dx + dy * dy >= 0.35;
  if ((movedEnough || cursorTrail.length === 0) && visualTimeMs - lastCursorTrailMs >= 12) {
    cursorTrail.push({ x: cursor.x, y: cursor.y, createdAtMs: visualTimeMs });
    lastCursorTrailMs = visualTimeMs;
  }

  const firstVisible = cursorTrail.findIndex((point) => visualTimeMs - point.createdAtMs <= CURSOR_TRAIL_LIFETIME_MS);
  if (firstVisible > 0) {
    cursorTrail.splice(0, firstVisible);
  }
  if (cursorTrail.length > MAX_CURSOR_TRAIL) {
    cursorTrail.splice(0, cursorTrail.length - MAX_CURSOR_TRAIL);
  }
};

const stageSize = () => ({
  width: Math.max(stageElement.clientWidth, 320),
  height: Math.max(stageElement.clientHeight, 240),
  playfieldPadding: PLAYFIELD_PADDING_OSU,
  insetTop: STAGE_INSET.top,
  insetRight: STAGE_INSET.right,
  insetBottom: STAGE_INSET.bottom,
  insetLeft: STAGE_INSET.left,
  backgroundDim: 0.7
});

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

const bootShowcase = async (): Promise<void> => {
  const manifest = await loadShowcaseManifest();
  if (userImportStarted) {
    return;
  }
  const beatmap = manifest.beatmaps[0] ?? null;
  state.manifest = manifest;
  state.importStatus = 'showcase';
  state.errors = [];
  activeMods.clear();
  activeMods.add('HD');
  dynamicColoursEnabled = true;
  autoplayEnabled = true;
  loopEnabled = false;
  loopButton.setAttribute('aria-pressed', 'false');
  loopButton.classList.remove('active');
  await requestSelectBeatmap(beatmap);
  startShowcasePreview(0);
  audioEngine?.play(0);
  renderSidebar();
  renderDebug(true);
};

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) {
    void importFile(file);
  }
});

dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropZone.classList.add('dragging');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));

dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragging');
  const file = event.dataTransfer?.files[0];
  if (file) {
    void importFile(file);
  }
});

playButton.addEventListener('click', async () => {
  const engine = audioEngine;
  if (!engine) {
    return;
  }

  await engine.unlock();
  const audioState = engine.getState();
  if (isShowcaseBeatmap(state.selected) && showcasePreviewActive && audioState !== 'playing') {
    const previewTimeMs = showcasePreviewTimeMs();
    stopShowcasePreview(previewTimeMs);
    engine.play(previewTimeMs);
    return;
  }
  if (audioState === 'playing') {
    return;
  }
  if (audioState === 'paused') {
    engine.resume();
    return;
  }

  engine.play(audioState === 'stopped' ? 0 : engine.getGameTimeMs());
});

pauseButton.addEventListener('click', () => {
  stopShowcasePreview();
  audioEngine?.pause();
});
seekButton.addEventListener('click', () => {
  audioEngine?.seek(0);
  if (isShowcaseBeatmap(state.selected)) {
    startShowcasePreview(0);
  }
  if (state.prepared) {
    game.start(state.prepared);
    scoreSavedForDifficulty = null;
    resetVisualState();
  }
  renderDebug(true);
});

loopButton.addEventListener('click', () => {
  loopEnabled = !loopEnabled;
  loopButton.setAttribute('aria-pressed', String(loopEnabled));
  loopButton.classList.toggle('active', loopEnabled);
});

autoplayButton.addEventListener('click', () => {
  autoplayEnabled = !autoplayEnabled;
  autoplayLastTimeMs = currentGameTimeMs();
  renderSidebar();
  renderDebug(true);
});

dynamicColoursButton.addEventListener('click', () => {
  dynamicColoursEnabled = !dynamicColoursEnabled;
  renderSidebar();
  renderDebug(true);
});

copyDemoPasswordButton.addEventListener('click', () => {
  const password = copyDemoPasswordButton.dataset.password ?? '1nnc';
  const writePassword = navigator.clipboard?.writeText(password);
  if (!writePassword) {
    copyDemoPasswordButton.textContent = 'Password: 1nnc';
    return;
  }

  writePassword
    .then(() => {
      copyDemoPasswordButton.textContent = 'Copied: 1nnc';
      window.setTimeout(() => {
        copyDemoPasswordButton.textContent = 'Copy password';
      }, 1400);
    })
    .catch(() => {
      copyDemoPasswordButton.textContent = 'Password: 1nnc';
    });
});

for (const button of modButtons) {
  button.addEventListener('click', () => {
    const mod = button.dataset.mod as GameplayMod | undefined;
    if (!mod) {
      return;
    }

    if (activeMods.has(mod)) {
      activeMods.delete(mod);
    } else {
      if (mod === 'DT') {
        activeMods.delete('NC');
      }
      if (mod === 'NC') {
        activeMods.delete('DT');
      }
      activeMods.add(mod);
    }

    if (state.selected) {
      void requestSelectBeatmap(state.selected);
      return;
    }
    renderSidebar();
    renderDebug(true);
  });
}

exportButton.addEventListener('click', () => {
  const report = debugElement.textContent ?? '{}';
  const blob = new Blob([report], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = 'oszillator-debug-report.json';
  anchor.click();
  URL.revokeObjectURL(anchor.href);
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error: unknown) => {
    state.errors.push(`PWA registration failed: ${error instanceof Error ? error.message : String(error)}`);
    renderDebug(true);
  });
}

window.addEventListener('resize', () => inputManager?.updateSize());

renderSidebar();
renderDebug(true);
void bootShowcase().catch((error: unknown) => {
  state.importStatus = 'error';
  state.errors.push(`Showcase failed: ${error instanceof Error ? error.message : String(error)}`);
  renderSidebar();
  renderDebug(true);
});
