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
