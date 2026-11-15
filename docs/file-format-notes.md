# File Format Notes

- `.osz` archives are ZIP files and are unpacked in the browser, in a worker. Paths are normalised to forward slashes; asset lookups try the path relative to the `.osu` file first, then case-insensitive matches.
- `.osu` parsing strips a BOM, normalises line endings and requires the `osu file format vN` header. Everything else is best effort: malformed lines, unknown sections and unsupported events become warnings and are skipped. Unrecognised keys in `[General]`, `[Metadata]` and `[Difficulty]` are kept in each section's `extras`.
- A missing `ApproachRate` falls back to `OverallDifficulty`, as in old beatmap versions.
- Only `Mode: 0` (osu!standard) difficulties can be selected; other modes are listed but disabled. Hold notes (osu!mania) in an otherwise standard file are ignored with a warning.
- Background images and browser-playable videos are resolved from `[Events]`; the video offset is honoured. Storyboards are not supported.
- Custom hitsound sample filenames are resolved (and shown in the debug report) but not played yet; every successful hit plays one synthesized click.
- See `known-deviations.md` for how slider curves and judgement differ from osu!.
