# Testing

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test       # Vitest unit tests (Node)
corepack pnpm build
corepack pnpm test:e2e   # builds the player, then runs Playwright (Chromium)
```

## Unit tests

Vitest runs every `*.test.ts` under `packages/` and `apps/` in Node:

- parser behaviour, warnings, BOM/CRLF handling and unknown sections;
- slider geometry: bezier red-anchor segments, perfect-circle orientation and fallbacks, trimming and extension to pixel length;
- beatmap preparation: combo colours, HardRock mirroring, slider checkpoints and tail timing;
- judgement and autoplay: circles, slider checkpoints, spinners, and autoplay producing identical results regardless of frame pacing;
- archive manifests: path resolution, bounded ID hashing and deduplicated worker transfers;
- player modules that do not need a browser: HUD maths, difficulty ordering, the preview clock, cursor effects, score persistence, the prepared-beatmap cache and lazy showcase loading;
- renderer helpers and the slider/view caches, with Pixi mocked. Import renderer constants from `@oszillator/renderer-pixi/visuals` in Node tests, since the package root loads Pixi.

Fixtures are synthetic and written inline. Bug fixes come with a regression test that fails without the fix.

## Browser tests

Playwright tests in `apps/player/tests` build synthetic `.osz` archives (silent WAV audio, generated `.osu` files) at runtime and cover boot, the showcase, import, playback controls, autoplay, mods, resizing, spinners, the break countdown, looping and replaying after the song ends, resource reuse across mod/difficulty switches, a showcase download held while a local archive is imported, and single score persistence while IndexedDB is held.

Playwright uses two workers to limit GPU and media contention between headless players. A few tests press a key just before a circle's hit time, so heavy machine load can make them flaky.

`local-osz-fixture.spec.ts` plays a real archive from the git-ignored `osz_files/` directory and is skipped when that file is absent. Real-world archives must never be committed.
