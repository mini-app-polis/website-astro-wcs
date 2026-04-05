# website-astro-wcs

West Coast Swing site for `wcs.kaianolevine.com` — built with Astro + Tailwind, deployed to Cloudflare Pages.

## Stack

| Layer | Choice |
|---|---|
| Framework | Astro 4 (SSR, `server` output) |
| Adapter | `@astrojs/cloudflare` |
| Styles | Tailwind CSS + PostCSS |
| Auth | `@clerk/astro` + `@clerk/backend` (notes section) |
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
| `PUBLIC_TURNSTILE_SITE_KEY` | Yes | Cloudflare Turnstile site key (contact form) |
| `PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key (notes auth) |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key (server-side) |
| `NOTES_ALLOWED_USER_ID` | Yes | Clerk user ID with notes access |
| `CLERK_JWT_KEY` | Yes | Clerk JWT public key for networkless token verification |

`KAIANO_API_BASE_URL` is injected into `<html data-api-url>` at render time. Client-side fetches read it from there.

## Pages

| Route | Notes |
|---|---|
| `/` | Hero + StatsBar + feature cards |
| `/sets` | Year filter + paginated set list |
| `/sets/[id]` | Set detail + track table |
| `/live` | Last 50 live plays |
| `/catalog` | Top artists + top tracks |
| `/notes` | Auth-gated lesson notes (Clerk) |
| `/notes/[id]` | Individual note detail |
| `/booking` | Booking index + lessons + press kit |
| `/locate` | Google Calendar embed |
| `/contact` | Contact form → api-kaianolevine-com |
| `/spotify` | Spotify playlists |
| `/about` | Coming soon |

## Deploy

Push to `main`. Cloudflare Pages builds automatically.

Build command: `npm run build` · Output dir: `dist`
