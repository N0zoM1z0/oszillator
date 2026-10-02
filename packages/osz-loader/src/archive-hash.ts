const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const hashBytes = (bytes: Uint8Array): string => {
  let hash = FNV_OFFSET;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

// Preserve the archive ID's existing 4 KiB prefix semantics without expanding
// every asset into JavaScript number arrays.
export const hashArchivePrefix = (entries: readonly { bytes: Uint8Array }[]): string => {
  let hash = FNV_OFFSET;
  let remaining = 4096;
  for (const entry of entries) {
    const length = Math.min(remaining, entry.bytes.byteLength);
    for (let index = 0; index < length; index += 1) {
      hash = Math.imul(hash ^ entry.bytes[index]!, FNV_PRIME);
    }
    remaining -= length;
    if (remaining === 0) {
      break;
    }
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};
