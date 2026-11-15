const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const ARCHIVE_ID_PREFIX_BYTES = 4096;

/**
 * FNV-1a over the first 4 KiB of the concatenated archive entries. This is a
 * cheap identifier for local storage, not an integrity hash.
 */
export const hashArchivePrefix = (entries: readonly { bytes: Uint8Array }[]): string => {
  let hash = FNV_OFFSET;
  let remaining = ARCHIVE_ID_PREFIX_BYTES;
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
