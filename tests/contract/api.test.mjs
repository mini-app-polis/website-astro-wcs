// What wcs.kaianolevine.com expects of api-kaianolevine-com (TEST-016).
//
// One test per call the site makes, asserting the fields the site reads —
// not the API's whole schema. When the site starts reading a new field, add
// it here; when it stops, remove it. See harness.mjs for the guard and why
// this suite is read-only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { call, expectData, expectError, expectRows, expectShape } from "./harness.mjs";

// src/lib/api.ts SetListItem — SetsList.astro reads id, set_date, venue, track_count.
const SET = {
  id: "string",
  set_date: "string",
  year: "number",
  venue: "string",
  source_file: "string|null",
  "track_count?": "number",
};

// pages/sets/detail.astro reads title, artist, bpm, genre, length_secs.
const TRACK = {
  title: "string",
  artist: "string",
  bpm: "number|null",
  genre: "string|null",
  length_secs: "number|null",
};

test("GET /v1/stats/overview — StatsBar", async () => {
  const path = "/v1/stats/overview";
  expectShape(expectData(await call(path), path), {
    total_sets: "number",
    total_plays: "number",
    unique_tracks: "number",
    years_active: "number",
    most_played_artist: "string|null",
  }, path);
});

test("GET /v1/stats/top-artists — TopArtists", async (t) => {
  const path = "/v1/stats/top-artists?limit=15";
  const rows = expectRows(t, expectData(await call(path), path), {
    artist: "string",
    play_count: "number",
  }, path);
  assert.ok(rows.length <= 15, `${path} ignored limit (${rows.length} rows)`);
});

test("GET /v1/stats/top-tracks — TopTracks", async (t) => {
  const path = "/v1/stats/top-tracks?limit=20";
  const rows = expectRows(t, expectData(await call(path), path), {
    title: "string",
    artist: "string",
    play_count: "number",
  }, path);
  assert.ok(rows.length <= 20, `${path} ignored limit (${rows.length} rows)`);
});

test("GET /v1/stats/by-year", async (t) => {
  const path = "/v1/stats/by-year";
  expectRows(t, expectData(await call(path), path), {
    year: "number",
    set_count: "number",
    track_count: "number",
  }, path);
});

test("GET /v1/live-plays/recent — LiveHistory", async (t) => {
  const path = "/v1/live-plays/recent?limit=50";
  const rows = expectRows(t, expectData(await call(path), path), {
    id: "string",
    title: "string",
    artist: "string",
    played_at: "string",
  }, path);
  assert.ok(rows.length <= 50, `${path} ignored limit (${rows.length} rows)`);
});

test("GET /v1/sets — SetsList pages with limit, offset and year", async (t) => {
  const path = "/v1/sets?limit=5&offset=0";
  const rows = expectRows(t, expectData(await call(path), path), SET, path);
  assert.ok(rows.length <= 5, `${path} ignored limit (${rows.length} rows)`);

  if (rows.length > 0) {
    const year = rows[0].year;
    const byYear = `/v1/sets?limit=5&offset=0&year=${year}`;
    const filtered = expectRows(t, expectData(await call(byYear), byYear), SET, byYear);
    assert.ok(filtered.length > 0, `${byYear} returned nothing for a year /v1/sets has`);
    for (const row of filtered) assert.equal(row.year, year, `${byYear} returned a ${row.year} set`);
  }
});

test("GET /v1/sets/{id} — set detail page", async (t) => {
  const list = expectData(await call("/v1/sets?limit=1"), "/v1/sets");
  if (!Array.isArray(list) || list.length === 0) {
    t.skip("no sets on dev to fetch");
    return;
  }
  const path = `/v1/sets/${encodeURIComponent(list[0].id)}`;
  const set = expectData(await call(path), path);
  expectShape(set, { ...SET, tracks: "array" }, path);
  set.tracks.forEach((track, i) => expectShape(track, TRACK, `${path}.tracks[${i}]`));
});

test("GET /v1/sets/{id} — an unknown set is a 404, which the page shows as 'Set not found'", async () => {
  const path = "/v1/sets/00000000-0000-4000-8000-000000000000";
  expectError(await call(path), path, 404);
});

test("GET /v1/spotify/playlists — Spotify page", async (t) => {
  const path = "/v1/spotify/playlists";
  expectRows(t, expectData(await call(path), path), {
    name: "string",
    url: "string",
    tracks_total: "number",
  }, path);
});

// Access rules. The site's signed-in pages (notes, admin) depend on these
// refusing an anonymous caller with 401 in the error envelope — the Nav and
// session code read a 401 as "signed out". A 500 or a 200 here is a break.
for (const path of ["/v1/wcs/me", "/v1/wcs/wiki/sources", "/v1/wcs/wiki/admin/sources", "/v1/wcs/admin/users"]) {
  test(`GET ${path} without a token refuses with 401`, async () => {
    expectError(await call(path), path, 401);
  });
}

// The contact and survey forms POST JSON with these field names. Without a
// Turnstile token the API must refuse before verifying or sending anything.
// The origin check runs first, so a 403 is also a refusal; a 400 must name
// only the missing token, which proves the API still accepts the field
// names the forms send.
test("POST /v1/contact without a Turnstile token is refused, and accepts the form's field names", async () => {
  const path = "/v1/contact";
  const res = await call(path, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://wcs.kaianolevine.com" },
    body: JSON.stringify({
      type: "contact",
      originSite: "wcs.kaianolevine.com",
      website: "",
      firstName: "Contract",
      lastName: "Suite",
      replyTo: "contract-suite@example.com",
      message: "Contract suite probe — refused before sending.",
    }),
  });
  assert.ok(res.status === 400 || res.status === 403, `${path} answered ${res.status}, not a refusal`);
  const error = expectError(res, path, res.status);
  if (res.status === 400) {
    assert.equal(error.code, "validation_error");
    assert.deepEqual(error.details?.missing, ["turnstileToken"], `${path} did not accept the form's field names`);
  }
});
