import type { BeatmapManifestEntry } from '@oszillator/osz-loader';
import { deriveDifficulty } from '@oszillator/ruleset-std';

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

const songKey = (beatmap: BeatmapManifestEntry): string =>
  `${beatmap.parsed.metadata.artist}\u0000${beatmap.parsed.metadata.title}`.toLowerCase();

/** Rough difficulty estimate used only to order a song's difficulties. */
const difficultyEstimate = (beatmap: BeatmapManifestEntry): number => {
  const difficulty = deriveDifficulty(beatmap.parsed.difficulty);
  return (
    difficulty.overallDifficulty * 1.7 +
    difficulty.approachRate * 1.35 +
    difficulty.circleSize * 0.9 +
    difficulty.hpDrainRate * 0.2 +
    Math.log2(Math.max(1, beatmap.parsed.hitObjects.length)) * 0.6
  );
};

/** Groups difficulties by song, then orders each song from easiest to hardest. */
export const sortBeatmaps = (beatmaps: readonly BeatmapManifestEntry[]): BeatmapManifestEntry[] => {
  const estimates = new Map(beatmaps.map((beatmap) => [beatmap, difficultyEstimate(beatmap)]));
  return [...beatmaps].sort(
    (left, right) =>
      songKey(left).localeCompare(songKey(right)) ||
      estimates.get(left)! - estimates.get(right)! ||
      left.parsed.metadata.version.localeCompare(right.parsed.metadata.version)
  );
};

export const renderDifficultyList = (
  container: HTMLElement,
  beatmaps: readonly BeatmapManifestEntry[],
  selected: BeatmapManifestEntry | null,
  onSelect: (beatmap: BeatmapManifestEntry) => void
): void => {
  container.replaceChildren();
  if (beatmaps.length === 0) {
    container.innerHTML = '<p class="empty">No beatmap loaded</p>';
    return;
  }

  for (const beatmap of sortBeatmaps(beatmaps)) {
    const { metadata } = beatmap.parsed;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = beatmap === selected ? 'difficulty active' : 'difficulty';
    button.disabled = !beatmap.supported;
    button.innerHTML = `
      <strong>${escapeHtml(metadata.version || beatmap.normalizedPath)}</strong>
      <span>${escapeHtml(metadata.title)} - ${escapeHtml(metadata.artist)}</span>
      <small>${beatmap.parsed.hitObjects.length} objects${beatmap.supported ? '' : ' · unsupported mode'}</small>
    `;
    button.addEventListener('click', () => onSelect(beatmap));
    container.append(button);
  }
};
