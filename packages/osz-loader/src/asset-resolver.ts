export const normalizeArchivePath = (value: string): string =>
  value.replaceAll('\\', '/').replace(/^\.?\//, '').trim();

const dirname = (path: string): string => {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index + 1);
};

export const resolveArchivePath = (
  paths: readonly string[],
  target: string | null | undefined,
  basePath?: string
): string | null => {
  if (!target) {
    return null;
  }

  const normalizedTarget = normalizeArchivePath(target.replace(/^"(.*)"$/, '$1'));
  const candidateTargets = basePath
    ? [normalizeArchivePath(`${dirname(normalizeArchivePath(basePath))}${normalizedTarget}`), normalizedTarget]
    : [normalizedTarget];

  const exactMatch = paths.find((path) => candidateTargets.includes(normalizeArchivePath(path)));
  if (exactMatch) {
    return exactMatch;
  }

  const lowerTargets = new Set(candidateTargets.map((candidate) => candidate.toLowerCase()));
  const caseInsensitiveMatch = paths.find((path) => lowerTargets.has(normalizeArchivePath(path).toLowerCase()));
  return caseInsensitiveMatch ?? null;
};
