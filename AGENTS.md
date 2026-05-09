# AGENTS.md

## Project

Build `oszillator`, an unofficial browser-based `.osz` player experiment for osu!standard-compatible gameplay.

## Hard boundaries

- osu!standard only
- local `.osz` import only
- no ranking, leaderboard, login, or online score submission
- no online beatmap download
- no official branding or bundled official assets
- no copyrighted beatmap or audio fixtures in the repository
- no gameplay logic coupled to PixiJS or DOM

## Engineering rules

- Web Audio clock is the authoritative gameplay time source
- renderer consumes prepared beatmap state and never parses `.osu`
- parser is warning-first and robust against unknown fields
- TypeScript stays strict and `any` is avoided
- avoid per-frame allocations in renderer hot paths
- document known gameplay deviations in `docs/known-deviations.md`

## Required checks before finishing

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm lint
```

If UI or browser behavior changes:

```bash
corepack pnpm test:e2e
```

## Testing expectations

- parser changes need parser tests
- ruleset changes need deterministic unit tests
- slider changes need geometry and judgement tests
- storage changes need migration tests
- bug fixes need regression tests
