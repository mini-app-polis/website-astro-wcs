# wcs: offloading auth to the API instead of moving to Workers

Scope for a decision. Nothing here is implemented.

## The question

The Astro 7 upgrade forces a hosting change, because `@astrojs/cloudflare` v11
was the last adapter release supporting Pages and every later version targets
Workers. `docs/WORKERS-MIGRATION.md` describes that move and it is ready to go.

This document scopes the alternative: delete the adapter, make the site fully
static on Pages like the other three sites, and let `api.kaianolevine.com` own
authentication outright.

The motivation is not the advisories — those are cleared either way. It is that
the adapter chains hosting to the framework version by peer dependency. Moving
to Workers keeps that chain; the next Astro major brings the same problem back.
Going static severs it permanently.

## Verdict

Worth doing. The refactor is mostly deletion, the replacement pattern already
runs in production, and the API endpoint it depends on already exists.

The strongest argument is not convenience, it is drift.

The site gates on `profile.is_admin`. In the identity work, `is_admin` seeds a
human's first grant and **is no longer authority — roles decide**. The API is
at 51 scope-guarded routes, 3 authenticated-only (`GET`/`POST /v1/wcs/me`,
`GET /v1/identity/whoami`, each circular if scoped) and 22 public, with the
privilege audit clean in both directions.

So the Astro gate is not merely duplicating the API's decision. It is asking a
question the model has stopped answering that way, and it will keep drifting:
every future scope or role change lands in the API and silently leaves this
site behind. The stated rationale for routing all writes through the API was
"authorization in one place"; this gate is the standing exception to it.

### The precondition, checked

Removing page-level gating is only safe if `/v1/wcs/*` enforces on its own. It
does. `/v1/wcs/admin/users`, `/v1/wcs/notes/all`, and the grants, corrections,
gaps and embeddings routes are all admin-scoped, and `wcs.corpus.read` is held
by `wcs-admin` and `corpus-reader` — never by `wcs-reader`, the default human
role. Deleting the page check removes a redundant gate, not a real one.

### What this is *not* an argument about

Secrets. `CLERK_SECRET_KEY` in a frontend using Clerk's server SDK for session
handling or profile reads is already recorded as a legitimate different use,
naming this site specifically. `CLERK_SECRET_KEY` and `CLERK_JWT_KEY` do both
leave the site under this refactor, and that is a simplification worth having —
but it is not the fix for a violation, and it should not carry the decision.

## What the site does server-side today

26 pages. 10 do request-time work; 8 of those authenticate.

The auth pages all open with the same ~25 lines of frontmatter:

```astro
const userId = await getAuthenticatedUserId(Astro.request, env);  // verifyToken
const sessionToken = getSessionToken(Astro.request);
if (!userId || !sessionToken) return Astro.redirect("/sign-in");

const clerkUserData = await getClerkUserData(userId, env);        // CLERK_SECRET_KEY -> api.clerk.com
const profile = await upsertWcsProfile(sessionToken, clerkUserData.email, ..., apiBase);
if (!profile?.is_admin) return Astro.redirect("/");
```

Everything below that frontmatter is markup and client script that already
runs in the browser and needs no server.

### The SSR auth path is already the unreliable one

`src/components/Nav.astro` carries a client-side admin reveal, in production,
with this comment:

> The SSR pass in Nav.astro tries to determine isAdmin via verifyToken + the
> WCS API. If the user's `__session` JWT is stale on the first request (Clerk
> JWTs are ~60s; the cookie often holds an expired one that the client
> refreshes only after the page loads), SSR sees isAdmin=false and renders the
> Admin menu items hidden. Once Clerk has loaded client-side it always has a
> fresh session, so here we re-check against `/v1/wcs/me` using a live token.

So the client path is already the authoritative one, and `src/middleware.ts`
(78 lines) exists only to paper over the staleness that server-side auth
introduces. Remove SSR auth and the problem it solves stops existing.

## What changes

| file | lines | change |
| --- | --- | --- |
| `src/middleware.ts` | 78 | **deleted.** Its only job is the Clerk handshake for stale SSR cookies. |
| `src/lib/auth.ts` | 149 | `getAuthenticatedUserId`, `getSessionToken`, `getClerkUserData` deleted. `getWcsProfile` kept — it is already a plain Bearer fetch and browser-safe. |
| 8 auth pages | ~25 lines of frontmatter each | frontmatter replaced by a shared client-side guard; bodies (174–458 lines each) untouched. |
| `src/pages/sets/[id].astro` | 45 | the only `export const prerender = false` in the repo. See open decision below. |
| `src/pages/survey/index.astro` | 164 | **no change needed.** Reads env only, and already falls back through `import.meta.env` to a hardcoded default. Works static as written. |
| `astro.config.mjs` | — | drop `adapter`, `output: "server"` becomes `"static"`, drop the `vite.ssr.external` node-builtins list. |
| `package.json` | — | drop `@astrojs/cloudflare` and `@clerk/backend`. |
| `wrangler.toml` | — | back to `pages_build_output_dir = "dist"`; drop the commented Workers route. |
| `.github/workflows/ci.yml` | — | add `security` to `release`'s `needs`; the build no longer needs Clerk keys. |

The frontmatter is not replaced by a client-side equivalent. It is deleted.

A guard that reads the caller's roles and concludes "I am an admin" has moved
the role-to-scope mapping into the browser — a second implementation of a
policy that lives in the API, and an unauthorised one, since it runs none of
the four contract functions and emits no audit. That is the same mistake as
gating on `is_admin`, with a fresher field. Copying a newer value is still
copying.

So pages render, call the API, and treat its answer as the decision:

```ts
const token = await requireSession(API_BASE);   // authentication only
const res = await fetch(`${base}/v1/wcs/wiki/admin/sources`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (handleDenial(res.status)) return;           // 401 -> /sign-in, 403 -> /
```

`requireSession` asks Clerk whether anyone is signed in, which is
authentication and legitimately the client's business. It never asks whether
they are allowed. The decision is made once, at the enforcement point, and
audited there.

The distinction worth keeping: a client asking the API *"may I do X?"* is fine
— that is the API reporting its own decision. A client computing *"I hold
wcs-admin, therefore I may"* is not.

`GET /v1/identity/whoami` was considered as the guard's source and rejected
twice over: it is documented as a diagnostic mirror of verify and resolve, so
making it load-bearing would freeze a debugging tool into a contract, and it
returns roles, which is the wrong currency for a client to hold at all.
Adding roles to `GET /v1/wcs/me` was implemented and reverted for the same
reason, plus a concrete cost — it orphans `get_current_owner`, which
`tests/evals/test_harness.py` overrides to stub auth.

### The one place this is not yet resolved

`Nav.astro` shows and hides admin links. Under this design it has no
authorisation answer to read, so either it shows links that 403 on click, or
the API grows a capability field saying what the caller may do — not what roles
they hold. That is a separate decision and is deliberately left open; today's
Nav already resolves admin client-side, so nothing regresses while it waits.

## What the API needs

One change, and it is small.

`upsertWcsProfile` currently POSTs `{ email, display_name }` to
`POST /v1/wcs/me` with a Bearer token. The site only calls Clerk's admin API
(`getClerkUserData`, using `CLERK_SECRET_KEY`) in order to have those two
values to send.

The API already verifies the JWT to authorise that request. It should derive
`email` and `display_name` from the verified token's claims — or call Clerk
itself, where the secret already lives — rather than trusting a client-supplied
body. That is strictly more correct than today: right now a caller can POST any
email they like alongside a valid token.

Making that change is what lets `CLERK_SECRET_KEY` leave the site entirely.

`GET /v1/wcs/me` already returns `is_admin` and needs no change.

## Open decision: four dynamic routes

**This corrects an error in the first draft**, which named `sets/[id]` as the
only page needing a decision. That was wrong. It is the only route carrying
`export const prerender = false`, but under `output: "server"` every page is
server-rendered by default, so no dynamic route needed `getStaticPaths`. Going
static, all four do:

    src/pages/sets/[id].astro          public   set detail
    src/pages/notes/[id].astro         private  note detail
    src/pages/notes/admin/[id].astro   admin    note admin
    src/pages/admin/notes/[id].astro   admin    source admin

A static build cannot serve `/notes/<uuid>` without knowing the ids at build
time, and the three private routes must not be enumerated at build time — that
would publish the id set, and bake private paths into a public deployment.

The options, and they are not the same answer for both groups:

1. **`getStaticPaths` for `sets/[id]` only.** Public, and `/v1/sets` already
   enumerates it. Preserves URLs, fully static, needs a rebuild for new sets —
   the scheduled deploy hook `kwalla-dance` uses is the fleet precedent.
2. **`_redirects` 200 rewrites for the three private routes.** Preserves URLs;
   one static shell per route reads the id from `location.pathname`. Standard
   SPA-on-Pages practice, but the rewrite ordering against real assets cannot
   be verified without deploying.
3. **Query parameters** — `/notes/detail?id=<uuid>`. Simplest and fully
   static, no rewrite behaviour to trust. Changes URLs, so existing bookmarks
   break. These are private pages, so the blast radius is small but not zero.

This is the decision blocking implementation.

## Risks

- **An auth refactor is exactly where a green build proves nothing.** Every
  gate has to be exercised by hand, signed in and signed out.
- **Flash of shell.** Admin pages get a spinner-then-redirect instead of a
  server-side redirect. The page never holds privileged data — that arrives
  from the API over Bearer — but an unauthorised visitor briefly sees chrome.
  Mitigate by rendering the guard's loading state first and the content only
  after the profile resolves.
- **The API becomes the sole gate.** Confirmed above that it already enforces
  independently, so this is a removal of redundancy rather than a new exposure.
  Re-run the two-directional privilege audit after the refactor anyway — it is
  cheap and it is the check that found the seven mis-scoped routes.

## Cost

Revised upward. The first draft said a day, on the assumption that the page
work was deleting frontmatter. It is more than that: each of the eight pages
carries a bespoke client script of 174-458 lines that currently receives its
session token from a server-rendered `data-session-token` attribute, and every
one needs converting to fetch a live token and handle a denial. Add the routing
decision above, and the Nav question. Call it two days, with the caveat that
auth refactors are where estimates go wrong.

The API half is done and was small, as predicted.

The Workers path is faster now and leaves the adapter coupling in place. This
path costs a day once and ends it.

## If this is chosen

`chore/astro-7-security-upgrade` is abandoned, not merged — its dependency
bumps are still correct and can be cherry-picked, but its adapter, wrangler and
middleware changes all get reverted by this work. `main` stays on Astro 4 with
the `overrides` mitigation (5 advisories, none reachable in a static build)
until the refactor lands, and the site stays on Pages the whole time. There is
no cutover and no downtime.
