// The duplicates page's choices: every file is kept, given its own version or
// trashed; a labelled different edit defaults to its own version; trashing a
// different edit needs its own confirmation; and no choice leaves the entry
// with no file in the library. Runs on Node's built-in type stripping
// (Node >= 22.18).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowed,
  differentEditsTrashed,
  initialChoices,
  keptTogether,
  megabytes,
  minutes,
  problems,
  reasonsText,
  resolveBody,
  shownPath,
} from "../../src/lib/duplicates.ts";

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

test("every file starts on the entry, a labelled different edit as its own version", () => {
  const g = { ...group, files: [...group.files, file("clean", { kept_on_purpose: true, why_kept: "Clean", edit_label: "Clean" })] };
  const choices = initialChoices(g);
  assert.deepEqual(choices.a, { outcome: "keep", version: "" });
  assert.deepEqual(choices.edit, { outcome: "keep", version: "" });
  assert.deepEqual(choices.clean, { outcome: "own_version", version: "Clean" });
});

test("keeping every file keeps the group together", () => {
  const choices = initialChoices(group);
  assert.equal(keptTogether(group, choices), true);
  assert.deepEqual(resolveBody(group, choices), {
    outcomes: ["a", "b", "c", "edit"].map((id) => ({ drive_file_id: id, outcome: "keep" })),
  });
});

test("an own version sends its typed text, trimmed", () => {
  const choices = { ...initialChoices(group), b: { outcome: "own_version", version: " Club Mix " }, c: { outcome: "trash", version: "" } };
  assert.equal(keptTogether(group, choices), false);
  assert.deepEqual(resolveBody(group, choices).outcomes.slice(1, 3), [
    { drive_file_id: "b", outcome: "own_version", version: "Club Mix" },
    { drive_file_id: "c", outcome: "trash" },
  ]);
});

test("an own version needs its text", () => {
  const choices = { ...initialChoices(group), b: { outcome: "own_version", version: "  " } };
  assert.match(problems(group, choices)[0], /Type the version/);
  assert.throws(() => resolveBody(group, choices));
});

test("trashing a different edit takes its own confirmation", () => {
  const choices = { ...initialChoices(group), edit: { outcome: "trash", version: "" } };
  assert.deepEqual(differentEditsTrashed(group, choices).map((f) => f.drive_file_id), ["edit"]);
  assert.throws(() => resolveBody(group, choices));
  assert.equal(resolveBody(group, choices, true).confirm_different_edit, true);
});

test("no choice leaves the entry with no file in the library", () => {
  const two = { ...group, files: [file("a"), file("b", { present: false })] };
  const choices = initialChoices(two);
  // b is gone from the library, so a is the only file that can hold the entry.
  assert.equal(allowed(two, choices, "a", "trash"), false);
  assert.equal(allowed(two, choices, "a", "own_version"), false);
  assert.equal(allowed(two, choices, "b", "trash"), true);
  const none = { a: { outcome: "trash", version: "" }, b: { outcome: "keep", version: "" } };
  assert.match(problems(two, none)[0], /Keep at least one file/);
  assert.throws(() => resolveBody(two, none));
});

test("reasons, lengths and sizes read plainly", () => {
  assert.equal(reasonsText(group.reasons), "the same catalog entry, the same name in one folder");
  assert.equal(minutes(132.4), "2:12");
  assert.equal(minutes(null), "—");
  assert.equal(megabytes(8_400_000), "8.4 MB");
});

test("a registered path is shown from its library's root", () => {
  assert.equal(shownPath(file("x", { path: "Top.mp3" })), "/Top.mp3");
  assert.equal(shownPath(file("x", { path: "House/x.mp3" })), "/House/x.mp3");
  assert.equal(shownPath(file("x", { path: "/New Music/x.mp3" })), "/New Music/x.mp3");
  assert.equal(shownPath(file("x", { path: null })), "x");
});
