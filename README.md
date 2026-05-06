# oszillator

`oszillator` is an unofficial, local-first `.osz` web player and trainer for osu!standard-compatible beatmaps.

The MVP keeps all beatmap data on the client. Users import local `.osz` files, the browser parses them, prepares gameplay state, renders the playfield, and stores local settings and scores without online submission.

## Scope

- osu!standard only
- local `.osz` import only
- no ranking, leaderboard, login, or server sync
- no bundled official assets
- no copyrighted map or audio fixtures in the repository

## Workspace Commands

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e
```

## Packages

- `apps/player`: Vite browser app
- `packages/core`: shared math, time, playfield, search, and input primitives
- `packages/osu-parser`: warning-first `.osu` parser
- `packages/osz-loader`: `.osz` unzip and manifest generation
- `packages/slider-geometry`: deterministic slider path helpers
- `packages/ruleset-std`: osu!standard runtime preparation and judgement
- `packages/audio-engine`: Web Audio clock and playback helpers
- `packages/renderer-pixi`: Pixi-based debug and gameplay renderer
- `packages/storage`: local metadata, settings, and scores
