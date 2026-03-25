# kaiano-wcs-website

West Coast Swing site for `wcs.kaianolevine.com` — built with Astro + Tailwind, deployed to Cloudflare Pages.

## Stack

| Layer | Choice |
|---|---|
| Framework | Astro 4 (SSR, `server` output) |
| Adapter | `@astrojs/cloudflare` |
| Styles | Tailwind CSS + PostCSS |
| Fonts | Oxanium (display) · IBM Plex Sans (body) · IBM Plex Mono (mono) |
| Hosting | Cloudflare Pages |
| Primary API | `deejay-marvel-api` on Railway — sets, live plays, stats |
| Legacy API | `api.kaianolevine.com` — **contact form only** |
| Spam | Cloudflare Turnstile |

## Quick start

```bash
cp .env.example .env   # fill in your values
npm install
npm run dev            # http://localhost:4321
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `PUBLIC_API_URL` | Yes | Base URL for deejay-marvel-api (e.g. `https://your-api.railway.app`) |
| `PUBLIC_LEGACY_API_URL` | Yes | Base URL for legacy API — contact form only |
| `PUBLIC_TURNSTILE_SITE_KEY` | Yes | Cloudflare Turnstile site key |

`PUBLIC_API_URL` is injected into `<html data-api-url>` at render time. All
client-side `fetch` calls read it from there — no extra round-trips needed.

## Pages

| Route | Source | Notes |
|---|---|---|
| `/` | `src/pages/index.astro` | Hero + StatsBar + feature cards |
| `/dj-marvel` | `src/pages/dj-marvel.astro` | Hub linking to DJ tools |
| `/sets` | `src/pages/sets/index.astro` | Year filter + paginated set list |
| `/sets/[id]` | `src/pages/sets/[id].astro` | Set detail + TrackTable |
| `/live` | `src/pages/live/index.astro` | Last 50 live plays |
| `/catalog` | `src/pages/catalog/index.astro` | TopArtists + TopTracks |
| `/booking` | `src/pages/booking/index.astro` | Booking index |
| `/booking/lessons` | `src/pages/booking/lessons.astro` | youcanbook.me links + accordion docs |
| `/booking/press-kit` | `src/pages/booking/press-kit.astro` | Google Drive asset links |
| `/locate` | `src/pages/locate/index.astro` | Google Calendar iframe |
| `/contact` | `src/pages/contact/index.astro` | Async form → legacy API |
| `/spotify` | `src/pages/spotify/index.astro` | Playlists via kaiano-api |
| `/about` | `src/pages/about/index.astro` | Coming soon placeholder |
| `/404` | `src/pages/404.astro` | 404 page |

## Components

| Component | API endpoint |
|---|---|
| `StatsBar` | `GET /v1/stats/overview` |
| `SetsList` | `GET /v1/sets?year=&limit=&offset=` |
| `TrackTable` | Receives `tracks[]` prop from `[id].astro` SSR fetch |
| `LiveHistory` | `GET /v1/live-plays/recent?limit=` |
| `TopArtists` | `GET /v1/stats/top-artists?limit=15` |
| `TopTracks` | `GET /v1/stats/top-tracks?limit=20` |
| `YearFilter` | No API — pure UI |

## One future wiring task

The `/spotify` page fetches `PUBLIC_API_URL/v1/spotify/playlists`. Adjust the path
in `src/pages/spotify/index.astro` once `kaiano-api` exposes the Spotify snapshot endpoint.

## Deploy

Push to `main`. Cloudflare Pages builds via `wrangler.toml` config.
Build command: `npm run build` · Output dir: `dist`
