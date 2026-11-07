// What the unidentified-files page sends, kept apart from the component so it
// can be tested without a browser.

/** A file's own tags as the nightly run last read them. */
export type Tags = {
  title?: string | null;
  artist?: string | null;
  genre?: string | null;
  bpm?: string | null;
  year?: string | null;
  label?: string | null;
};

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

/** The tags the file carries, for display: "Temple — T. Gold · 124 BPM". */
export function tagsText(tags: Tags): string {
  const parts: string[] = [];
  const song = [tags.title, tags.artist].filter(Boolean).join(" — ");
  if (song) parts.push(song);
  if (tags.genre) parts.push(tags.genre);
  if (tags.bpm) parts.push(`${tags.bpm} BPM`);
  if (tags.year) parts.push(tags.year);
  if (tags.label) parts.push(tags.label);
  return parts.length ? parts.join(" · ") : "none";
}

/** The new-entry form to start from: the file's own tags where it has them,
 * then a guess from its name. */
export function startingParts(path: string, tags?: Tags | null): EntryForm {
  const guess = guessFromPath(path);
  return {
    title: tags?.title || guess.title,
    artist: tags?.artist || guess.artist,
    remix: "",
    genre: tags?.genre ?? "",
    bpm: tags?.bpm ?? "",
    release_year: tags?.year ?? "",
    label: tags?.label ?? "",
  };
}
