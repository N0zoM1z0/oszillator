const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  bmp: 'image/bmp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  avi: 'video/x-msvideo'
};

export const mimeTypeForPath = (path: string): string =>
  MIME_TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';

/** Wraps archive bytes in a blob URL. The caller owns (and must revoke) the URL. */
export const createObjectUrl = (bytes: Uint8Array, path: string): string => {
  // Copy into a fresh ArrayBuffer-backed view: the source may be a subarray
  // of a larger (or shared) buffer.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return URL.createObjectURL(new Blob([copy], { type: mimeTypeForPath(path) }));
};
