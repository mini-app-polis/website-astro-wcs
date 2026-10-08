// Plumbing for the live contract suite (TEST-016): configuration, the guard
// that keeps it off production, and the assertions every test uses.
//
// The suite is this site's expectations of api-kaianolevine-com — the
// endpoints it calls, the fields it reads from each, and the access rules it
// relies on — checked against the deployed development API. It only reads:
// the one write endpoint the site uses (POST /v1/contact) is called without a
// Turnstile token, so the API refuses it before anything is sent or stored.
// Being read-only it needs no key and does not share the contract-dev-kaiano-api
// concurrency group with the suites that write (CD-033).
//
// It still never points at production. Under kaianolevine.com only the hosts
// in ALLOWED_DEV_HOSTS are called, so a production host added later is refused
// without a change here — the same guard as common-python-utils' harness.
//
// Configuration: CONTRACT_API_URL, the development API's base URL. contract.yml
// defaults it to https://dev-api.kaianolevine.com. A local API on
// http://localhost works too, for running the suite by hand.

import assert from "node:assert/strict";

const PRODUCTION_DOMAIN = "kaianolevine.com";
const ALLOWED_DEV_HOSTS = new Set(["dev-api.kaianolevine.com"]);

function resolveApiUrl() {
  const raw = (process.env.CONTRACT_API_URL ?? "").trim();
  if (!raw) {
    throw new Error("CONTRACT_API_URL is not set — point it at the development API.");
  }
  const url = new URL(raw);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !local) {
    throw new Error(`CONTRACT_API_URL must be https (or a local API), got ${url.protocol}`);
  }
  const host = url.hostname;
  const underProduction = host === PRODUCTION_DOMAIN || host.endsWith(`.${PRODUCTION_DOMAIN}`);
  if (underProduction && !ALLOWED_DEV_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run against ${host}: only ${[...ALLOWED_DEV_HOSTS].join(", ")} ` +
        `may be called under ${PRODUCTION_DOMAIN}.`,
    );
  }
  return url.origin;
}

export const API = resolveApiUrl();

/** Call the API. Returns the status, headers and parsed JSON body (or null). */
export async function call(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  const type = res.headers.get("content-type") ?? "";
  let body = null;
  if (type.includes("json")) {
    body = await res.json();
  } else {
    await res.body?.cancel();
  }
  return { status: res.status, headers: res.headers, body };
}

/** A 200 in the success envelope. Returns `data`. */
export function expectData(res, path) {
  assert.equal(res.status, 200, `${path} answered ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(res.body && typeof res.body === "object", `${path} did not answer JSON`);
  assert.ok("data" in res.body, `${path} answered without the success envelope's data`);
  return res.body.data;
}

/** An error in the error envelope, with the given status (and code, if given). */
export function expectError(res, path, status, code) {
  assert.equal(res.status, status, `${path} answered ${res.status}, not ${status}`);
  assert.equal(
    typeof res.body?.error?.code,
    "string",
    `${path} answered ${status} without the error envelope: ${JSON.stringify(res.body)}`,
  );
  if (code) assert.equal(res.body.error.code, code, `${path} error code`);
  return res.body.error;
}

/**
 * Dev may lack configuration production has (a GitHub token, a resume file, a
 * published catalog). The site treats any non-OK answer as "unavailable" and
 * renders without the panel, so a documented not-provisioned error is part of
 * the contract too: it must arrive in the error envelope with its code. Returns
 * true if that is what came back, so the caller can skip the shape checks.
 */
export function notProvisioned(t, res, path, status, code) {
  if (res.status !== status) return false;
  expectError(res, path, status, code);
  t.skip(`${path}: ${code} on dev`);
  return true;
}

const TYPES = {
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  boolean: (v) => typeof v === "boolean",
  array: (v) => Array.isArray(v),
  object: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
  null: (v) => v === null,
};

/**
 * Check the fields the site reads. `shape` maps a field to a type, or to
 * several joined by "|" ("string|null"). A field marked optional with a
 * trailing "?" may be absent.
 */
export function expectShape(value, shape, where) {
  assert.ok(TYPES.object(value), `${where} is not an object: ${JSON.stringify(value)}`);
  for (const [rawField, spec] of Object.entries(shape)) {
    const optional = rawField.endsWith("?");
    const field = optional ? rawField.slice(0, -1) : rawField;
    if (!(field in value)) {
      assert.ok(optional, `${where} has no ${field}`);
      continue;
    }
    const allowed = spec.split("|");
    assert.ok(
      allowed.some((type) => TYPES[type](value[field])),
      `${where}.${field} should be ${spec}, got ${JSON.stringify(value[field])}`,
    );
  }
}

/** A list endpoint's data: an array, every row checked. Empty is allowed. */
export function expectRows(t, data, shape, where) {
  assert.ok(Array.isArray(data), `${where} data is not an array`);
  if (data.length === 0) t.diagnostic(`${where}: no rows on dev, so row shape is unchecked`);
  data.forEach((row, i) => expectShape(row, shape, `${where}[${i}]`));
  return data;
}
