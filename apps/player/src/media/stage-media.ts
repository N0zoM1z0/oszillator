import type { BeatmapManifestEntry, OszArchiveManifest } from '@oszillator/osz-loader';

import { createObjectUrl } from './mime';

/** Video drift (seconds) tolerated before it is re-seeked to the audio clock. */
const VIDEO_DRIFT_TOLERANCE_S = 0.08;

/**
 * Owns the background image or video behind the playfield. The video is a
 * muted follower of the gameplay clock and never drives timing.
 */
export class StageMedia {
  private manifest: OszArchiveManifest | null = null;

  private beatmap: BeatmapManifestEntry | null = null;

  private video: HTMLVideoElement | null = null;

  private objectUrls: string[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly reportError: (message: string) => void
  ) {}

  /** Shows `beatmap`'s media, reusing what is already mounted for the same beatmap. */
  show(manifest: OszArchiveManifest | null, beatmap: BeatmapManifestEntry | null): void {
    if (this.manifest === manifest && this.beatmap === beatmap) {
      this.rewindVideo();
      return;
    }

    this.clear();
    this.manifest = manifest;
    this.beatmap = beatmap;
    if (!manifest || !beatmap) {
      return;
    }

    const videoUrl = beatmap.videoPath ? this.objectUrlFor(manifest, beatmap.videoPath) : null;
    if (videoUrl) {
      this.mountVideo(videoUrl, beatmap.videoPath!);
      return;
    }
    const backgroundUrl = beatmap.backgroundPath ? this.objectUrlFor(manifest, beatmap.backgroundPath) : null;
    if (backgroundUrl) {
      this.mountBackground(backgroundUrl, beatmap.backgroundPath!);
    }
  }

  clear(): void {
    const video = this.video;
    this.video = null;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    this.container.replaceChildren();
    for (const url of this.objectUrls) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls = [];
    this.manifest = null;
    this.beatmap = null;
  }

  /** Keeps the video aligned with `gameTimeMs`; it only plays while gameplay audio is playing. */
  sync(gameTimeMs: number, playing: boolean, playbackRate: number): void {
    const video = this.video;
    if (!video || !this.beatmap) {
      return;
    }

    if (video.playbackRate !== playbackRate) {
      video.playbackRate = playbackRate;
    }
    const targetSeconds = (gameTimeMs - this.beatmap.parsed.events.videoOffsetMs) / 1000;
    if (targetSeconds < 0 || !playing) {
      if (!video.paused) {
        video.pause();
      }
      if (targetSeconds < 0 && video.currentTime !== 0) {
        video.currentTime = 0;
      }
      return;
    }

    const clampedTarget = Number.isFinite(video.duration) ? Math.min(targetSeconds, video.duration) : targetSeconds;
    if (Math.abs(video.currentTime - clampedTarget) > VIDEO_DRIFT_TOLERANCE_S) {
      video.currentTime = clampedTarget;
    }
    if (video.paused) {
      video.play().catch(() => {
        // Autoplay or codec support may be refused; audio stays authoritative.
      });
    }
  }

  private rewindVideo(): void {
    if (this.video && this.video.currentTime !== 0) {
      this.video.currentTime = 0;
    }
  }

  private objectUrlFor(manifest: OszArchiveManifest, path: string): string | null {
    const bytes = manifest.entryBytes[path];
    if (!bytes) {
      this.reportError(`Media file not found: ${path}`);
      return null;
    }
    const url = createObjectUrl(bytes, path);
    this.objectUrls.push(url);
    return url;
  }

  private mountVideo(url: string, path: string): void {
    const video = document.createElement('video');
    video.src = url;
    video.className = 'stage-video';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.addEventListener('error', () => {
      if (this.video === video) this.reportError(`Video unavailable: ${path}`);
    });
    this.video = video;
    this.container.append(video);
  }

  private mountBackground(url: string, path: string): void {
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    image.decoding = 'async';
    image.className = 'stage-background';
    image.addEventListener('error', () => {
      if (image.isConnected) this.reportError(`Background unavailable: ${path}`);
    });
    this.container.append(image);
  }
}
