# File Format Notes

- `.osz` is treated as a ZIP archive
- `.osu` parsing strips BOM and normalizes line endings
- unknown sections and keys are preserved or surfaced as warnings where useful
- mode filtering is explicit; unsupported modes are rejected without crashing the UI
