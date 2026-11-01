import { logger } from "./logger";

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

export interface StatsOverview {
  total_sets: number;
  total_plays: number;
  unique_tracks: number;
  years_active: number;
  most_played_artist: string;
}

export interface SetListItem {
  id: string;
  set_date: string;
  year: number;
  venue: string;
  source_file: string | null;
  track_count?: number;
}

export interface TrackListItem {
  id: string;
  set_id: string;
  set_date: string;
  venue: string;
  play_order: number | null;
  play_time: string | null;
  label: string | null;
  title: string;
  remix: string | null;
  artist: string;
  comment: string | null;
  genre: string | null;
  bpm: number | null;
  release_year: number | null;
  length_secs: number | null;
  data_quality: string;
  catalog_id: string | null;
}

export interface SetDetail extends SetListItem {
  tracks: TrackListItem[];
}

export interface ArtistStat {
  artist: string;
  play_count: number;
}

export interface TrackStat {
  title: string;
  artist: string;
  play_count: number;
}

export interface ByYear {
  year: number;
  set_count: number;
  track_count: number;
}

export interface LivePlay {
  id: string;
  title: string;
  artist: string;
  played_at: string;
  venue?: string;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the API base URL: `runtimeUrl` when given; otherwise PUBLIC_API_URL
 * during SSR, or the `data-api-url` attribute on <html> in the browser.
 * Returns "" when none is set.
 */
export function getApiBase(runtimeUrl?: string): string {
  if (runtimeUrl) return runtimeUrl;
  if (typeof document === "undefined") {
    // SSR
    const url = import.meta.env.PUBLIC_API_URL as string | undefined;
    return url ?? "";
  }
  // Client — injected on <html data-api-url>
  return document.documentElement.dataset.apiUrl ?? "";
}

async function apiFetch<T>(path: string, fallback: T, baseUrl?: string): Promise<T> {
  try {
    const base = getApiBase(baseUrl);
    if (!base) {
      logger.warn({ event: "api_base_url_missing", category: "api", context: { path } });
      return fallback;
    }
    const res = await fetch(`${base.replace(/\/$/, "")}${path}`);
    if (!res.ok) {
      logger.warn({ event: "api_bad_response", category: "api", context: { path, status: res.status } });
      return fallback;
    }
    const json = await res.json();
    return ((json && "data" in json ? json.data : undefined) ?? fallback) as T;
  } catch (e) {
    logger.error({ event: "api_request_failed", category: "api", context: { path }, error: e });
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Endpoint functions
// ---------------------------------------------------------------------------

/** Fetch the headline stats (set, play and track totals, years active, most-played artist); zeroed stats on failure. */
export const getOverview = (baseUrl?: string) =>
  apiFetch<StatsOverview>("/v1/stats/overview", {
    total_sets: 0,
    total_plays: 0,
    unique_tracks: 0,
    years_active: 0,
    most_played_artist: "",
  }, baseUrl);

/** Fetch the list of DJ sets, filtered by `params` as query-string parameters; [] on failure. */
export const getSets = (params: Record<string, string | number> = {}, baseUrl?: string) => {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  return apiFetch<SetListItem[]>(`/v1/sets${qs ? `?${qs}` : ""}`, [], baseUrl);
};

/** Fetch one set and its tracks by id; null on failure. */
export const getSetDetail = (id: string, baseUrl?: string) =>
  apiFetch<SetDetail | null>(`/v1/sets/${id}`, null, baseUrl);

/** Fetch the `limit` most-played artists with their play counts; [] on failure. */
export const getTopArtists = (limit = 20, baseUrl?: string) =>
  apiFetch<ArtistStat[]>(`/v1/stats/top-artists?limit=${limit}`, [], baseUrl);

/** Fetch the `limit` most-played tracks with their play counts; [] on failure. */
export const getTopTracks = (limit = 20, baseUrl?: string) =>
  apiFetch<TrackStat[]>(`/v1/stats/top-tracks?limit=${limit}`, [], baseUrl);

/** Fetch set and track counts per year; [] on failure. */
export const getByYear = (baseUrl?: string) =>
  apiFetch<ByYear[]>("/v1/stats/by-year", [], baseUrl);

/** Fetch the `limit` most recent live plays; [] on failure. */
export const getLivePlays = (limit = 50, baseUrl?: string) =>
  apiFetch<LivePlay[]>(`/v1/live-plays/recent?limit=${limit}`, [], baseUrl);
