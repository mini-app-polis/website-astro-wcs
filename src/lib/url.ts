/**
 * safeUrl() is the scheme check for every href built from API data. esc()
 * escapes text for HTML but lets any scheme through, so a `javascript:` URL
 * from the API would still become a working link; this accepts only an
 * absolute http: or https: URL and returns it unchanged, or null.
 */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:" ? trimmed : null;
}

/** Google Drive's page for a library file, where it plays in the browser:
 * the admin pages link each file to it so the owner can hear what it is. */
export function driveFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}
