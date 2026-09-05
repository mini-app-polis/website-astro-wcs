## [3.0.1](https://github.com/mini-app-polis/website-astro-wcs/compare/v3.0.0...v3.0.1) (2026-09-05)


### Bug Fixes

* **sets:** page within the API's limit cap when enumerating set paths ([5692c65](https://github.com/mini-app-polis/website-astro-wcs/commit/5692c65d09649917a8f6919c3c165b727085318a))

# [3.0.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v2.0.1...v3.0.0) (2026-09-05)


* feat(auth)!: make the site static and let the API own authorization ([498b6b3](https://github.com/mini-app-polis/website-astro-wcs/commit/498b6b3e5e29b42d86d96083c1ffd655e17127f1))


### BREAKING CHANGES

* this site no longer server-renders. Cloudflare Pages serves a
static build; @astrojs/cloudflare and @clerk/backend are gone. astro 4.16.19 ->
7.3.1, @clerk/astro 3.4.20 -> 4.1.0, @astrojs/preact 5.1.4 -> 6.0.5, Tailwind
3 -> 4. npm audit 5 -> 0.

Why this and not the Workers migration in docs/WORKERS-MIGRATION.md: the
adapter chains hosting to the framework version by peer dependency, and v11 was
the last release supporting Pages, which is what pinned this site to Astro 4
and its advisories. Moving to Workers keeps that chain. Removing the adapter
ends it - and the only reason the adapter existed was authorization enforced in
page frontmatter, which was never the real gate.

The API already decides. Every /v1/wcs/* route is scope-guarded; the pages here
only ever hid a shell. Worse, they gated on profile.is_admin, which seeds a
person's first grant and stops deciding anything after that - so the site was
enforcing on a field the identity model had already moved past, and would have
drifted further with every role change.

So the site now makes no authorization decision. Pages render, call the API,
and follow its answer: 401 to /sign-in, 403 to /. src/lib/session.ts holds only
authentication - waiting for Clerk and fetching a live token, which Clerk owns
legitimately - plus guardedFetch, which routes a refusal rather than predicting
one.

Clerk is untouched. It never required an adapter - output: "server" did.
<SignIn>, <UserButton> and <Show> mount client-side either way. The one change
is a Clerk 4 prop rename that was silently breaking the post-login redirect:
afterSignInUrl -> fallbackRedirectUrl.

Removed: src/middleware.ts, whose only job was a 307 handshake for stale SSR
session cookies - a problem that exists only because auth ran on the server.
src/lib/auth.ts, whose server-only helpers have no remaining callers. Nav's SSR
admin pass, which its own comment admitted was unreliable and which the client
reveal was already correcting.

Routing. Four dynamic routes needed an answer, not one - only sets/[id] carried
`export const prerender = false`, but under output: "server" every page was
server-rendered, so none needed getStaticPaths before. They get different
answers on purpose:

  - sets/[id] is public and /v1/sets enumerates it, so it renders at build
    time. A new set needs a rebuild; kwalla-dance's scheduled deploy hook is
    the fleet precedent.
  - the three private note routes must NOT be enumerated - that would publish
    the id set inside a public artifact. Each becomes one static shell,
    path-preserving via a 200 rewrite in public/_redirects, reading its id from
    location.pathname. A path segment identifies a resource; a query parameter
    would have described a page.

Also fixes a silent failure the first build walked straight into: getSets
swallows transport errors and returns its fallback, so an API blip during a
build would have produced a green build that 404s every set page. A configured
API returning nothing now fails the build; an unconfigured one warns.

ci.yml: release now needs [build, security] and the comment explaining why it
was ungated is gone - the audit is 0. The build step also passes
PUBLIC_CLERK_PUBLISHABLE_KEY, which it never did; it is read through
import.meta.env, so without it the build ships a site where Clerk never
initialises.

Verified: build passes, 25 pages, dist/index.html at the root with no
_worker.js and no dist/server, _redirects shipped with the pre-existing
/submit-music rule intact above the rewrites, npm audit 0. astro check is 3
errors, down from 16 - all three a pre-existing union-type issue in
dj-marvel.astro, untouched here.

NOT verified, and this is the part that matters: no sign-in was exercised. A
green build proves imports resolve and nothing about auth. Before pushing, test
on a preview deployment - sign in, confirm /admin/* and /notes/admin refuse a
signed-out visitor and a non-admin, confirm a set detail page renders, and
confirm the _redirects rewrites resolve, which cannot be checked without
deploying.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0142LW7owtPpkdNGpj69MY47

## [2.0.1](https://github.com/mini-app-polis/website-astro-wcs/compare/v2.0.0...v2.0.1) (2026-09-04)


### Bug Fixes

* **deps:** pin vulnerable transitives, 13 advisories down to 5 ([82636fa](https://github.com/mini-app-polis/website-astro-wcs/commit/82636fa1cd56d70d25275807b80c25d92bb7f497))

# [2.0.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.20.0...v2.0.0) (2026-09-04)


* fix(deps)!: upgrade to astro 7 and clear the security advisories ([b7ab775](https://github.com/mini-app-polis/website-astro-wcs/commit/b7ab775f946d5d8de9b35302995372b8a069cd57)), closes [#34d399](https://github.com/mini-app-polis/website-astro-wcs/issues/34d399) [#18181e](https://github.com/mini-app-polis/website-astro-wcs/issues/18181e) [#1f1f27](https://github.com/mini-app-polis/website-astro-wcs/issues/1f1f27) [#0d0d0f](https://github.com/mini-app-polis/website-astro-wcs/issues/0d0d0f) [#111115](https://github.com/mini-app-polis/website-astro-wcs/issues/111115)


### Bug Fixes

* **git:** never three-way merge a lockfile ([80d29dc](https://github.com/mini-app-polis/website-astro-wcs/commit/80d29dceda1e7e89d0842dc5f337e7e4f38b04da))


### BREAKING CHANGES

* deploys move from Cloudflare Pages to Cloudflare
Workers, and Clerk goes from 3 to 4. Neither cutover is in this
commit.

Same advisories as website-astro-software, and they matter more here.
That site is output "hybrid"; this one is output "server", so every
page is server-rendered, and this is the site with authentication —
which is exactly what the middleware auth bypass, the double URL
encoding bypass and the Host-header SSRF advisories target. npm audit
now reports zero.

  astro                4.16.19 -> 7.3.1
  @astrojs/cloudflare  11.2.0  -> 14.3.0
  @clerk/astro         3.4.20  -> 4.1.0
  @astrojs/preact      5.1.4   -> 6.0.5
  @astrojs/tailwind    removed, replaced by @tailwindcss/vite
  tailwindcss          3 -> 4
  autoprefixer, postcss  removed

@clerk/backend is now a declared dependency. src/middleware.ts has
always imported it, and it resolved only because npm hoisted it out of
@clerk/astro's tree — a Clerk major is precisely the event that
changes that tree, so it should not have been implicit.

Clerk 3 to 4 removes getAuth from @clerk/astro/server. That does not
affect this site: it never imported it. Every symbol this site does
import was checked against the installed v4 packages — createClerkClient
and verifyToken from @clerk/backend, clerkClient.authenticateRequest
used by the handshake middleware, and Show, UserButton and SignIn from
@clerk/astro/components, whose pages compile.

wrangler.toml becomes a Workers config: @astrojs/cloudflare v11 was the
last release supporting Pages, and the /_image SSRF is only fixed in
v12.6.6+, so nothing clears this audit and stays on Pages. `main` is
not declared — the adapter generates the worker entry at build time and
wrangler validates that field first.

Tailwind config moves into CSS. tailwind.config.mjs is deleted; its
theme.extend values become @theme in global.css and darkMode: "class"
becomes @custom-variant. Verified in the built stylesheet: accent

# [1.20.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.19.0...v1.20.0) (2026-09-04)


### Features

* **deps:** automate dependency updates ([bd68d0c](https://github.com/mini-app-polis/website-astro-wcs/commit/bd68d0c4226ef068c261f024aceca90d3cfe3843))

# [1.19.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.18.4...v1.19.0) (2026-09-04)


### Features

* **security:** call the shared security workflow, clear both criticals ([b1cd01f](https://github.com/mini-app-polis/website-astro-wcs/commit/b1cd01f3fdc590c9c069c6a69222810740ebe076))

## [1.18.4](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.18.3...v1.18.4) (2026-06-07)


### Bug Fixes

* pinning version for astro preact ([0595e4e](https://github.com/mini-app-polis/website-astro-wcs/commit/0595e4ee93bbd88ed3cce882b46c42933a7be3e2))

## [1.18.3](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.18.2...v1.18.3) (2026-05-29)


### Bug Fixes

* **notes:** dedup co-taught attributions and definitions at render time ([ae4860c](https://github.com/mini-app-polis/website-astro-wcs/commit/ae4860c2ae180ec2694c82e54445f8806ba0376d))

## [1.18.2](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.18.1...v1.18.2) (2026-05-29)


### Bug Fixes

* **notes:** serve detail-page renderer as static asset to work around Astro hoisted-script SSR bug ([c7537a4](https://github.com/mini-app-polis/website-astro-wcs/commit/c7537a41fc30f96e6c959c94bb3b74c180ae7d45))

## [1.18.1](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.18.0...v1.18.1) (2026-05-28)


### Bug Fixes

* notes detail pages were not bundling renderSourceView import ([b2b5b7a](https://github.com/mini-app-polis/website-astro-wcs/commit/b2b5b7a1b43fdab4e7ad8aea84cceab9073f7395))

# [1.18.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.17.0...v1.18.0) (2026-05-28)


### Features

* admin read-detail page for notes browse ([0bb366e](https://github.com/mini-app-polis/website-astro-wcs/commit/0bb366eea87e52294218d6846e298d565686bef0))

# [1.17.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.16.0...v1.17.0) (2026-05-28)


### Features

* repoint notes website pages to the entity substrate ([0617d09](https://github.com/mini-app-polis/website-astro-wcs/commit/0617d09e03f701a8c3a318c53f258bc2a3e9a9cb))

# [1.16.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.15.0...v1.16.0) (2026-05-28)


### Features

* rewrite notes pages for WCS entity substrate ([512b42a](https://github.com/mini-app-polis/website-astro-wcs/commit/512b42ab6664f06a8edc38066bb8b35fbc1b9ee2))

# [1.15.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.14.3...v1.15.0) (2026-05-15)


### Features

* adding not data editing ([c99a713](https://github.com/mini-app-polis/website-astro-wcs/commit/c99a7135a0bf20968d8916e64df7e8fea2df236a))

## [1.14.3](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.14.2...v1.14.3) (2026-05-15)


### Bug Fixes

* admin menu ([63e74b5](https://github.com/mini-app-polis/website-astro-wcs/commit/63e74b5fae088ed242161b3a29aa56ad6663dee7))

## [1.14.2](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.14.1...v1.14.2) (2026-05-15)


### Bug Fixes

* admin menu ([4ca377d](https://github.com/mini-app-polis/website-astro-wcs/commit/4ca377d90f3978d1d995d03533618ce9a8f0cb9f))

## [1.14.1](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.14.0...v1.14.1) (2026-05-15)


### Bug Fixes

* admin detection ([51effb5](https://github.com/mini-app-polis/website-astro-wcs/commit/51effb5c4f926e77a1c800efdb9de621831047d6))

# [1.14.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.13.2...v1.14.0) (2026-05-15)


### Features

* admin menu restructure ([6b1d052](https://github.com/mini-app-polis/website-astro-wcs/commit/6b1d0527e1b84ed51345de1b32dd0328a02aaa32))

## [1.13.2](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.13.1...v1.13.2) (2026-05-11)


### Bug Fixes

* remove caching ([7c2745e](https://github.com/mini-app-polis/website-astro-wcs/commit/7c2745e8d95502eace345fa6510dc58c4f0d331f))

## [1.13.1](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.13.0...v1.13.1) (2026-05-11)


### Bug Fixes

* adding price visibility ([8fe581b](https://github.com/mini-app-polis/website-astro-wcs/commit/8fe581b9e85ef386c93c034069ecc224256a7dd2))

# [1.13.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.12.0...v1.13.0) (2026-05-11)


### Features

* render cost/tokens in ask trace footer ([02464e1](https://github.com/mini-app-polis/website-astro-wcs/commit/02464e17fa92b9b1091ca5c67c38e99d6c4ca4f2))

# [1.12.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.11.1...v1.12.0) (2026-05-11)


### Features

* processing messaging and feedback ([fd34bcb](https://github.com/mini-app-polis/website-astro-wcs/commit/fd34bcb813203e2664b5c3826417432d2af79f85))

## [1.11.1](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.11.0...v1.11.1) (2026-05-10)


### Bug Fixes

* moving to private ask page ([230f17b](https://github.com/mini-app-polis/website-astro-wcs/commit/230f17b6cfd3b74893ab36370060ebc863a64366))

# [1.11.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.10.0...v1.11.0) (2026-05-10)


### Features

* add Ask to More submenu ([b207a41](https://github.com/mini-app-polis/website-astro-wcs/commit/b207a41e0c509d82ab221a8a19977446f869b39b))
* add refresh-embeddings panel to /notes/admin ([169e6d6](https://github.com/mini-app-polis/website-astro-wcs/commit/169e6d6c73ce8057bf55a49988acb21b5766a34c))

# [1.10.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.9.4...v1.10.0) (2026-05-10)


### Features

* add /notes/ask page for WCS Q&A agent ([6180554](https://github.com/mini-app-polis/website-astro-wcs/commit/618055482c811874be85d524a4f869555d8642ef))

## [1.9.4](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.9.3...v1.9.4) (2026-05-06)


### Bug Fixes

* /book-now redirects to /booking/lessons ([a957671](https://github.com/mini-app-polis/website-astro-wcs/commit/a957671673044cfda7cc1e1c862eaa19ef1e6795))

## [1.9.3](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.9.2...v1.9.3) (2026-04-30)


### Bug Fixes

* visit to wcs.kaianolevine.com/submit-music will redirect to deejaytools.com ([484b4ff](https://github.com/mini-app-polis/website-astro-wcs/commit/484b4ff4527f9228f2bb947b5778e135a368b566))

## [1.9.2](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.9.1...v1.9.2) (2026-04-17)


### Bug Fixes

* cleanup ([02357bc](https://github.com/mini-app-polis/website-astro-wcs/commit/02357bc78e4d5c7a6e3ece804670e50dc87d80e9))

## [1.9.1](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.9.0...v1.9.1) (2026-04-17)


### Bug Fixes

* cleanup ([c7331d4](https://github.com/mini-app-polis/website-astro-wcs/commit/c7331d41d5f955dcac9b9e485dfd34108a3d6626))

# [1.9.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.8.1...v1.9.0) (2026-04-17)


### Features

* supporting new endpoint for original functionality with updated auth ([bbe45e2](https://github.com/mini-app-polis/website-astro-wcs/commit/bbe45e2b1a6fda39a663fe10e4fe187aff017896))

## [1.8.1](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.8.0...v1.8.1) (2026-04-17)


### Bug Fixes

* follow up to auth change for admin view ([3e21a1b](https://github.com/mini-app-polis/website-astro-wcs/commit/3e21a1ba6261599dcc7e5745b738be666f5f2188))

# [1.8.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.7.0...v1.8.0) (2026-04-17)


### Features

* supporting api auth upgrade ([184b128](https://github.com/mini-app-polis/website-astro-wcs/commit/184b128f80f76a0d490716b002e4cb141fc5b3db))

# [1.7.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.6.4...v1.7.0) (2026-04-17)


### Features

* full auth pattern supported ([79f3c02](https://github.com/mini-app-polis/website-astro-wcs/commit/79f3c02cace9fd2de60cb8539a5736b417bc243a))

## [1.6.4](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.6.3...v1.6.4) (2026-04-16)


### Bug Fixes

* notes permissions display ([576aa19](https://github.com/mini-app-polis/website-astro-wcs/commit/576aa1927906f64dd8c6582a4f90898905fa058b))

## [1.6.3](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.6.2...v1.6.3) (2026-04-16)


### Bug Fixes

* adding admin notes display ([6a013f8](https://github.com/mini-app-polis/website-astro-wcs/commit/6a013f81e7d5494c6984fd926259cd0e209143aa))

## [1.6.2](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.6.1...v1.6.2) (2026-04-16)


### Bug Fixes

* admin display for notes ([5b0ada0](https://github.com/mini-app-polis/website-astro-wcs/commit/5b0ada0f14a08db31a73f646a47d1c5699b8a121))

## [1.6.1](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.6.0...v1.6.1) (2026-04-16)


### Bug Fixes

* admin display for notes ([0cbd09e](https://github.com/mini-app-polis/website-astro-wcs/commit/0cbd09ec74804d6d3ea3ab07cae1f99abf820410))

# [1.6.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.5.4...v1.6.0) (2026-04-16)


### Bug Fixes

* build issue ([bfec4cb](https://github.com/mini-app-polis/website-astro-wcs/commit/bfec4cbf7533326bd8451086377931b6cc47d727))


### Features

* adding user information to database ([5b1668d](https://github.com/mini-app-polis/website-astro-wcs/commit/5b1668d5083ec314706e3a30796c0c0734e7899d))

## [1.5.4](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.5.3...v1.5.4) (2026-04-16)


### Bug Fixes

* working notes ([bb6f675](https://github.com/mini-app-polis/website-astro-wcs/commit/bb6f675df2833b2ed28743ddeda611982e79ba41))

## [1.5.3](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.5.2...v1.5.3) (2026-04-16)


### Bug Fixes

* update ([d35ee02](https://github.com/mini-app-polis/website-astro-wcs/commit/d35ee02068818112268c22c1290c1ccd7902da8b))

## [1.5.2](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.5.1...v1.5.2) (2026-04-16)


### Bug Fixes

* update ([fcc6ef5](https://github.com/mini-app-polis/website-astro-wcs/commit/fcc6ef5052c2d482069b16cf689bac355ba2cc0c))

## [1.5.1](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.5.0...v1.5.1) (2026-04-16)


### Bug Fixes

* rollback ([e0b7fbe](https://github.com/mini-app-polis/website-astro-wcs/commit/e0b7fbef7ca1f893745e7fbf52614ce63743e03c))

# [1.5.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.4.5...v1.5.0) (2026-04-16)


### Features

* website updates to support api change for notes permissions and control ([c3dcf2c](https://github.com/mini-app-polis/website-astro-wcs/commit/c3dcf2c50fb32ab896c706f8a9516f14d4ad4d6f))

## [1.4.5](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.4.4...v1.4.5) (2026-04-11)


### Bug Fixes

* homepage link to submit music ([732ce6c](https://github.com/mini-app-polis/website-astro-wcs/commit/732ce6cc7e5b81b73b004871ca48d0f98b856e2c))

## [1.4.4](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.4.3...v1.4.4) (2026-04-06)


### Bug Fixes

* adding searchable instructors ([d54ada1](https://github.com/mini-app-polis/website-astro-wcs/commit/d54ada1d1d10e5fda4f7e4f2c892884e9af27218))

## [1.4.3](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.4.2...v1.4.3) (2026-04-06)


### Bug Fixes

* label formatting ([0eb6a03](https://github.com/mini-app-polis/website-astro-wcs/commit/0eb6a031fbce4cb0cbc06e131ac09e3c82d6d6d3))

## [1.4.2](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.4.1...v1.4.2) (2026-04-06)


### Bug Fixes

* readability on cards, remove summary preview ([37b05e3](https://github.com/mini-app-polis/website-astro-wcs/commit/37b05e310eeb1d7b95409c6a36ae7eeac4f4ebcd))

## [1.4.1](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.4.0...v1.4.1) (2026-04-06)


### Bug Fixes

* adding card formatting ([584b247](https://github.com/mini-app-polis/website-astro-wcs/commit/584b247b370ed2a54b9bc8d3368a7e5bf9c7816d))

# [1.4.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.3.9...v1.4.0) (2026-04-06)


### Features

* adding filters to notes page ([57242ce](https://github.com/mini-app-polis/website-astro-wcs/commit/57242ce9d4b0bb94acff1da4d1a84e9517c04dce))

## [1.3.9](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.3.8...v1.3.9) (2026-04-05)


### Bug Fixes

* updating notes titles based on data ([3488d8d](https://github.com/mini-app-polis/website-astro-wcs/commit/3488d8dd2a1c89d770948eccff9798ce5df267c6))

## [1.3.8](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.3.7...v1.3.8) (2026-04-04)


### Bug Fixes

* env var names ([2a43921](https://github.com/mini-app-polis/website-astro-wcs/commit/2a43921fb77f56473f0cf493bc4a8197667bbb84))

## [1.3.7](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.3.6...v1.3.7) (2026-04-04)


### Bug Fixes

* env var names ([5c58831](https://github.com/mini-app-polis/website-astro-wcs/commit/5c588313d99cdfcb5bd065422d159f729f88980c))

## [1.3.6](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.3.5...v1.3.6) (2026-04-04)


### Bug Fixes

* set render issue ([65024fc](https://github.com/mini-app-polis/website-astro-wcs/commit/65024fcbb99c24604e272cd4c8cf01f1c9cbd443))

## [1.3.5](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.3.4...v1.3.5) (2026-04-03)


### Bug Fixes

* clerk login setup ([8ec626f](https://github.com/mini-app-polis/website-astro-wcs/commit/8ec626fae275bba1340c3169b9cb682f182db551))

## [1.3.4](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.3.3...v1.3.4) (2026-04-03)


### Bug Fixes

* clerk login setup ([71e807b](https://github.com/mini-app-polis/website-astro-wcs/commit/71e807bb6d50296f474d0d18aa6cf4dedfd0af54))

## [1.3.3](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.3.2...v1.3.3) (2026-04-03)


### Bug Fixes

* clerk login setup ([1d84053](https://github.com/mini-app-polis/website-astro-wcs/commit/1d84053c2967aa6f9e64ced8eec533d87c1afafa))

## [1.3.2](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.3.1...v1.3.2) (2026-04-03)


### Bug Fixes

* clerk login setup ([4b08e56](https://github.com/mini-app-polis/website-astro-wcs/commit/4b08e56a16b9e904f2af197a68e3d59b9d50cd81))

## [1.3.1](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.3.0...v1.3.1) (2026-04-03)


### Bug Fixes

* clerk login setup ([10f902c](https://github.com/mini-app-polis/website-astro-wcs/commit/10f902c934a68cc05912fc3a02b81e12d9a4be58))

# [1.3.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.2.3...v1.3.0) (2026-04-03)


### Bug Fixes

* clerk login setup ([5ffaea1](https://github.com/mini-app-polis/website-astro-wcs/commit/5ffaea191dadc0561fa3468bf4091694f6ca5b99))
* clerk login setup ([762205d](https://github.com/mini-app-polis/website-astro-wcs/commit/762205d7533f2b2c7f324dc2f8d737382385fb48))
* clerk login setup ([95b33ea](https://github.com/mini-app-polis/website-astro-wcs/commit/95b33ea7dc8ceb862d8693ff5abf1c57455f8647))
* clerk login setup ([79aa121](https://github.com/mini-app-polis/website-astro-wcs/commit/79aa1213427c12041fedcf28c51b38761eb9e7f9))


### Features

* adding login through clerk ([869990a](https://github.com/mini-app-polis/website-astro-wcs/commit/869990a2feb81ae783f81cd0329d45d7df130967))

## [1.2.3](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.2.2...v1.2.3) (2026-04-03)


### Bug Fixes

* data from client side fetch, after shell is rendered ([aeaef2c](https://github.com/mini-app-polis/website-astro-wcs/commit/aeaef2c011d4920ff8375839c07a201f97ff9e02))

## [1.2.2](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.2.1...v1.2.2) (2026-04-03)


### Bug Fixes

* adding schema suggestions to notes ([10b9edd](https://github.com/mini-app-polis/website-astro-wcs/commit/10b9edd75ccf3f0d20329ed1ce49b918a288d7d7))

## [1.2.1](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.2.0...v1.2.1) (2026-04-03)


### Bug Fixes

* handling 404 in cloudflare/astro ([5827934](https://github.com/mini-app-polis/website-astro-wcs/commit/5827934637e34b2705647553d2945757c47d33ce))

# [1.2.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.1.0...v1.2.0) (2026-04-03)


### Features

* adding notes view, first pass ([73c2d54](https://github.com/mini-app-polis/website-astro-wcs/commit/73c2d545e228fd7d755ea47ce1f67e29f5e604b6))
* adding notes view, first pass ([8d68eb7](https://github.com/mini-app-polis/website-astro-wcs/commit/8d68eb78f7ee713473186a0739a1d5d765ed0b2a))
* adding notes view, first pass ([1373ac5](https://github.com/mini-app-polis/website-astro-wcs/commit/1373ac53b7df4aadecf37ca36769a96d06750b1b))
* adding notes view, first pass ([9e2c0db](https://github.com/mini-app-polis/website-astro-wcs/commit/9e2c0db5a657fe80b48320e227ab61a64e7f8256))

# [1.1.0](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.0.2...v1.1.0) (2026-04-02)


### Features

* og images ([3b8e8aa](https://github.com/mini-app-polis/website-astro-wcs/commit/3b8e8aa6c2dd5b4fa9c68e75f79ae03fb21cdbd0))

## [1.0.2](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.0.1...v1.0.2) (2026-03-30)


### Bug Fixes

* prevent mobile horizontal scroll and wire semantic-release version to footer ([7216749](https://github.com/mini-app-polis/website-astro-wcs/commit/72167495f19bbe8b4fe0847755ab009d31932f73))

## [1.0.1](https://github.com/mini-app-polis/website-astro-wcs/compare/v1.0.0...v1.0.1) (2026-03-30)


### Bug Fixes

* nav menu on mobile ([e8eaf61](https://github.com/mini-app-polis/website-astro-wcs/commit/e8eaf6158e76bef7c88567e2e0e5ad4a32705250))

# 1.0.0 (2026-03-30)


### Bug Fixes

* adding lesson information back in ([3e3eec4](https://github.com/mini-app-polis/website-astro-wcs/commit/3e3eec4f63731f77c3d3157a3ea1ee6922402f3e))
* contact ([e340972](https://github.com/mini-app-polis/website-astro-wcs/commit/e340972b881afa5bf28c132c36d56e94e6ddd1ee))
* content update ([fc382ad](https://github.com/mini-app-polis/website-astro-wcs/commit/fc382ad0ceaf5a79e385e772253cbef8bc86d8f1))
* content update ([a13ffc5](https://github.com/mini-app-polis/website-astro-wcs/commit/a13ffc5671505df6870415143ed8e7b006e637e4))
* content update ([18ae648](https://github.com/mini-app-polis/website-astro-wcs/commit/18ae648432149873dafff8673d84c33fccf6066c))
* content update ([5b7a6fe](https://github.com/mini-app-polis/website-astro-wcs/commit/5b7a6fe745563377f41183eb3ab0648797fc0724))
* footer version ([6f68f3d](https://github.com/mini-app-polis/website-astro-wcs/commit/6f68f3d88fae7164a0288c2d8d06570c791838e2))
* main page display ([6440469](https://github.com/mini-app-polis/website-astro-wcs/commit/64404693c8f547647c06996d30697f2d3366532c))
* redirect on contact form submission ([1379861](https://github.com/mini-app-polis/website-astro-wcs/commit/137986158acc556dcbe0a4dbd02a002d869056d6))
* redirect on contact form submission ([cdf34a4](https://github.com/mini-app-polis/website-astro-wcs/commit/cdf34a488dffed2ed9ca0851552d1833571626ec))
* redirect on contact form submission ([ebdade1](https://github.com/mini-app-polis/website-astro-wcs/commit/ebdade1b7ccb89dc68c86068b0287c81d6ef6c42))
* redirect on contact form submission ([dfe7ba5](https://github.com/mini-app-polis/website-astro-wcs/commit/dfe7ba5a34894d643558dbf5c64c4939c7aa9754))
* survery form ([9df4343](https://github.com/mini-app-polis/website-astro-wcs/commit/9df4343231ae10e17cdcc518f9e9fe954624f7a2))
* survery form ([094dfaa](https://github.com/mini-app-polis/website-astro-wcs/commit/094dfaa560ed74f8cf04198e782b3e15ad571aff))
* survery form ([664eebf](https://github.com/mini-app-polis/website-astro-wcs/commit/664eebf87ecf2c8e45af0c37d81682582ffc3602))
* survery form ([72168bc](https://github.com/mini-app-polis/website-astro-wcs/commit/72168bc54a3636cbc815d7b5ca9de7f58a6d05a2))
* updated config ([b6c8e3f](https://github.com/mini-app-polis/website-astro-wcs/commit/b6c8e3f2c56d544f2cb47f4ed3b94dfa37050a40))
* updating api connection ([f84785e](https://github.com/mini-app-polis/website-astro-wcs/commit/f84785ece61434cdc30294c029775a7a7842bf03))
* updating config urls ([b1f9241](https://github.com/mini-app-polis/website-astro-wcs/commit/b1f9241f6b7bd492bc72570ada3fc33ae0b37f1d))


### Features

* adding spotify connection ([729bc62](https://github.com/mini-app-polis/website-astro-wcs/commit/729bc62b6266c95dc47f09a33c8a1562cd64b078))
* Inital commit ([3617fcc](https://github.com/mini-app-polis/website-astro-wcs/commit/3617fccbe517a028d4453539b61d585c25b86398))
* semantic release and .env.example ([4c1ee9d](https://github.com/mini-app-polis/website-astro-wcs/commit/4c1ee9d703e62fb37edc48285bcd75376bb06d8a))
* style update ([a9c8592](https://github.com/mini-app-polis/website-astro-wcs/commit/a9c8592ed498233fef4e319b1d95f728c8dfd45d))
* updating content, changing spotify playlist display ([fd8e2ed](https://github.com/mini-app-polis/website-astro-wcs/commit/fd8e2ed4dd0c18139dbbe97e745878970ab93917))
* updating url for updated api ([7dcaba2](https://github.com/mini-app-polis/website-astro-wcs/commit/7dcaba20dbca6dd908c4845866353d241856c103))
