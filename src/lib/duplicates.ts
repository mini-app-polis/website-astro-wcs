// What the duplicates page shows and sends, kept apart from the component so
// it can be tested without a browser. The API holds the groups and decides
// who may resolve them (catalog.tracks.write); this only lays them out.

export type DuplicateFile = {
  drive_file_id: string;
  path: string | null;
  size_bytes: number | null;
  duration_secs: number | null;
  bitrate_kbps: number | null;
  edit_label: string | null;
  present: boolean | null;
  trash_requested: boolean;
  kept_on_purpose: boolean;
  why_kept: string | null;
  outcome?: Outcome | null;
  catalog_id: string | null;
  title: string | null;
  artist: string | null;
  play_count: number | null;
};

export type DuplicateGroup = {
  id: string;
  library_root_id: string;
  key: string;
  reasons: string[];
  status: "open" | "resolved";
  keeper_drive_file_id: string | null;
  kept_together?: boolean;
  reported_at: string;
  resolved_at: string | null;
  files: DuplicateFile[];
};

/** Why the files were grouped, as the page words it. */
export const REASON_TEXT: Record<string, string> = {
  same_md5: "identical files",
  same_catalog_id: "the same catalog entry",
  same_title_artist: "the same title and artist",
  same_name: "the same name in one folder",
};

/** The reasons a group was made, worded for the page and joined by commas. */
export function reasonsText(reasons: string[]): string {
  return reasons.map((r) => REASON_TEXT[r] ?? r).join(", ");
}

/** What happens to one file: it stays on the entry, it gets a version entry
 * of its own, or it goes to Drive's trash. */
export type Outcome = "keep" | "own_version" | "trash";

/** The owner's choice for one file; the version text is used for own_version. */
export type Choice = { outcome: Outcome; version: string };

export type Choices = Record<string, Choice>;

/** A file the owner keeps on its entry that is still in the library. */
function keptInLibrary(f: DuplicateFile, choices: Choices): boolean {
  return choices[f.drive_file_id]?.outcome === "keep" && f.present !== false;
}

/** Each file's starting choice: a labelled different edit defaults to its own
 * version, with the version text prefilled from its release label; every
 * other file stays on the entry. */
export function initialChoices(group: DuplicateGroup): Choices {
  const out: Choices = {};
  for (const f of group.files) {
    out[f.drive_file_id] =
      f.kept_on_purpose && f.edit_label
        ? { outcome: "own_version", version: f.edit_label }
        : { outcome: "keep", version: f.edit_label ?? "" };
  }
  return out;
}

/** Whether a file may take this outcome: never one that would leave the
 * entry with no file in the library kept on it. */
export function allowed(group: DuplicateGroup, choices: Choices, fileId: string, outcome: Outcome): boolean {
  if (outcome === "keep") return true;
  return group.files.some((f) => f.drive_file_id !== fileId && keptInLibrary(f, choices));
}

/** The files marked as different edits that the choices send to the trash:
 * each needs its own, deliberate confirmation. */
export function differentEditsTrashed(group: DuplicateGroup, choices: Choices): DuplicateFile[] {
  return group.files.filter((f) => f.kept_on_purpose && choices[f.drive_file_id]?.outcome === "trash");
}

/** Why the choices cannot be sent yet; empty when they can. */
export function problems(group: DuplicateGroup, choices: Choices): string[] {
  const out: string[] = [];
  if (!group.files.some((f) => keptInLibrary(f, choices))) {
    out.push("Keep at least one file that is in the library on the entry.");
  }
  for (const f of group.files) {
    const c = choices[f.drive_file_id];
    if (!c) out.push(`Choose what happens to ${shownPath(f)}.`);
    else if (c.outcome === "own_version" && !c.version.trim()) {
      out.push(`Type the version for ${shownPath(f)}.`);
    }
  }
  return out;
}

/** True when every choice keeps the file on the entry. */
export function keptTogether(group: DuplicateGroup, choices: Choices): boolean {
  return group.files.every((f) => choices[f.drive_file_id]?.outcome === "keep");
}

/** The body of POST /v1/catalog/library/duplicates/{id}/resolve: an outcome
 * for every file, and confirm_different_edit when a different edit goes to
 * the trash and the owner confirmed that on its own. */
export function resolveBody(group: DuplicateGroup, choices: Choices, confirmDifferentEdit = false) {
  const wrong = problems(group, choices);
  if (wrong.length) throw new Error(wrong[0]);
  if (differentEditsTrashed(group, choices).length && !confirmDifferentEdit) {
    throw new Error("trashing a different edit needs its own confirmation");
  }
  const body: {
    outcomes: { drive_file_id: string; outcome: Outcome; version?: string }[];
    confirm_different_edit?: boolean;
  } = {
    outcomes: group.files.map((f) => {
      const c = choices[f.drive_file_id];
      return c.outcome === "own_version"
        ? { drive_file_id: f.drive_file_id, outcome: c.outcome, version: c.version.trim() }
        : { drive_file_id: f.drive_file_id, outcome: c.outcome };
    }),
  };
  if (confirmDifferentEdit) body.confirm_different_edit = true;
  return body;
}

/** A registered path as the page shows it: from its library's root, with a
 * leading slash (a file at the top of the main library is registered by its
 * bare name); the file's Drive id when it is not registered. */
export function shownPath(f: DuplicateFile): string {
  if (f.path == null) return f.drive_file_id;
  return f.path.startsWith("/") ? f.path : `/${f.path}`;
}

/** A length in seconds as m:ss ("2:12"); a dash when unknown. */
export function minutes(secs: number | null): string {
  if (secs == null) return "—";
  const whole = Math.round(secs);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** A size in bytes as megabytes to one decimal ("8.4 MB"); a dash when unknown. */
export function megabytes(bytes: number | null): string {
  if (bytes == null) return "—";
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
