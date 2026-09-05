# wcs: Cloudflare Pages -> Workers

## Why this is required

`website-astro-software` cleared the same advisories by deleting the
Cloudflare adapter, because every page on that site prerenders and the
adapter was doing nothing. That does not transfer here. This site is
`output: "server"` — Clerk verifies sessions server-side in
`src/middleware.ts`, `src/lib/auth.ts` and `src/components/Nav.astro`,
and four admin pages gate on it. Removing the adapter fails the build
outright:

    [@clerk/astro/integration] Missing adapter, please update your Astro config to use one.
    [NoAdapterInstalled] Cannot use server-rendered pages without an adapter.

So the adapter stays, and that forces the hosting question:

| @astrojs/cloudflare | Host   | Astro peer | Advisories |
| ------------------- | ------ | ---------- | ---------- |
| 11.2.0 (today)      | Pages  | ^4         | 13 open, 9 high |
| 12.6.13             | Workers| ^5.7       | partly cleared |
| 14.3.0 (branch)     | Workers| ^7.2       | zero |

v11 is the last release that supports Pages. There is no version that
clears the audit and stays on Pages — with the adapter present,
`pages_build_output_dir` does not even build, because the adapter's
`ASSETS` binding name is reserved in Pages projects.

## What is already done

Branch `chore/astro-7-security-upgrade`:

- astro 4.16.19 -> 7.3.1, @astrojs/cloudflare 11.2.0 -> 14.3.0,
  @clerk/astro 3.4.20 -> 4.1.0, @astrojs/preact 5.1.4 -> 6.0.5
- @astrojs/tailwind (abandoned) -> @tailwindcss/vite, Tailwind 3 -> 4
- `@clerk/backend` declared explicitly — `src/middleware.ts` imported it
  while it resolved only via hoisting
- `wrangler.toml` converted to a Workers config
- `npm audit`: 0 vulnerabilities

- `wrangler.toml` carries the non-secret `[vars]`, and the custom-domain
  route is present but commented out, so the cutover is a one-line commit
  rather than a dashboard click

The build produces what a Worker deploy needs:

    dist/server/entry.mjs      the worker
    dist/server/wrangler.json  main: entry.mjs, assets -> ../client
    dist/client/               31 static asset files
    .wrangler/deploy/config.json   points wrangler at the generated config

That last file is the part worth knowing. `wrangler deploy` does not read the
root `wrangler.toml` for `main` or for the asset directory; it follows the
redirect to `dist/server/wrangler.json`, which the adapter writes at build time.
Confirmed with `wrangler deploy --dry-run`, which reports:

    Read 31 files from the assets directory .../dist/client
    env.SESSION                    KV Namespace
    env.IMAGES                     Images
    env.ASSETS                     Assets
    env.KAIANO_API_BASE_URL        Environment Variable
    env.PUBLIC_TURNSTILE_SITE_KEY  Environment Variable

## The cutover

Most of what an earlier draft of this document listed as manual is not.
Corrected against the adapter's own types and a `wrangler deploy --dry-run`:

- **The KV namespace does not need creating.** The adapter injects a `SESSION`
  KV binding and Cloudflare auto-provisions the namespace on deploy
  (`Options.sessionKVBindingName` in `@astrojs/cloudflare`: "The KV namespace
  will be automatically provisioned when you deploy"). Nothing in `src/` uses
  `Astro.session`, so it is an unused binding either way.
- **The Images binding does not need creating.** Same mechanism, and likewise
  unreferenced — there is no `astro:assets` or `<Image>` usage in `src/`.
- **The `[vars]` are already in `wrangler.toml`** and are applied by the deploy.
  The Pages project's dashboard vars do not need copying by hand.

What genuinely remains:

1. Connect the repo to a Worker named `kaiano-wcs-website` with build command
   `npm run build`. Cloudflare Workers Builds is the Pages-equivalent Git
   integration. This is the one step with no in-repo equivalent short of
   replacing it with a `wrangler-action` deploy workflow.
2. Provide the two secrets and the one build-time public key. Secrets go
   against the deployed Worker:

       npx wrangler secret put CLERK_SECRET_KEY
       npx wrangler secret put CLERK_JWT_KEY

   `PUBLIC_CLERK_PUBLISHABLE_KEY` is consumed at build time through
   `import.meta.env`, so it must exist in the build environment, not as a
   Worker var. Note that `.github/workflows/ci.yml` does not pass it to its
   build step either; that build currently produces a bundle without a Clerk
   publishable key and only ever proved compilation.
3. Deploy and verify on `*.workers.dev` **before** the domain moves. The
   commented-out `[[routes]]` block in `wrangler.toml` keeps the first deploy
   off the live domain. Test: sign in, the session handshake in
   `src/middleware.ts`, and that `/admin/*` still rejects a signed-out visitor.
   A build that compiles proves imports resolve and nothing about auth.
4. Uncomment the `[[routes]]` block and deploy. That is the cutover, and the
   only step with downtime.
5. Delete or disable the Pages project so it cannot redeploy over you.
6. Merge the branch to `main`.
7. Add `security` to the `release` job's `needs` in `.github/workflows/ci.yml`
   and delete the comment explaining why it is ungated — that comment exists
   only because this migration was outstanding. The audit on this branch is
   already 0, so the gate would pass today.

## Node version

`astro@7.3.1` declares `engines.node ">=22.12.0"`. `.nvmrc` pins 22 so the
build image cannot silently resolve to Node 20.

## Rollback

`main` is on the reverted, working stack. If the Worker misbehaves, point the
domain back at the Pages project; the Pages build still works from `main` until
step 5 removes it.
