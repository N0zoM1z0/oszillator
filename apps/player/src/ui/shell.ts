const REPOSITORY_URL = 'https://github.com/N0zoM1z0/oszillator';
const SHOWCASE_DOWNLOAD_URL = 'https://n0zom1z0.lanzn.com/isZQ33ov1gij';
export const SHOWCASE_DOWNLOAD_PASSWORD = '1nnc';

const MOD_BUTTONS = [
  ['HD', 'Hidden'],
  ['HR', 'HardRock'],
  ['DT', 'Double Time'],
  ['NC', 'Nightcore']
] as const;

const template = (baseUrl: string): string => `
  <main class="shell">
    <aside class="sidebar">
      <header class="brand">
        <a class="brand-link" href="${REPOSITORY_URL}" target="_blank" rel="noreferrer" aria-label="Open oszillator on GitHub">
          <img class="brand-mark" src="${baseUrl}brand-icon.jpg" alt="" />
        </a>
        <a class="brand-copy" href="${REPOSITORY_URL}" target="_blank" rel="noreferrer">
          <h1>oszillator</h1>
          <p>osu!standard in a browser</p>
        </a>
      </header>
      <label class="drop-zone" data-testid="drop-zone">
        <input id="file-input" type="file" accept=".osz,.zip" />
        <span>Import local .osz</span>
      </label>
      <section class="starter-card" data-testid="starter-card">
        <p class="eyebrow">No beatmap yet?</p>
        <h2>Grab a showcase map</h2>
        <p>Download the .osz, import it here, and start clicking circles. Everything runs inside this browser tab.</p>
        <div class="starter-actions">
          <a class="starter-download" href="${SHOWCASE_DOWNLOAD_URL}" target="_blank" rel="noreferrer">Download .osz</a>
          <button id="copy-demo-password-button" class="starter-copy" type="button">Copy password</button>
        </div>
        <p class="starter-password">Password <code>${SHOWCASE_DOWNLOAD_PASSWORD}</code></p>
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
          ${MOD_BUTTONS.map(
            ([mod, label]) => `<button class="mod-toggle" type="button" data-mod="${mod}" aria-pressed="false">
            <strong>${mod}</strong><span>${label}</span>
          </button>`
          ).join('\n          ')}
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
          <i id="wait-progress"></i>
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

const required = <T extends Element>(root: ParentNode, selector: string): T => {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing shell element ${selector}`);
  }
  return element;
};

/** Renders the static player shell into `root` and returns typed element references. */
export const renderShell = (root: HTMLElement, baseUrl: string) => {
  root.innerHTML = template(baseUrl);
  return {
    fileInput: required<HTMLInputElement>(root, '#file-input'),
    dropZone: required<HTMLLabelElement>(root, '.drop-zone'),
    difficultyList: required<HTMLDivElement>(root, '#difficulty-list'),
    status: required<HTMLElement>(root, '#status'),
    debug: required<HTMLPreElement>(root, '#debug'),
    stage: required<HTMLDivElement>(root, '#stage'),
    stageMedia: required<HTMLDivElement>(root, '#stage-media'),
    waitOverlay: required<HTMLDivElement>(root, '#wait-overlay'),
    waitProgress: required<HTMLElement>(root, '#wait-progress'),
    score: required<HTMLElement>(root, '#score'),
    accuracy: required<HTMLElement>(root, '#accuracy'),
    combo: required<HTMLElement>(root, '#combo'),
    count300: required<HTMLElement>(root, '#count-300'),
    count100: required<HTMLElement>(root, '#count-100'),
    count50: required<HTMLElement>(root, '#count-50'),
    countMiss: required<HTMLElement>(root, '#count-miss'),
    lastResult: required<HTMLElement>(root, '#last-result'),
    offsetChart: required<HTMLDivElement>(root, '#offset-chart'),
    playButton: required<HTMLButtonElement>(root, '#play-button'),
    pauseButton: required<HTMLButtonElement>(root, '#pause-button'),
    restartButton: required<HTMLButtonElement>(root, '#seek-button'),
    loopButton: required<HTMLButtonElement>(root, '#loop-button'),
    autoplayButton: required<HTMLButtonElement>(root, '#autoplay-button'),
    exportButton: required<HTMLButtonElement>(root, '#export-button'),
    dynamicColoursButton: required<HTMLButtonElement>(root, '#dynamic-colours-button'),
    copyPasswordButton: required<HTMLButtonElement>(root, '#copy-demo-password-button'),
    modButtons: [...root.querySelectorAll<HTMLButtonElement>('.mod-toggle')]
  };
};

export type ShellElements = ReturnType<typeof renderShell>;
