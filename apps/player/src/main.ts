import { WebAudioEngine } from '@oszillator/audio-engine';
import { RulesetStdGame, prepareBeatmap, type PreparedBeatmap } from '@oszillator/ruleset-std';
import { PixiPlayfieldRenderer } from '@oszillator/renderer-pixi';
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
      <div id="stage" class="stage" data-testid="stage"></div>
      <div class="hud">
        <div><span>Import</span><strong id="status">idle</strong></div>
        <div><span>Score</span><strong id="score">0</strong></div>
        <div><span>Acc</span><strong id="accuracy">100.00%</strong></div>
        <div><span>Combo</span><strong id="combo">0</strong></div>
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
const playButton = document.querySelector<HTMLButtonElement>('#play-button')!;
const pauseButton = document.querySelector<HTMLButtonElement>('#pause-button')!;
const seekButton = document.querySelector<HTMLButtonElement>('#seek-button')!;
const loopButton = document.querySelector<HTMLButtonElement>('#loop-button')!;
const exportButton = document.querySelector<HTMLButtonElement>('#export-button')!;

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

const renderDebug = (): void => {
  const gameState = game.getState();
  scoreElement.textContent = String(gameState.score.score);
  accuracyElement.textContent = `${(gameState.score.accuracy * 100).toFixed(2)}%`;
  comboElement.textContent = String(gameState.score.combo);
  debugElement.textContent = JSON.stringify(
    {
      archiveId: state.manifest?.archiveId ?? null,
      selected: state.selected?.normalizedPath ?? null,
      audio: audioEngine?.getState() ?? 'idle',
      gameTimeMs: Math.round(audioEngine?.getGameTimeMs() ?? gameState.currentTimeMs),
      objects: state.prepared?.objects.length ?? 0,
      warnings: [...(state.selected?.parsed.warnings ?? []), ...(state.prepared?.warnings ?? []), ...state.errors].slice(0, 12)
    },
    null,
    2
  );
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
      return;
    }

    if (event.data.type === 'error') {
      state.importStatus = 'error';
      state.errors.push(String(event.data.error));
      renderSidebar();
      renderDebug();
      worker.terminate();
    }
  };

  worker.postMessage({ type: 'import-osz', importId, buffer }, [buffer]);
};

const selectBeatmap = async (beatmap: BeatmapManifestEntry | null): Promise<void> => {
  state.selected = beatmap;
  state.prepared = beatmap ? prepareBeatmap(beatmap.parsed) : null;
  scoreSavedForDifficulty = null;
  game = new RulesetStdGame();

  if (state.prepared) {
    game.start(state.prepared);
  }

  await mountRenderer();
  await setupAudio();
  renderSidebar();
  renderDebug();
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

const mountRenderer = async (): Promise<void> => {
  if (!state.prepared) {
    return;
  }

  renderer?.destroy();
  stageElement.innerHTML = '';
  renderer = new PixiPlayfieldRenderer();
  await renderer.mount(stageElement, stageSize());

  inputManager?.destroy();
  inputManager = new InputManager({
    target: stageElement,
    getGameTimeMs: () => audioEngine?.getGameTimeMs() ?? 0,
    onInput: (event) => {
      const judgements = game.handleInput(event);
      if (judgements.some((judgement) => judgement.result !== 'miss')) {
        audioEngine?.playHitsound('normal');
      }
      renderDebug();
    }
  });

  cancelAnimationFrame(rafId);
  tick();
};

const tick = (): void => {
  if (state.prepared && renderer) {
    const time = audioEngine?.getGameTimeMs() ?? game.getState().currentTimeMs;
    const scheduledJudgements = game.updateTo(time);
    if (scheduledJudgements.some((judgement) => judgement.result !== 'miss')) {
      audioEngine?.playHitsound('normal');
    }
    if (loopEnabled && state.prepared.objects.length > 0) {
      const lastObjectEnd = Math.max(...state.prepared.objects.map((object) => object.endTimeMs));
      if (time > lastObjectEnd + 1000) {
        audioEngine?.seek(0);
        game.start(state.prepared);
        scoreSavedForDifficulty = null;
      }
    }
    void persistScoreIfComplete();
    renderer.renderFrame({
      beatmap: state.prepared,
      gameTimeMs: time,
      gameplayState: game.getState(),
      settings: stageSize()
    });
    renderDebug();
  }

  rafId = requestAnimationFrame(tick);
};

const persistScoreIfComplete = async (): Promise<void> => {
  if (!state.prepared || !state.selected || scoreSavedForDifficulty === state.selected.normalizedPath) {
    return;
  }

  const gameState = game.getState();
  const judgedCount = gameState.objects.filter((object) => object.status === 'judged').length;
  if (judgedCount !== state.prepared.objects.length || judgedCount === 0) {
    return;
  }

  try {
    const database = await openOszillatorDb();
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

const stageSize = () => ({
  width: Math.max(stageElement.clientWidth, 320),
  height: Math.max(stageElement.clientHeight, 240),
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
  await audioEngine?.unlock();
  audioEngine?.play(0);
});

pauseButton.addEventListener('click', () => audioEngine?.pause());
seekButton.addEventListener('click', () => {
  audioEngine?.seek(0);
  if (state.prepared) {
    game.start(state.prepared);
    scoreSavedForDifficulty = null;
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
    renderDebug();
  });
}

window.addEventListener('resize', () => inputManager?.updateSize());

renderSidebar();
renderDebug();
