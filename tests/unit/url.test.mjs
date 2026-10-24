// safeUrl() is the scheme check for hrefs built from API data. Runs on
// Node's built-in type stripping (Node >= 22.18).

import { test } from "node:test";
import assert from "node:assert/strict";
import { safeUrl } from "../../src/lib/url.ts";

test("safeUrl returns http and https URLs unchanged", () => {
  assert.equal(safeUrl("https://open.spotify.com/playlist/x"), "https://open.spotify.com/playlist/x");
  assert.equal(safeUrl("http://example.com/a?b=1#c"), "http://example.com/a?b=1#c");
});

test("safeUrl trims surrounding whitespace", () => {
  assert.equal(safeUrl("  https://example.com  "), "https://example.com");
});

test("safeUrl rejects script and data schemes, whatever their case", () => {
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("JavaScript:alert(1)"), null);
  assert.equal(safeUrl(" javascript:alert(1)"), null);
  assert.equal(safeUrl("data:text/html,<script>alert(1)</script>"), null);
  assert.equal(safeUrl("vbscript:msgbox(1)"), null);
});

test("safeUrl rejects relative and malformed input", () => {
  assert.equal(safeUrl("/repos/x"), null);
  assert.equal(safeUrl("//evil.example/x"), null);
  assert.equal(safeUrl("github.com/x"), null);
  assert.equal(safeUrl("https://"), null);
  assert.equal(safeUrl(""), null);
});

test("safeUrl rejects null, undefined and non-strings", () => {
  assert.equal(safeUrl(null), null);
  assert.equal(safeUrl(undefined), null);
  assert.equal(safeUrl(42), null);
});
