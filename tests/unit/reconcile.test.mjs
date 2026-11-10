// The reconcile review page's approvals: kinds approved whole (never
// "other"), other differences by file and field, each for the catalog or
// for the file, and the body the page saves. Runs on Node's built-in type stripping (Node >= 22.18).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approvalsBody,
  byKind,
  changed,
  covers,
  fileCanWin,
  idleKinds,
  kindLabel,
  kindSide,
  shown,
  sideLabel,
  sideOf,
  withFile,
  withFileSide,
  withKind,
  withKindSide,
} from "../../src/lib/reconcile.ts";

function diff(id, field, kind, extra = {}) {
  return {
    drive_file_id: id,
    path: `Pop/${id}.mp3`,
    field,
    kind,
    file_value: "a",
    catalog_value: "b",
    run_id: "r1",
    reported_at: "2026-11-07T00:00:00Z",
    catalog_id: "c1",
    approved: false,
    ...extra,
  };
}

const none = { kinds: [], files: {} };

test("differences are grouped in the page's kind order, unknown kinds last", () => {
  const groups = byKind([
    diff("a", "title", "other"),
    diff("b", "year", "year_later"),
    diff("c", "genre", "brand_new"),
    diff("d", "bpm", "bpm_rounding"),
    diff("e", "year", "year_later"),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.kind, g.diffs.length]),
    [
      ["year_later", 2],
      ["bpm_rounding", 1],
      ["other", 1],
      ["brand_new", 1],
    ],
  );
});

test("a kind covers its differences; other is covered only by file and field", () => {
  const approvals = { kinds: ["bpm_rounding", "other"], files: { a: ["title"] } };
  assert.equal(covers(approvals, diff("x", "bpm", "bpm_rounding")), true);
  assert.equal(covers(approvals, diff("a", "title", "other")), true);
  assert.equal(covers(approvals, diff("a", "artist", "other")), false);
  assert.equal(covers(approvals, diff("b", "title", "other")), false);
});

test("approving and taking back a kind, never other as a kind", () => {
  const on = withKind(none, "genre_remapped", true);
  assert.deepEqual(on.kinds, ["genre_remapped"]);
  assert.deepEqual(withKind(on, "genre_remapped", false).kinds, []);
  assert.deepEqual(withKind(none, "other", true).kinds, []);
});

test("a file's fields are approved one at a time and an empty file is dropped", () => {
  let a = withFile(none, "f1", "title", true);
  a = withFile(a, "f1", "artist", true);
  assert.deepEqual(a.files, { f1: ["title", "artist"] });
  a = withFile(a, "f1", "title", false);
  a = withFile(a, "f1", "artist", false);
  assert.deepEqual(a.files, {});
});

test("the saved body is sorted, so the same approvals compare unchanged", () => {
  const draft = { kinds: ["year_filled", "fill_up", "fill_up"], files: { b: ["title"], a: ["year", "artist"], c: [] } };
  assert.deepEqual(approvalsBody(draft), {
    kinds: ["fill_up", "year_filled"],
    files: { a: ["artist", "year"], b: ["title"] },
    file_wins_kinds: [],
    file_wins_files: {},
  });
  const saved = { kinds: ["fill_up", "year_filled"], files: { a: ["artist", "year"], b: ["title"] }, updated_at: "x" };
  assert.equal(changed(saved, draft), false);
  assert.equal(changed(saved, withKind(draft, "bpm_rounding", true)), true);
});

test("approved kinds with nothing open are still listed to take back", () => {
  const approvals = { kinds: ["fill_up", "genre_filled", "bpm_rounding"], files: {} };
  assert.deepEqual(idleKinds(approvals, [diff("a", "bpm", "bpm_rounding")]), ["fill_up", "genre_filled"]);
});

test("values and kinds as the page words them", () => {
  assert.equal(shown(""), "(empty)");
  assert.equal(shown("2020"), "2020");
  assert.equal(kindLabel("year_later"), "Later year");
  assert.equal(kindLabel("brand_new"), "brand_new");
});

test("a kind or a file's field is approved for one side at a time", () => {
  let a = withKindSide(none, "year_later", "file");
  assert.equal(kindSide(a, "year_later"), "file");
  assert.deepEqual([a.kinds, a.file_wins_kinds], [[], ["year_later"]]);
  a = withKindSide(a, "year_later", "catalog");
  assert.deepEqual([a.kinds, a.file_wins_kinds], [["year_later"], []]);
  a = withKindSide(a, "year_later", null);
  assert.equal(kindSide(a, "year_later"), null);

  let f = withFileSide(none, "f1", "artist", "file");
  assert.equal(sideOf(f, diff("f1", "artist", "other")), "file");
  f = withFileSide(f, "f1", "artist", "catalog");
  assert.deepEqual([f.files, f.file_wins_files], [{ f1: ["artist"] }, {}]);
  f = withFileSide(f, "f1", "artist", null);
  assert.deepEqual([f.files, f.file_wins_files], [{}, {}]);
});

test("the file cannot win where it has nothing to send up", () => {
  for (const kind of ["fill_up", "year_filled", "genre_filled", "other"]) {
    assert.equal(withKindSide(none, kind, "file"), none);
  }
  assert.equal(fileCanWin("year_later"), true);
  assert.equal(fileCanWin("other", "title"), true);
  assert.equal(fileCanWin("other", "catalog_id"), false);
  assert.equal(withFileSide(none, "f1", "catalog_id", "file"), none);
});

test("a difference approved for the file is covered, and saved under the file's side", () => {
  const draft = {
    kinds: ["genre_remapped"],
    files: {},
    file_wins_kinds: ["year_later", "bpm_differs"],
    file_wins_files: { b: ["title"], a: ["artist", "artist"] },
  };
  assert.equal(covers(draft, diff("x", "year", "year_later")), true);
  assert.equal(covers(draft, diff("a", "artist", "other")), true);
  assert.equal(covers(draft, diff("a", "title", "other")), false);
  assert.deepEqual(approvalsBody(draft), {
    kinds: ["genre_remapped"],
    files: {},
    file_wins_kinds: ["bpm_differs", "year_later"],
    file_wins_files: { a: ["artist"], b: ["title"] },
  });
});

test("kinds approved for the file with nothing open are still listed", () => {
  const approvals = { kinds: ["fill_up"], files: {}, file_wins_kinds: ["year_later"] };
  assert.deepEqual(idleKinds(approvals, []), ["fill_up", "year_later"]);
  assert.equal(sideLabel("file"), "File wins");
  assert.equal(sideLabel(null), "Not decided");
});
