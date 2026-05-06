# File Format Notes

- `.osz` archives are treated as ZIP files and unpacked locally in the browser.
- `.osu` parsing strips BOMs and normalizes line endings.
- Unknown sections and keys are preserved or surfaced as warnings where useful.
- Mode filtering is explicit; unsupported rulesets are rejected without crashing the UI.
- Beatmap background images and browser-supported videos are resolved from the imported archive.
- Real-world map compatibility is handled defensively: parse what is understood, warn about the rest, and keep the interface responsive.
