// The duplicates page's plan: the keeper must be one of the copies, the other
// copies go to the trash, and a file kept on purpose never does. Runs on
// Node's built-in type stripping (Node >= 22.18).

import { test } from "node:test";
import assert from "node:assert/strict";
import { megabytes, minutes, plan, reasonsText, resolveBody, split } from "../../src/lib/duplicates.ts";

function file(id, extra = {}) {
  return {
    drive_file_id: id,
    path: `Pop/${id}.mp3`,
    size_bytes: 8_000_000,
    duration_secs: 200,
    bitrate_kbps: null,
    edit_label: null,
    present: true,
    trash_requested: false,
    kept_on_purpose: false,
    why_kept: null,
    catalog_id: "c1",
    title: "Song",
    artist: "Artist",
    play_count: 3,
    ...extra,
  };
}

const group = {
  id: "g1",
  library_root_id: "root",
  key: "same_catalog_id:abc",
  reasons: ["same_catalog_id", "same_name"],
  status: "open",
  keeper_drive_file_id: null,
  reported_at: "2026-11-07T00:00:00Z",
  resolved_at: null,
  files: [
    file("a"),
    file("b"),
    file("c"),
    file("edit", { kept_on_purpose: true, why_kept: "a different edit (2:12 against 3:20)" }),
  ],
};

test("files kept on purpose are shown apart", () => {
  const { copies, kept } = split(group);
  assert.deepEqual(copies.map((f) => f.drive_file_id), ["a", "b", "c"]);
  assert.deepEqual(kept.map((f) => f.drive_file_id), ["edit"]);
});

test("resolving keeps one copy and trashes the others, never a kept file", () => {
  assert.deepEqual(resolveBody(group, "b"), {
    keeper_drive_file_id: "b",
    trash_drive_file_ids: ["a", "c"],
  });
});

test("a file kept on purpose cannot be the keeper of the copies", () => {
  assert.equal(plan(group, "edit"), null);
  assert.equal(plan(group, "nope"), null);
  assert.throws(() => resolveBody(group, "edit"));
});

test("reasons, lengths and sizes read plainly", () => {
  assert.equal(reasonsText(group.reasons), "the same catalog entry, the same name in one folder");
  assert.equal(minutes(132.4), "2:12");
  assert.equal(minutes(null), "—");
  assert.equal(megabytes(8_400_000), "8.4 MB");
});
