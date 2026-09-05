/**
 * Client-side session helpers.
 *
 * These answer exactly one question — "is there a signed-in user, and what is
 * their live token?" — and deliberately answer no others.
 *
 * Authentication is Clerk's. Authorization is the API's. Nothing here decides
 * whether the caller may do something: a client that reads its own roles and
 * concludes "I am an admin" has reimplemented the role-to-scope mapping in the
 * browser, which is a second, unaudited copy of a policy that lives in
 * api.kaianolevine.com. That copy is what drifts. `is_admin` on the profile is
 * the previous generation of exactly that mistake — it seeds a person's first
 * grant and decides nothing afterwards, but pages went on gating with it.
 *
 * So pages here render, call the API, and treat the API's 403 as the answer.
 * The decision is made once, at the enforcement point, and audited there.
 */

const CLERK_TIMEOUT_MS = 8000;

type ClerkLike = {
  loaded?: boolean;
  load?: () => Promise<unknown>;
  session?: { getToken: () => Promise<string | null> } | null;
};

function clerk(): ClerkLike | undefined {
  return (globalThis as { Clerk?: ClerkLike }).Clerk;
}

/** Resolve once Clerk has loaded, or null if it never does. */
export async function waitForClerk(
  timeoutMs = CLERK_TIMEOUT_MS,
): Promise<ClerkLike | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const c = clerk();
    if (c?.loaded) return c;
    if (c && typeof c.load === "function") {
      try {
        await c.load();
        if (c.loaded) return c;
      } catch {
        // Fall through to the retry loop; a failed load is not fatal here.
      }
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

/**
 * A live Clerk session token, or null when signed out.
 *
 * Always fetched fresh rather than read from a cookie. Clerk session JWTs last
 * about 60 seconds, and reading a stale one is what the deleted SSR middleware
 * existed to work around — it issued a 307 handshake to refresh a cookie the
 * server had already read too late. Asking Clerk for the token client-side
 * cannot be stale, so that whole problem stops existing.
 */
export async function getSessionToken(): Promise<string | null> {
  const c = await waitForClerk();
  if (!c?.session) return null;
  try {
    return await c.session.getToken();
  } catch {
    return null;
  }
}

/**
 * Ensure the caller has a WCS profile and principal.
 *
 * POST /v1/wcs/me is the bootstrap: it is authenticated but unscoped, because
 * requiring a permission to become known would mean needing a principal in
 * order to be granted one. New people are provisioned with `wcs-reader`.
 *
 * Identity fields come from the verified token, so nothing is sent in the body.
 */
export async function ensureProfile(
  apiBase: string,
  token: string,
): Promise<void> {
  try {
    await fetch(`${apiBase.replace(/\/$/, "")}/v1/wcs/me`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
  } catch {
    // Provisioning is best-effort. If it fails the API will answer the next
    // request on its own terms, which is the decision that matters anyway.
  }
}

/**
 * Gate a page on being signed in, and nothing more.
 *
 * Returns a live token, or redirects to /sign-in and never resolves. This is
 * an authentication check: it asks Clerk whether anyone is here, not the API
 * whether they are allowed. Pages that need authorization get it from the
 * status of the calls they make.
 */
export async function requireSession(apiBase?: string): Promise<string> {
  // Defaults to the base URL Base.astro puts on <html>, which is the one
  // source every page already agrees on. Passing it explicitly was a footgun:
  // pages name that variable differently, and naming the wrong one threw a
  // ReferenceError at the top of the module, which killed the whole script and
  // left the page showing "Loading…" forever.
  // `||`, not `??`. Callers pass `root?.dataset.apiBase ?? ""` and getApiBase()
  // returns "" when unset, so `??` never fell through and this guard was inert.
  const base =
    apiBase ||
    (typeof document !== "undefined"
      ? (document.documentElement.dataset.apiUrl ?? "")
      : "");
  const token = await getSessionToken();
  if (!token) {
    location.replace("/sign-in");
    await new Promise(() => {});
  }
  await ensureProfile(base, token as string);
  return token as string;
}

/**
 * fetch, with the API's refusal routed somewhere sensible.
 *
 * This is not an authorization check. The call is made unconditionally and the
 * API decides; this only turns its decision into navigation, so a denied page
 * lands on /sign-in or / instead of rendering an empty error state. On a
 * denial it never resolves, because the page is on its way somewhere else.
 */
export async function guardedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 || res.status === 403) {
    handleDenial(res.status);
    await new Promise<never>(() => {});
  }
  return res;
}

/**
 * Send the caller somewhere sensible when the API refuses.
 *
 * 401 means the session went away — sign in again. 403 means the API decided
 * this person may not, which is the authoritative answer and the only one the
 * page ever gets. Anything else is left to the caller.
 */
export function handleDenial(status: number): boolean {
  if (status === 401) {
    location.replace("/sign-in");
    return true;
  }
  if (status === 403) {
    location.replace("/");
    return true;
  }
  return false;
}
