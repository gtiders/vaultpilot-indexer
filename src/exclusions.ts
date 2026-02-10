export function parseRuleList(raw: string): string[] {
  return raw
    .split(/[,\n]/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.split("*").map((chunk) => escapeRegExp(chunk)).join(".*");
  return new RegExp(`^${escaped}$`, "i");
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

export function isPathExcluded(path: string, excludedFolders: string[], excludedFilePatterns: string[]): boolean {
  const normalized = normalizePath(path);

  const folderHit = excludedFolders.some((folder) => {
    const normalizedFolder = normalizePath(folder).replace(/\/+$/, "");
    return normalized === normalizedFolder || normalized.startsWith(`${normalizedFolder}/`);
  });
  if (folderHit) {
    return true;
  }

  return excludedFilePatterns.some((pattern) => wildcardToRegExp(normalizePath(pattern)).test(normalized));
}
