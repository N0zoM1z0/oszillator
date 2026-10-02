import type { OszArchiveManifest } from './manifest';

export const archiveTransferBuffers = (manifest: OszArchiveManifest): ArrayBuffer[] => {
  const buffers = new Set<ArrayBuffer>();
  for (const bytes of Object.values(manifest.entryBytes)) {
    if (bytes.buffer instanceof ArrayBuffer) {
      buffers.add(bytes.buffer);
    }
  }
  return [...buffers];
};
