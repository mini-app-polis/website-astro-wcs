// The unidentified-files page's guesses and request body. Runs on Node's
// built-in type stripping (Node >= 22.18).

import { test } from "node:test";
import assert from "node:assert/strict";
import { entryBody, guessFromPath, startingParts, tagsText } from "../../src/lib/unidentified.ts";

test("a guess reads 'Title - Artist' names", () => {
  assert.deepEqual(guessFromPath("Pop/Temple - Thomas Gold.mp3"), {
    title: "Temple",
    artist: "Thomas Gold",
  });
});

test("a guess reads the library's title_artist names, without a copy suffix", () => {
  assert.deepEqual(guessFromPath("Pop/9to5_kellyclarkson (1).mp3"), {
    title: "9to5",
    artist: "kellyclarkson",
  });
});

test("a name with nothing to split is the title", () => {
  assert.deepEqual(guessFromPath("Pop/mystery.mp3"), { title: "mystery", artist: "" });
});

test("the entry leaves out empty fields and sends numbers", () => {
  assert.deepEqual(
    entryBody({
      title: " Temple ",
      artist: "Thomas Gold",
      remix: "",
      genre: "House",
      bpm: "124",
      release_year: "2019",
      label: "",
    }),
    { title: "Temple", artist: "Thomas Gold", genre: "House", bpm: 124, release_year: 2019 },
  );
});

test("the form starts from the file's tags, then its name", () => {
  const parts = startingParts("Pop/temple_thomasgold.mp3", { title: "Temple", bpm: "124" });
  assert.equal(parts.title, "Temple");
  assert.equal(parts.artist, "thomasgold");
  assert.equal(parts.bpm, "124");
  assert.equal(startingParts("Pop/a_b.mp3", null).title, "a");
});

test("tags read as one line, and none when empty", () => {
  assert.equal(tagsText({ title: "Temple", artist: "T. Gold", bpm: "124" }), "Temple — T. Gold · 124 BPM");
  assert.equal(tagsText({}), "none");
});
