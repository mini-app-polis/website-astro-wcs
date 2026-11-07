// What the unidentified-files page sends, kept apart from the component so it
// can be tested without a browser.

/** The new-entry form's fields, as text. */
export type EntryForm = {
  title: string;
  artist: string;
  remix: string;
  genre: string;
  bpm: string;
  release_year: string;
  label: string;
};

/** A first guess at the title and artist from a library file name such as
 * ``House/temple_thomasgold.mp3`` or ``Pop/Temple - Thomas Gold.mp3``. Only
 * a starting point for the owner to correct. */
export function guessFromPath(path: string): { title: string; artist: string } {
  const name = path.split("/").pop() ?? path;
  const stem = name.replace(/\.[^.]+$/, "").replace(/\s*\(\d+\)$/, "");
  const dashed = stem.split(/\s+-\s+/);
  if (dashed.length === 2) return { title: dashed[0].trim(), artist: dashed[1].trim() };
  const parts = stem.split("_").filter(Boolean);
  if (parts.length >= 2) {
    return { title: parts[0], artist: parts[parts.length - 1] };
  }
  return { title: stem.trim(), artist: "" };
}

/** The ``entry`` of a link request: empty fields left out, numbers as numbers. */
export function entryBody(form: EntryForm): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: form.title.trim(),
    artist: form.artist.trim(),
  };
  for (const key of ["remix", "genre", "label"] as const) {
    if (form[key].trim()) body[key] = form[key].trim();
  }
  if (form.bpm.trim()) body.bpm = Number(form.bpm.trim());
  if (form.release_year.trim()) body.release_year = Number.parseInt(form.release_year.trim(), 10);
  return body;
}
