// What the reconcile review page shows and sends, kept apart from the
// component so it can be tested without a browser. The API holds the
// differences each reconcile run reports and the owner's approvals, and
// decides who may see and change them (catalog.tracks.write); this only lays
// them out and builds the approvals the page saves.
//
// Every approval says which side wins, so every difference can close:
// approved for the catalog, its value is written over the file (kinds,
// files); approved for the file, the file's value goes up to the catalog
// entry and the file is not written (file_wins_kinds, file_wins_files).
// Left unapproved, a difference is simply not decided yet.

export type ReconcileDifference = {
  drive_file_id: string;
  path: string;
  field: string;
  kind: string;
  file_value: string;
  catalog_value: string;
  run_id: string;
  reported_at: string;
  catalog_id: string | null;
  approved: boolean;
  approved_for?: Side | null;
};

/** Which value wins: the catalog's, written over the file, or the file's,
 * sent up to the catalog. */
export type Side = "catalog" | "file";

export type Approvals = {
  kinds: string[];
  files: Record<string, string[]>;
  file_wins_kinds?: string[];
  file_wins_files?: Record<string, string[]>;
  updated_at?: string | null;
  updated_by?: string | null;
};

export type Review = { approvals: Approvals; differences: ReconcileDifference[] };

/** Every kind the reconcile files a difference under, in the order the page
 * shows them, with what each means. */
export const KINDS: { kind: string; label: string; means: string }[] = [
  { kind: "case_punctuation", label: "Case or punctuation", means: "The same text but for case, spacing or punctuation." },
  { kind: "featured_moved", label: "Featured artist moved", means: "A featured artist in the title instead of the artist, or the other way round." },
  { kind: "artist_joiner", label: "Artists joined differently", means: "The same artists in the same order, joined differently (\"A & B\" against \"A, B\")." },
  { kind: "version_brackets", label: "Version brackets", means: "The same title and version, in other brackets or after a dash." },
  { kind: "genre_remapped", label: "Genre remapped", means: "The file's genre is an older value or placed differently; the catalog's is the mapped vocabulary." },
  { kind: "genre_filled", label: "Genre filled", means: "The file has no genre and the catalog has one." },
  { kind: "year_filled", label: "Year filled", means: "The file has no year and the catalog has one." },
  { kind: "year_earlier", label: "Earlier year", means: "The catalog's year is older than the file's." },
  { kind: "year_later", label: "Later year", means: "The file's year is older than the catalog's. To keep the older year, approve it for the file: the older year goes up to the catalog." },
  { kind: "year_differs", label: "Year not a number", means: "A year that is not a number, so neither is older." },
  { kind: "bpm_rounding", label: "BPM rounding", means: "Less than 1.5 BPM apart." },
  { kind: "bpm_differs", label: "BPM differs", means: "1.5 BPM or more apart." },
  { kind: "label_differs", label: "Label differs", means: "A different record label." },
  { kind: "fill_up", label: "Fill up the catalog", means: "The file has a value the catalog leaves empty; approved, it goes up to the catalog and the file is not written." },
  { kind: "other", label: "Other", means: "Anything else. Approved one file and field at a time." },
];

/** The kinds that can be approved for the file (the API's
 * RECONCILE_FILE_WINS_KINDS): not those where the file has no value, not
 * fill_up (already the file's value going up), and not other, which is
 * approved file by file. */
export const FILE_WINS_KINDS: ReadonlySet<string> = new Set([
  "case_punctuation",
  "featured_moved",
  "artist_joiner",
  "version_brackets",
  "genre_remapped",
  "year_earlier",
  "year_later",
  "year_differs",
  "bpm_rounding",
  "bpm_differs",
  "label_differs",
]);

/** Whether a difference can be approved for the file: a kind the file's
 * side takes, or an "other" field that is not the file's catalog link. */
export function fileCanWin(kind: string, field?: string): boolean {
  if (kind === "other") return field !== "catalog_id";
  return FILE_WINS_KINDS.has(kind);
}

/** A kind's label; the kind itself when the page does not know it. */
export function kindLabel(kind: string): string {
  return KINDS.find((k) => k.kind === kind)?.label ?? kind;
}

/** The differences grouped by kind, in the page's order; kinds with none
 * are left out, and kinds the page does not know come last. */
export function byKind(diffs: ReconcileDifference[]): { kind: string; diffs: ReconcileDifference[] }[] {
  const groups = new Map<string, ReconcileDifference[]>();
  for (const d of diffs) {
    const list = groups.get(d.kind) ?? [];
    list.push(d);
    groups.set(d.kind, list);
  }
  const order = KINDS.map((k) => k.kind);
  return [...groups.keys()]
    .sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib) || a.localeCompare(b);
    })
    .map((kind) => ({ kind, diffs: groups.get(kind)! }));
}

/** Which side a whole kind is approved for, or null when it is not. */
export function kindSide(approvals: Approvals, kind: string): Side | null {
  if (approvals.kinds.includes(kind)) return "catalog";
  if ((approvals.file_wins_kinds ?? []).includes(kind)) return "file";
  return null;
}

/** Which side ``approvals`` let win for a difference: by its kind, or for
 * "other" by its file and field (as the reconcile's write run reads them);
 * null when it is not approved. */
export function sideOf(approvals: Approvals, d: ReconcileDifference): Side | null {
  if (d.kind !== "other") return kindSide(approvals, d.kind);
  if ((approvals.files[d.drive_file_id] ?? []).includes(d.field)) return "catalog";
  if ((approvals.file_wins_files?.[d.drive_file_id] ?? []).includes(d.field)) return "file";
  return null;
}

/** Whether ``approvals`` cover a difference, for either side. */
export function covers(approvals: Approvals, d: ReconcileDifference): boolean {
  return sideOf(approvals, d) !== null;
}

/** The approvals with a whole kind approved for ``side``, or taken back
 * (null). A kind is approved one way only; "other" is never approved as a
 * kind, and a kind the file's side does not take is not approved for it. */
export function withKindSide(approvals: Approvals, kind: string, side: Side | null): Approvals {
  if (kind === "other") return approvals;
  if (side === "file" && !fileCanWin(kind)) return approvals;
  const kinds = approvals.kinds.filter((k) => k !== kind);
  const fileKinds = (approvals.file_wins_kinds ?? []).filter((k) => k !== kind);
  if (side === "catalog") kinds.push(kind);
  if (side === "file") fileKinds.push(kind);
  return { ...approvals, kinds, file_wins_kinds: fileKinds };
}

/** The approvals with a whole kind approved for the catalog or taken back. */
export function withKind(approvals: Approvals, kind: string, on: boolean): Approvals {
  return withKindSide(approvals, kind, on ? "catalog" : null);
}

function withField(
  files: Record<string, string[]>,
  fileId: string,
  field: string,
  on: boolean,
): Record<string, string[]> {
  const fields = (files[fileId] ?? []).filter((f) => f !== field);
  if (on) fields.push(field);
  const next = { ...files };
  if (fields.length) next[fileId] = fields;
  else delete next[fileId];
  return next;
}

/** The approvals with one file's field approved for ``side``, or taken back
 * (null); a file left with no fields is dropped. The file's catalog link is
 * never approved for the file. */
export function withFileSide(
  approvals: Approvals,
  fileId: string,
  field: string,
  side: Side | null,
): Approvals {
  if (side === "file" && !fileCanWin("other", field)) return approvals;
  return {
    ...approvals,
    files: withField(approvals.files, fileId, field, side === "catalog"),
    file_wins_files: withField(approvals.file_wins_files ?? {}, fileId, field, side === "file"),
  };
}

/** The approvals with one file's field approved for the catalog or taken back. */
export function withFile(approvals: Approvals, fileId: string, field: string, on: boolean): Approvals {
  return withFileSide(approvals, fileId, field, on ? "catalog" : null);
}

function sortedFiles(files: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of Object.keys(files).sort()) {
    const fields = [...new Set(files[id])].sort();
    if (fields.length) out[id] = fields;
  }
  return out;
}

/** The body of PUT /v1/catalog/library/reconcile/approvals: both sides'
 * kinds and each file's fields sorted, so an unchanged draft compares
 * equal. */
export function approvalsBody(approvals: Approvals): {
  kinds: string[];
  files: Record<string, string[]>;
  file_wins_kinds: string[];
  file_wins_files: Record<string, string[]>;
} {
  return {
    kinds: [...new Set(approvals.kinds)].sort(),
    files: sortedFiles(approvals.files),
    file_wins_kinds: [...new Set(approvals.file_wins_kinds ?? [])].sort(),
    file_wins_files: sortedFiles(approvals.file_wins_files ?? {}),
  };
}

/** Whether the draft differs from what the API holds. */
export function changed(saved: Approvals, draft: Approvals): boolean {
  return JSON.stringify(approvalsBody(saved)) !== JSON.stringify(approvalsBody(draft));
}

/** The approved kinds, for either side, with no open difference now: the
 * page still lists them, so they can be taken back. */
export function idleKinds(approvals: Approvals, diffs: ReconcileDifference[]): string[] {
  const open = new Set(diffs.map((d) => d.kind));
  const approved = [...approvals.kinds, ...(approvals.file_wins_kinds ?? [])];
  return [...new Set(approved)].filter((k) => !open.has(k)).sort();
}

/** How the page words a side. */
export function sideLabel(side: Side | null): string {
  if (side === "catalog") return "Catalog wins";
  if (side === "file") return "File wins";
  return "Not decided";
}

/** A file's or the catalog's value as the page shows it; empty is "(empty)". */
export function shown(value: string): string {
  return value === "" ? "(empty)" : value;
}

/** A path's last part: the file's name. */
export function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}
