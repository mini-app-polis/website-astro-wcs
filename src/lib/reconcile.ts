// What the reconcile review page shows and sends, kept apart from the
// component so it can be tested without a browser. The API holds the
// differences each reconcile run reports and the owner's approvals, and
// decides who may see and change them (catalog.tracks.write); this only lays
// them out and builds the approvals the page saves.

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
};

export type Approvals = {
  kinds: string[];
  files: Record<string, string[]>;
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
  { kind: "year_later", label: "Later year", means: "The file's year is older than the catalog's. Leave unapproved to keep the older year." },
  { kind: "year_differs", label: "Year not a number", means: "A year that is not a number, so neither is older." },
  { kind: "bpm_rounding", label: "BPM rounding", means: "Less than 1.5 BPM apart." },
  { kind: "bpm_differs", label: "BPM differs", means: "1.5 BPM or more apart." },
  { kind: "label_differs", label: "Label differs", means: "A different record label." },
  { kind: "fill_up", label: "Fill up the catalog", means: "The file has a value the catalog leaves empty; approved, it goes up to the catalog and the file is not written." },
  { kind: "other", label: "Other", means: "Anything else. Approved one file and field at a time." },
];

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

/** Whether ``approvals`` cover a difference: its kind, or for "other" its
 * file and field (as the reconcile's write run reads them). */
export function covers(approvals: Approvals, d: ReconcileDifference): boolean {
  if (d.kind === "other") return (approvals.files[d.drive_file_id] ?? []).includes(d.field);
  return approvals.kinds.includes(d.kind);
}

/** The approvals with a whole kind approved or taken back. "other" is never
 * approved as a kind. */
export function withKind(approvals: Approvals, kind: string, on: boolean): Approvals {
  if (kind === "other") return approvals;
  const kinds = approvals.kinds.filter((k) => k !== kind);
  if (on) kinds.push(kind);
  return { ...approvals, kinds };
}

/** The approvals with one file's field approved or taken back; a file left
 * with no fields is dropped. */
export function withFile(approvals: Approvals, fileId: string, field: string, on: boolean): Approvals {
  const fields = (approvals.files[fileId] ?? []).filter((f) => f !== field);
  if (on) fields.push(field);
  const files = { ...approvals.files };
  if (fields.length) files[fileId] = fields;
  else delete files[fileId];
  return { ...approvals, files };
}

/** The body of PUT /v1/catalog/library/reconcile/approvals: kinds and each
 * file's fields sorted, so an unchanged draft compares equal. */
export function approvalsBody(approvals: Approvals): { kinds: string[]; files: Record<string, string[]> } {
  const files: Record<string, string[]> = {};
  for (const id of Object.keys(approvals.files).sort()) {
    const fields = [...new Set(approvals.files[id])].sort();
    if (fields.length) files[id] = fields;
  }
  return { kinds: [...new Set(approvals.kinds)].sort(), files };
}

/** Whether the draft differs from what the API holds. */
export function changed(saved: Approvals, draft: Approvals): boolean {
  return JSON.stringify(approvalsBody(saved)) !== JSON.stringify(approvalsBody(draft));
}

/** The approved kinds with no open difference now: the page still lists
 * them, so they can be taken back. */
export function idleKinds(approvals: Approvals, diffs: ReconcileDifference[]): string[] {
  const open = new Set(diffs.map((d) => d.kind));
  return approvals.kinds.filter((k) => !open.has(k)).sort();
}

/** A file's or the catalog's value as the page shows it; empty is "(empty)". */
export function shown(value: string): string {
  return value === "" ? "(empty)" : value;
}

/** A path's last part: the file's name. */
export function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}
