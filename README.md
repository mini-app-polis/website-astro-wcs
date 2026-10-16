# website-astro-wcs

West Coast Swing site for `wcs.kaianolevine.com` — built with Astro + Tailwind, deployed to Cloudflare Pages.

## Stack

| Layer | Choice |
|---|---|
| Framework | Astro 7 (static output) + Preact islands |
| Adapter | None — every page is static; authorization is enforced by the API |
| Styles | Tailwind CSS 4 via `@tailwindcss/vite` |
| Auth | `@clerk/astro`, client-side only (sign-in, session token for API calls) |
| Hosting | Cloudflare Pages |
| Primary API | `api-kaianolevine-com` on Railway — sets, live plays, stats, contact form |

## Running locally

```bash
cp .env.example .env   # fill in your values
npm install
npm run dev            # http://localhost:4321
npm run build          # verify build succeeds
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `KAIANO_API_BASE_URL` | Yes | Base URL for api-kaianolevine-com |
| `PUBLIC_TURNSTILE_SITE_KEY` | Yes | Cloudflare Turnstile site key (contact form + survey) |
| `PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key (sign-in) |

All three are read at build time and baked into the static output. `KAIANO_API_BASE_URL` is injected into `<html data-api-url>`; client-side fetches read it from there. Access to notes and admin pages is decided by the API's scope checks, not by anything in this site.

## Pages

| Route | Notes |
|---|---|
| `/` | Hero + StatsBar + feature cards |
| `/dj-marvel` | DJ links hub |
| `/sets` | Year filter + paginated set list |
| `/sets/detail?id=<id>` | Set detail + track table |
| `/sets/collection` | Complete collection — every song, by years played |
| `/sets/summary` | Annual summary |
| `/live` | Last 50 live plays |
| `/catalog` | Top artists + top tracks |
| `/notes` | Signed-in lesson notes (Clerk sign-in; API decides access) |
| `/notes/detail?id=<id>` | Individual note detail |
| `/notes/ask` | Ask questions of the notes |
| `/notes/admin`, `/notes/admin/detail` | Admin view of notes |
| `/admin/users`, `/admin/notes`, `/admin/notes/detail` | Admin pages (`/admin` redirects to `/admin/users`) |
| `/sign-in` | Clerk sign-in |
| `/booking` | Booking index + `/booking/lessons` + `/booking/press-kit` |
| `/locate` | Google Calendar embed |
| `/contact` | Contact form → api-kaianolevine-com |
| `/survey` | Survey form → api-kaianolevine-com |
| `/spotify` | Spotify playlists |
| `/about` | Coming soon |

Redirects: `/book-now` → `/booking/lessons` (astro.config), `/submit-music` → deejaytools.com (`public/_redirects`).

## Deploy

Push to `main`. Cloudflare Pages builds automatically.

Build command: `npm run build` · Output dir: `dist`
