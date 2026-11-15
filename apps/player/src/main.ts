import type { BeatmapManifestEntry, OszArchiveManifest } from '@oszillator/osz-loader';
import { PixiPlayfieldRenderer } from '@oszillator/renderer-pixi';
import { AutoplayDriver, RulesetStdGame, type GameplayMod, type JudgementEvent, type PreparedBeatmap } from '@oszillator/ruleset-std';

import { CursorEffects } from './cursor-effects';
import { importOszFile } from './import-osz';
import { InputManager } from './input/input-manager';
import { saveImportedArchive, saveScore } from './local-library';
import { AudioTrack } from './media/audio-track';
import { StageMedia } from './media/stage-media';
import { PreparedBeatmapCache } from './prepared-beatmap-cache';
import { PreviewClock } from './preview-clock';
import { RunScorePersistence } from './score-persistence';
import { ensureShowcaseAssets, isShowcaseBeatmap, loadShowcaseManifest } from './showcase';
import { stageSettingsForSize, type StageSettings } from './stage-layout';
import { renderDifficultyList } from './ui/difficulty-list';
import { Hud } from './ui/hud';
import { renderShell, SHOWCASE_DOWNLOAD_PASSWORD } from './ui/shell';
import './styles.css';

declare global {
  interface Window {
    /** Read by the Playwright tests to synchronise with the gameplay clock. */
    __oszillatorDebug?: {
      getGameTimeMs: () => number;
    };
  }
}

/** How long past the last object's end the map keeps running before it is considered over. */
const END_HOLD_MS = 1000;
const DEBUG_RENDER_INTERVAL_MS = 250;

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Missing #app root');
}
const ui = renderShell(root, import.meta.env.BASE_URL);

// ---------------------------------------------------------------------------
// State

const state = {
  manifest: null as OszArchiveManifest | null,
  selected: null as BeatmapManifestEntry | null,
  prepared: null as PreparedBeatmap | null,
  /** End time of the last-ending object in `prepared`. */
  preparedEndTimeMs: 0,
  importStatus: 'idle',
  errors: [] as string[],
  /** Set once the selected beatmap's renderer and audio are ready to play. */
  selectionReady: false,
  userImportStarted: false
};

const options = {
  autoplay: false,
  loop: false,
  dynamicColours: false,
  mods: new Set<GameplayMod>()
};

const reportError = (message: string): void => {
  state.errors.push(message);
  renderDebug(true);
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const hud = new Hud(ui);
const effects = new CursorEffects();
const stageMedia = new StageMedia(ui.stageMedia, reportError);
const audio = new AudioTrack();
const previewClock = new PreviewClock();
const preparedBeatmaps = new PreparedBeatmapCache();
const scorePersistence = new RunScorePersistence(saveScore);

let game = new RulesetStdGame();
let autoplay: AutoplayDriver | null = null;
let renderer: PixiPlayfieldRenderer | null = null;
let inputManager: InputManager | null = null;
let stageSettings: StageSettings = stageSettingsForSize(ui.stage.clientWidth, ui.stage.clientHeight);
let selectionQueue: Promise<void> = Promise.resolve();
let selectionRequestId = 0;
let lastDebugRenderMs = -Infinity;

const isShowcaseSelected = (): boolean => isShowcaseBeatmap(state.selected, state.manifest);

const selectedMods = (): GameplayMod[] => [...options.mods];

/**
 * The audio clock is authoritative. The only exception is the bundled
 * showcase, which may animate on a wall-clock preview before the browser lets
 * audio start.
 */
const currentGameTimeMs = (): number => {
  const engine = audio.engine;
  if (isShowcaseSelected() && previewClock.active && engine?.getState() !== 'playing') {
    return previewClock.timeMs();
  }
  return engine?.getGameTimeMs() ?? game.getCurrentTimeMs();
};

window.__oszillatorDebug = {
  getGameTimeMs: () => Math.round(currentGameTimeMs())
};

// ---------------------------------------------------------------------------
// Rendering of DOM chrome

const setPressed = (button: HTMLButtonElement, pressed: boolean): void => {
  button.classList.toggle('active', pressed);
  button.setAttribute('aria-pressed', String(pressed));
};

const renderControls = (): void => {
  ui.status.textContent = state.importStatus;
  const playable = Boolean(state.prepared);
  ui.playButton.disabled = !playable;
  ui.pauseButton.disabled = !playable;
  ui.restartButton.disabled = !playable;
  setPressed(ui.loopButton, options.loop);
  setPressed(ui.autoplayButton, options.autoplay);
  setPressed(ui.dynamicColoursButton, options.dynamicColours);
  ui.dynamicColoursButton.textContent = `Dynamic colours: ${options.dynamicColours ? 'on' : 'off'}`;
  for (const button of ui.modButtons) {
    setPressed(button, options.mods.has(button.dataset.mod as GameplayMod));
  }
};

const renderDifficulties = (): void => {
  renderDifficultyList(ui.difficultyList, state.manifest?.beatmaps ?? [], state.selected, (beatmap) => {
    void requestSelectBeatmap(beatmap);
  });
};

/** The debug panel doubles as the exported report and as test instrumentation. */
const renderDebug = (force = false): void => {
  const now = performance.now();
  if (!force && now - lastDebugRenderMs < DEBUG_RENDER_INTERVAL_MS) {
    return;
  }
  lastDebugRenderMs = now;

  const engine = audio.engine;
  ui.debug.textContent = JSON.stringify(
    {
      archiveId: state.manifest?.archiveId ?? null,
      selected: state.selected?.normalizedPath ?? null,
      background: state.selected?.backgroundPath ?? null,
      video: state.selected?.videoPath ?? null,
      audio: engine?.getState() ?? 'idle',
      autoplay: options.autoplay,
      mods: selectedMods(),
      dynamicColours: options.dynamicColours,
      playbackRate: engine?.getPlaybackRate() ?? state.prepared?.timeRate ?? 1,
      preservePitch: engine?.getPreservePitch() ?? true,
      gameTimeMs: Math.round(currentGameTimeMs()),
      objects: state.prepared?.objects.length ?? 0,
      counts: game.getState().score.counts,
      customSamples: state.selected?.customSamplePaths ?? [],
      warnings: [...(state.selected?.parsed.warnings ?? []), ...(state.prepared?.warnings ?? []), ...state.errors].slice(0, 12)
    },
    null,
    2
  );
};

// ---------------------------------------------------------------------------
// Runs and gameplay loop

/** Starts a fresh attempt at the prepared beatmap from time zero. */
const restartRun = (): void => {
  effects.reset();
  if (state.prepared) {
    game.start(state.prepared);
    autoplay = new AutoplayDriver(game, state.prepared);
    scorePersistence.startRun();
  } else {
    autoplay = null;
  }
  hud.reset();
  hud.render(game.getState().score);
};

const applyJudgements = (judgements: readonly JudgementEvent[]): void => {
  if (judgements.length === 0) {
    return;
  }
  hud.recordJudgements(judgements);
  if (judgements.some((judgement) => judgement.result !== 'miss')) {
    audio.engine?.playHitsound();
  }
};

/** Local scores are kept only for complete, unassisted, unmodded runs. */
const persistScoreIfComplete = (): void => {
  if (!state.selected || options.autoplay || options.mods.size > 0 || !scorePersistence.canSave || !game.isComplete()) {
    return;
  }

  const { score } = game.getState();
  void scorePersistence
    .saveOnce({
      id: crypto.randomUUID(),
      difficultyId: state.selected.normalizedPath,
      playedAt: Date.now(),
      score: score.score,
      accuracy: score.accuracy,
      maxCombo: score.maxCombo,
      counts: { ...score.counts }
    })
    ?.catch((error: unknown) => reportError(`Score persistence failed: ${errorMessage(error)}`));
};

const handleMapEnd = (timeMs: number): void => {
  const engine = audio.engine;
  const audioState = engine?.getState();
  if (options.loop && state.prepared && state.prepared.objects.length > 0) {
    restartRun();
    if (audioState === 'playing' || audioState === 'stopped') {
      engine?.play(0);
    }
    if (isShowcaseSelected() && previewClock.active) {
      previewClock.start(0);
    }
    return;
  }

  if (isShowcaseSelected() && previewClock.active && audioState !== 'playing') {
    previewClock.stop(Math.min(timeMs, state.preparedEndTimeMs + END_HOLD_MS));
  }
};

const tick = (): void => {
  requestAnimationFrame(tick);
  const prepared = state.prepared;
  if (!prepared || !renderer) {
    return;
  }

  const timeMs = currentGameTimeMs();
  const audioState = audio.engine?.getState();
  stageMedia.sync(timeMs, audioState === 'playing', prepared.timeRate);
  if (options.autoplay && autoplay) {
    autoplay.moveCursorTo(timeMs);
    applyJudgements(autoplay.advanceTo(timeMs));
  }
  applyJudgements(game.updateTo(timeMs));
  // Audio may also end before the last object does; then time stops advancing.
  if (timeMs > state.preparedEndTimeMs + END_HOLD_MS || audioState === 'stopped') {
    handleMapEnd(timeMs);
  }
  persistScoreIfComplete();

  const gameplayState = game.getState();
  const visualTimeMs = performance.now();
  hud.render(gameplayState.score);
  hud.renderWait(prepared.objects, timeMs);
  effects.update(timeMs, visualTimeMs, gameplayState.cursor);
  renderer.renderFrame({
    beatmap: prepared,
    gameTimeMs: timeMs,
    visualTimeMs,
    gameplayState,
    settings: stageSettings,
    hidden: options.mods.has('HD'),
    dynamicColours: options.dynamicColours,
    smokePuffs: effects.smokePuffs,
    cursorTrail: effects.cursorTrail
  });
  renderDebug();
};

const mountRenderer = async (): Promise<void> => {
  if (renderer) {
    return;
  }

  const nextRenderer = new PixiPlayfieldRenderer();
  await nextRenderer.mount(ui.stage, stageSettings);
  renderer = nextRenderer;
  inputManager = new InputManager({
    target: ui.stage,
    getScreenRect: () => stageSettings,
    getGameTimeMs: currentGameTimeMs,
    onSmokeActive: (active) => {
      effects.smokeActive = active;
    },
    onInput: (event) => {
      if (!options.autoplay) {
        applyJudgements(game.handleInput(event));
      }
    }
  });
};

const unmountRenderer = (): void => {
  inputManager?.destroy();
  inputManager = null;
  renderer?.destroy();
  renderer = null;
};

// ---------------------------------------------------------------------------
// Beatmap selection

const loadSelectedAudio = async (): Promise<void> => {
  const path = state.selected?.audioPath;
  if (!state.manifest || !path) {
    await audio.unload();
    return;
  }
  try {
    await audio.load(state.manifest, path, state.prepared?.timeRate ?? 1, !options.mods.has('NC'));
  } catch (error) {
    reportError(errorMessage(error));
  }
};

const selectBeatmap = async (beatmap: BeatmapManifestEntry | null, requestId: number): Promise<void> => {
  if (requestId !== selectionRequestId) {
    return;
  }

  state.selectionReady = false;
  audio.engine?.stop();
  previewClock.reset();
  state.selected = beatmap;
  state.prepared = beatmap ? preparedBeatmaps.get(beatmap.parsed, { mods: selectedMods() }) : null;
  state.preparedEndTimeMs = state.prepared?.objects.reduce((endTime, object) => Math.max(endTime, object.endTimeMs), 0) ?? 0;
  game = new RulesetStdGame();
  restartRun();
  stageMedia.show(state.manifest, beatmap);
  renderDifficulties();

  if (!state.prepared) {
    unmountRenderer();
    await audio.unload();
  } else {
    await mountRenderer();
    if (requestId !== selectionRequestId) return;
    await loadSelectedAudio();
    if (requestId !== selectionRequestId) return;
    state.selectionReady = true;
  }

  renderControls();
  renderDebug(true);
};

/**
 * Selections run one at a time and only the newest request wins. Showcase
 * downloads happen before queueing so a pending download never blocks a
 * newer local import.
 */
const requestSelectBeatmap = async (beatmap: BeatmapManifestEntry | null): Promise<void> => {
  const requestId = ++selectionRequestId;
  const manifest = state.manifest;
  try {
    if (beatmap && manifest) await ensureShowcaseAssets(manifest, beatmap);
    if (requestId !== selectionRequestId || manifest !== state.manifest) return;
    selectionQueue = selectionQueue.catch(() => undefined).then(() => selectBeatmap(beatmap, requestId));
    await selectionQueue;
  } catch (error) {
    if (requestId === selectionRequestId) {
      reportError(`Selection failed: ${errorMessage(error)}`);
    }
  }
};

const resetOptions = (): void => {
  options.autoplay = false;
  options.dynamicColours = false;
  options.mods.clear();
};

const importFile = async (file: File): Promise<void> => {
  state.userImportStarted = true;
  state.importStatus = 'reading';
  state.errors = [];
  resetOptions();
  previewClock.reset();
  renderControls();

  try {
    const manifest = await importOszFile(file, (phase) => {
      state.importStatus = phase;
      renderControls();
    });
    state.manifest = manifest;
    state.importStatus = 'ready';
    saveImportedArchive(manifest).catch((error: unknown) => reportError(`Library persistence failed: ${errorMessage(error)}`));
    void requestSelectBeatmap(manifest.beatmaps.find((beatmap) => beatmap.supported) ?? null);
  } catch (error) {
    state.importStatus = 'error';
    state.errors.push(errorMessage(error));
  }
  renderControls();
  renderDebug(true);
};

const bootShowcase = async (): Promise<void> => {
  const manifest = await loadShowcaseManifest();
  if (state.userImportStarted) {
    return;
  }

  const beatmap = manifest.beatmaps[0] ?? null;
  state.manifest = manifest;
  state.importStatus = 'showcase';
  state.errors = [];
  resetOptions();
  options.mods.add('HD');
  options.dynamicColours = true;
  options.autoplay = true;
  options.loop = false;
  renderControls();
  await requestSelectBeatmap(beatmap);
  if (state.userImportStarted || state.manifest !== manifest || state.selected !== beatmap || !state.selectionReady) {
    return;
  }
  previewClock.start(0);
  audio.engine?.play(0);
  renderControls();
  renderDebug(true);
};

// ---------------------------------------------------------------------------
// Controls

const play = async (): Promise<void> => {
  const engine = audio.engine;
  if (!engine || !state.selectionReady) {
    return;
  }

  const requestId = selectionRequestId;
  await engine.unlock();
  if (requestId !== selectionRequestId || engine !== audio.engine || !state.selectionReady) {
    return;
  }

  const audioState = engine.getState();
  if (isShowcaseSelected() && previewClock.active && audioState !== 'playing') {
    // Hand the running preview over to real audio at the same position.
    const timeMs = previewClock.timeMs();
    previewClock.stop(timeMs);
    engine.play(timeMs);
    return;
  }
  if (audioState === 'paused') {
    engine.resume();
  } else if (audioState === 'stopped') {
    // The song finished: playing again is a new run, not a replay of judged objects.
    restartRun();
    engine.play(0);
  } else if (audioState !== 'playing') {
    engine.play(engine.getGameTimeMs());
  }
};

const restart = (): void => {
  audio.engine?.seek(0);
  if (isShowcaseSelected()) {
    if (previewClock.active) previewClock.start(0);
    else previewClock.stop(0);
  }
  restartRun();
  renderDebug(true);
};

const toggleMod = (mod: GameplayMod): void => {
  if (options.mods.has(mod)) {
    options.mods.delete(mod);
  } else {
    // DT and NC are two flavours of the same speed-up.
    if (mod === 'DT') options.mods.delete('NC');
    if (mod === 'NC') options.mods.delete('DT');
    options.mods.add(mod);
  }

  renderControls();
  if (state.selected) {
    void requestSelectBeatmap(state.selected);
  } else {
    renderDebug(true);
  }
};

const exportReport = (): void => {
  renderDebug(true);
  const url = URL.createObjectURL(new Blob([ui.debug.textContent ?? '{}'], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'oszillator-debug-report.json';
  anchor.click();
  // Revoking synchronously can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const copyDemoPassword = (): void => {
  const button = ui.copyPasswordButton;
  const showPassword = (): void => {
    button.textContent = `Password: ${SHOWCASE_DOWNLOAD_PASSWORD}`;
  };
  const write = navigator.clipboard?.writeText(SHOWCASE_DOWNLOAD_PASSWORD);
  if (!write) {
    showPassword();
    return;
  }
  write
    .then(() => {
      button.textContent = `Copied: ${SHOWCASE_DOWNLOAD_PASSWORD}`;
      window.setTimeout(() => {
        button.textContent = 'Copy password';
      }, 1400);
    })
    .catch(showPassword);
};

ui.fileInput.addEventListener('change', () => {
  const file = ui.fileInput.files?.[0];
  // Clear the input so choosing the same file again still fires `change`.
  ui.fileInput.value = '';
  if (file) void importFile(file);
});

ui.dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  ui.dropZone.classList.add('dragging');
});
ui.dropZone.addEventListener('dragleave', (event) => {
  // Moving over the label's own children also fires dragleave.
  if (!(event.relatedTarget instanceof Node && ui.dropZone.contains(event.relatedTarget))) {
    ui.dropZone.classList.remove('dragging');
  }
});
ui.dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  ui.dropZone.classList.remove('dragging');
  const file = event.dataTransfer?.files[0];
  if (file) void importFile(file);
});

ui.playButton.addEventListener('click', () => void play());
ui.pauseButton.addEventListener('click', () => {
  previewClock.stop();
  audio.engine?.pause();
});
ui.restartButton.addEventListener('click', restart);
ui.loopButton.addEventListener('click', () => {
  options.loop = !options.loop;
  renderControls();
});
ui.autoplayButton.addEventListener('click', () => {
  options.autoplay = !options.autoplay;
  const timeMs = currentGameTimeMs();
  if (options.autoplay) {
    autoplay?.resetTo(timeMs);
  } else {
    // Do not leave a slider or spinner held by a key nobody is pressing.
    autoplay?.releaseAll(timeMs);
  }
  renderControls();
  renderDebug(true);
});
ui.dynamicColoursButton.addEventListener('click', () => {
  options.dynamicColours = !options.dynamicColours;
  renderControls();
  renderDebug(true);
});
ui.copyPasswordButton.addEventListener('click', copyDemoPassword);
ui.exportButton.addEventListener('click', exportReport);
for (const button of ui.modButtons) {
  button.addEventListener('click', () => toggleMod(button.dataset.mod as GameplayMod));
}

const updateStageSettings = (): void => {
  stageSettings = stageSettingsForSize(ui.stage.clientWidth, ui.stage.clientHeight);
  inputManager?.updateSize();
};
new ResizeObserver(updateStageSettings).observe(ui.stage);
window.addEventListener('resize', updateStageSettings);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error: unknown) => {
    reportError(`PWA registration failed: ${errorMessage(error)}`);
  });
}

renderControls();
renderDifficulties();
renderDebug(true);
requestAnimationFrame(tick);
void bootShowcase().catch((error: unknown) => {
  state.importStatus = 'error';
  renderControls();
  reportError(`Showcase failed: ${errorMessage(error)}`);
});
