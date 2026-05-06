import { WebAudioEngine } from '@oszillator/audio-engine';
import { RulesetStdGame, prepareBeatmap, type HitResult, type JudgementEvent, type PreparedBeatmap } from '@oszillator/ruleset-std';
import { PixiPlayfieldRenderer, type SmokePuff } from '@oszillator/renderer-pixi';
import type { OszArchiveManifest, BeatmapManifestEntry } from '@oszillator/osz-loader';
import { openOszillatorDb, saveBeatmapSet, saveLocalScore } from '@oszillator/storage';

import { InputManager } from './input/input-manager';
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
let videoElement: HTMLVideoElement | null = null;
let smokeActive = false;
let lastSmokePuffMs = -Infinity;

const hitHistory: HitHistoryEntry[] = [];
const smokePuffs: SmokePuff[] = [];

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

root.innerHTML = `
  <main class="shell">
    <aside class="sidebar">
      <header class="brand">
        <div class="brand-mark">O</div>
        <div>
          <h1>oszillator</h1>
          <p>local osu!standard trainer</p>
        </div>
      </header>
      <label class="drop-zone" data-testid="drop-zone">
        <input id="file-input" type="file" accept=".osz,.zip" />
        <span>Import local .osz</span>
      </label>
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
          <button id="export-button" type="button">Export report</button>
        </div>
      </section>
    </aside>
    <section class="stage-column">
      <div id="stage" class="stage" data-testid="stage">
        <div id="stage-media" class="stage-media" aria-hidden="true"></div>
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
const exportButton = document.querySelector<HTMLButtonElement>('#export-button')!;

window.__oszillatorDebug = {
  getGameTimeMs: () => Math.round(audioEngine?.getGameTimeMs() ?? game.getCurrentTimeMs())
};

const renderSidebar = (): void => {
  statusElement.textContent = state.importStatus;
  difficultyList.innerHTML = '';

  const beatmaps = state.manifest?.beatmaps ?? [];
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
    button.addEventListener('click', () => selectBeatmap(beatmap));
    difficultyList.append(button);
  }

  playButton.disabled = !state.prepared;
  pauseButton.disabled = !state.prepared;
  seekButton.disabled = !state.prepared;
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
      gameTimeMs: Math.round(audioEngine?.getGameTimeMs() ?? gameState.currentTimeMs),
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

const importFile = async (file: File): Promise<void> => {
  state.importStatus = 'reading';
  state.errors = [];
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
      selectBeatmap(state.manifest.beatmaps.find((beatmap) => beatmap.supported) ?? null);
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

const selectBeatmap = async (beatmap: BeatmapManifestEntry | null): Promise<void> => {
  await teardownAudio();
  teardownStageMedia();
  state.selected = beatmap;
  state.prepared = beatmap ? prepareBeatmap(beatmap.parsed) : null;
  scoreSavedForDifficulty = null;
  preparedEndTimeMs = state.prepared?.objects.reduce((endTime, object) => Math.max(endTime, object.endTimeMs), 0) ?? 0;
  game = new RulesetStdGame();
  resetVisualState();

  if (state.prepared) {
    game.start(state.prepared);
  }

  setupStageMedia(beatmap);
  await mountRenderer();
  await setupAudio();
  renderSidebar();
  renderDebug(true);
};

const resetVisualState = (): void => {
  hitHistory.length = 0;
  smokePuffs.length = 0;
  smokeActive = false;
  lastSmokePuffMs = -Infinity;
};

const setupStageMedia = (beatmap: BeatmapManifestEntry | null): void => {
  if (!beatmap || !state.manifest) {
    return;
  }

  stageMediaElement.innerHTML = '';
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
  if (extension === 'webm') {
    return 'video/webm';
  }
  if (extension === 'ogv') {
    return 'video/ogg';
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
    const buffer = await audioEngine.load(audioCopy.buffer);
    audioEngine.setBuffer(buffer);
  } catch (error) {
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
};

const mountRenderer = async (): Promise<void> => {
  if (!state.prepared) {
    return;
  }

  cancelAnimationFrame(rafId);
  renderer?.destroy();
  renderer = null;
  stageElement.querySelectorAll('canvas').forEach((canvas) => canvas.remove());
  const nextRenderer = new PixiPlayfieldRenderer();
  await nextRenderer.mount(stageElement, stageSize());
  renderer = nextRenderer;

  inputManager?.destroy();
  inputManager = new InputManager({
    target: stageElement,
    getScreenRect: stageSize,
    getGameTimeMs: () => audioEngine?.getGameTimeMs() ?? 0,
    onSmokeActive: (active) => {
      smokeActive = active;
    },
    onInput: (event) => {
      const judgements = game.handleInput(event);
      recordJudgements(judgements);
      if (judgements.some((judgement) => judgement.result !== 'miss')) {
        audioEngine?.playHitsound('normal');
      }
      renderDebug(true);
    }
  });

  tick();
};

const tick = (): void => {
  if (state.prepared && renderer) {
    const time = audioEngine?.getGameTimeMs() ?? game.getCurrentTimeMs();
    syncStageVideo(time);
    const scheduledJudgements = game.updateTo(time);
    recordJudgements(scheduledJudgements);
    if (scheduledJudgements.some((judgement) => judgement.result !== 'miss')) {
      audioEngine?.playHitsound('normal');
    }
    if (loopEnabled && state.prepared.objects.length > 0) {
      if (time > preparedEndTimeMs + 1000) {
        audioEngine?.seek(0);
        game.start(state.prepared);
        scoreSavedForDifficulty = null;
        resetVisualState();
      }
    }
    void persistScoreIfComplete();
    const gameState = game.getState();
    updateSmokePuffs(time, gameState.cursor);
    renderer.renderFrame({
      beatmap: state.prepared,
      gameTimeMs: time,
      gameplayState: gameState,
      settings: stageSize(),
      smokePuffs
    });
    renderDebug();
  }

  rafId = requestAnimationFrame(tick);
};

const persistScoreIfComplete = async (): Promise<void> => {
  if (!state.prepared || !state.selected || scoreSavedForDifficulty === state.selected.normalizedPath) {
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
  if (audioState === 'playing') {
    return;
  }
  if (audioState === 'paused') {
    engine.resume();
    return;
  }

  engine.play(audioState === 'stopped' ? 0 : engine.getGameTimeMs());
});

pauseButton.addEventListener('click', () => audioEngine?.pause());
seekButton.addEventListener('click', () => {
  audioEngine?.seek(0);
  if (state.prepared) {
    game.start(state.prepared);
    scoreSavedForDifficulty = null;
    resetVisualState();
  }
});

loopButton.addEventListener('click', () => {
  loopEnabled = !loopEnabled;
  loopButton.setAttribute('aria-pressed', String(loopEnabled));
  loopButton.classList.toggle('active', loopEnabled);
});

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
  navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
    state.errors.push(`PWA registration failed: ${error instanceof Error ? error.message : String(error)}`);
    renderDebug(true);
  });
}

window.addEventListener('resize', () => inputManager?.updateSize());

renderSidebar();
renderDebug(true);
