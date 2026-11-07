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

export function reasonsText(reasons: string[]): string {
  return reasons.map((r) => REASON_TEXT[r] ?? r).join(", ");
}

/** The group's files split into the copies to choose among and the files
 * kept on purpose, which the page shows apart and never sends to the trash. */
export function split(group: DuplicateGroup): { copies: DuplicateFile[]; kept: DuplicateFile[] } {
  return {
    copies: group.files.filter((f) => !f.kept_on_purpose),
    kept: group.files.filter((f) => f.kept_on_purpose),
  };
}

/** What resolving with this keeper does: the file kept, and the copies that
 * go to Drive's trash. Null when the keeper is not one of the copies. */
export function plan(
  group: DuplicateGroup,
  keeperId: string,
): { keep: DuplicateFile; trash: DuplicateFile[] } | null {
  const { copies } = split(group);
  const keep = copies.find((f) => f.drive_file_id === keeperId);
  if (!keep) return null;
  return { keep, trash: copies.filter((f) => f.drive_file_id !== keeperId) };
}

/** The body of POST /v1/catalog/library/duplicates/{id}/resolve. */
export function resolveBody(group: DuplicateGroup, keeperId: string) {
  const p = plan(group, keeperId);
  if (!p) throw new Error("the keeper must be one of the group's copies");
  return {
    keeper_drive_file_id: p.keep.drive_file_id,
    trash_drive_file_ids: p.trash.map((f) => f.drive_file_id),
  };
}

export function minutes(secs: number | null): string {
  if (secs == null) return "—";
  const whole = Math.round(secs);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function megabytes(bytes: number | null): string {
  if (bytes == null) return "—";
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
