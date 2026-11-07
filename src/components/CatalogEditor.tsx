/** @jsxImportSource preact */
import { useEffect, useRef, useState } from "preact/hooks";
import { getSessionToken } from "../lib/session";

// The owner's catalog editor (deejay-cog ADR-0008, decision 7): find an
// entry by title or artist, see its parts and how it is shown, edit any owned
// field with a live preview of the title and artist, and save through the
// API. Finding entries uses the public catalog reads; opening one for editing
// asks the API for a preview, which needs catalog.tracks.write, so a visitor
// without it sees the API's refusal instead of the form. The API decides;
// nothing here reads roles.

type Props = { apiBase: string };

type Listed = { id: string; title: string; artist: string; play_count: number };

type Detail = {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  subgenre: string | null;
  bpm: number | null;
  release_year: number | null;
  label: string | null;
  base_title: string | null;
  version: string | null;
  main_artists: string[];
  featured_artists: string[];
  play_count: number;
  source: string;
  updated_at: string | null;
};

/** The form's fields, as text. Artists are one per line. */
type Form = {
  base_title: string;
  version: string;
  main_artists: string;
  featured_artists: string;
  genre: string;
  subgenre: string;
  bpm: string;
  release_year: string;
  label: string;
};

const INPUT =
  "w-full rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-sm text-slate-100 focus:border-accent focus:outline-none";
const BTN =
  "rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-sm text-slate-200 transition-colors hover:border-accent hover:text-accent disabled:opacity-50";

function toForm(d: Detail): Form {
  return {
    base_title: d.base_title ?? "",
    version: d.version ?? "",
    main_artists: (d.main_artists ?? []).join("\n"),
    featured_artists: (d.featured_artists ?? []).join("\n"),
    genre: d.genre ?? "",
    subgenre: d.subgenre ?? "",
    bpm: d.bpm == null ? "" : String(d.bpm),
    release_year: d.release_year == null ? "" : String(d.release_year),
    label: d.label ?? "",
  };
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The PATCH body: only the fields that differ from the entry; "" clears. */
export function changes(before: Form, after: Form): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof Form)[]) {
    if (after[key] === before[key]) continue;
    const value = after[key].trim();
    if (key === "main_artists" || key === "featured_artists") body[key] = lines(after[key]);
    else if (key === "bpm") body[key] = value === "" ? null : Number(value);
    else if (key === "release_year") body[key] = value === "" ? null : Number.parseInt(value, 10);
    else body[key] = value === "" ? null : value;
  }
  return body;
}

type Mode =
  | { kind: "search" }
  | { kind: "loading" }
  | { kind: "refused"; message: string }
  | { kind: "editing" };

export default function CatalogEditor({ apiBase }: Props) {
  const base = apiBase.replace(/\/$/, "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Listed[]>([]);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: "search" });
  const [entry, setEntry] = useState<Detail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [preview, setPreview] = useState<{ title: string; artist: string } | null>(null);
  const [message, setMessage] = useState("");
  const timer = useRef<number | undefined>(undefined);

  async function authed(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await getSessionToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${base}${path}`, { ...init, headers });
  }

  async function search(e?: Event) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const [byTitle, byArtist] = await Promise.all(
        ["title", "artist"].map((field) =>
          fetch(`${base}/v1/catalog?${field}=${encodeURIComponent(q)}&limit=25`).then((r) =>
            r.ok ? r.json() : { data: [] },
          ),
        ),
      );
      const seen = new Map<string, Listed>();
      for (const row of [...byTitle.data, ...byArtist.data] as Listed[]) seen.set(row.id, row);
      setResults([...seen.values()]);
    } finally {
      setSearching(false);
    }
  }

  async function renderPreview(id: string, f: Form): Promise<Response> {
    const params = new URLSearchParams();
    if (f.base_title.trim()) params.set("base_title", f.base_title.trim());
    params.set("version", f.version.trim());
    for (const a of lines(f.main_artists)) params.append("main_artists", a);
    for (const a of lines(f.featured_artists)) params.append("featured_artists", a);
    return authed(`/v1/catalog/${id}/preview?${params}`);
  }

  async function open(id: string) {
    setMode({ kind: "loading" });
    setMessage("");
    const res = await fetch(`${base}/v1/catalog/${id}`);
    if (!res.ok) {
      setMode({ kind: "refused", message: `Could not read the entry (${res.status}).` });
      return;
    }
    const detail = (await res.json()).data as Detail;
    const f = toForm(detail);
    const shown = await renderPreview(id, f);
    if (shown.status === 401 || shown.status === 403) {
      setMode({
        kind: "refused",
        message: `The API refused (${shown.status}): editing the catalog needs catalog.tracks.write.`,
      });
      return;
    }
    setEntry(detail);
    setForm(f);
    setPreview(shown.ok ? (await shown.json()).data : null);
    setMode({ kind: "editing" });
  }

  useEffect(() => {
    if (!entry || !form) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const res = await renderPreview(entry.id, form);
      if (res.ok) setPreview((await res.json()).data);
    }, 300);
    return () => window.clearTimeout(timer.current);
  }, [form?.base_title, form?.version, form?.main_artists, form?.featured_artists]);

  async function save() {
    if (!entry || !form) return;
    const body = changes(toForm(entry), form);
    if (Object.keys(body).length === 0) {
      setMessage("Nothing to save.");
      return;
    }
    setMessage("Saving…");
    const res = await authed(`/v1/catalog/${entry.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) {
      setMessage(`The API refused the edit (${res.status}).`);
      return;
    }
    if (!res.ok) {
      setMessage(`The API answered ${res.status}: ${await res.text()}`);
      return;
    }
    const saved = (await res.json()).data as Detail;
    setEntry(saved);
    setForm(toForm(saved));
    setMessage("Saved. Linked files get the change on the next nightly sync.");
  }

  const field = (key: keyof Form, label: string, multiline = false) => (
    <label class="space-y-1 text-sm text-slate-300">
      <span>{label}</span>
      {multiline ? (
        <textarea
          rows={2}
          class={INPUT}
          value={form?.[key] ?? ""}
          onInput={(e) => form && setForm({ ...form, [key]: (e.target as HTMLTextAreaElement).value })}
        />
      ) : (
        <input
          class={INPUT}
          value={form?.[key] ?? ""}
          onInput={(e) => form && setForm({ ...form, [key]: (e.target as HTMLInputElement).value })}
        />
      )}
    </label>
  );

  return (
    <div class="space-y-6">
      <form class="flex gap-2" onSubmit={search}>
        <input
          class={INPUT}
          placeholder="Title or artist"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
        <button class={BTN} disabled={searching} type="submit">
          {searching ? "Finding…" : "Find"}
        </button>
      </form>

      {results.length > 0 && mode.kind !== "editing" && (
        <ul class="divide-y divide-white/5 rounded-lg border border-white/10">
          {results.map((r) => (
            <li>
              <button
                class="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-white/[0.03]"
                onClick={() => open(r.id)}
              >
                <span class="text-slate-100">
                  {r.title} <span class="text-slate-400">— {r.artist}</span>
                </span>
                <span class="font-mono text-xs text-slate-500">{r.play_count} plays</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {mode.kind === "loading" && <p class="text-sm text-slate-500">Loading…</p>}
      {mode.kind === "refused" && <p class="text-sm text-slate-400">{mode.message}</p>}

      {mode.kind === "editing" && entry && form && (
        <div class="space-y-5">
          <div class="rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <p class="text-xs font-mono uppercase tracking-wide text-slate-500">Shown as</p>
            <p class="mt-2 text-slate-100">{preview?.title ?? entry.title}</p>
            <p class="text-slate-300">{preview?.artist ?? entry.artist}</p>
            <p class="text-xs font-mono text-slate-500">
              {entry.play_count} plays · {entry.source}
              {entry.updated_at ? ` · changed ${new Date(entry.updated_at).toLocaleString()}` : ""}
            </p>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            {field("base_title", "Title (without the version)")}
            {field("version", "Version (remix, live, acoustic…)")}
            {field("main_artists", "Main artists, one per line", true)}
            {field("featured_artists", "Featured artists, one per line", true)}
            {field("genre", "Genre")}
            {field("subgenre", "Subgenre")}
            {field("bpm", "BPM")}
            {field("release_year", "Year")}
            {field("label", "Label")}
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <button class={BTN} onClick={save}>
              Save
            </button>
            <button
              class={BTN}
              onClick={() => {
                setMode({ kind: "search" });
                setEntry(null);
                setForm(null);
                setMessage("");
              }}
            >
              Back to results
            </button>
            <span class="text-sm text-slate-400">{message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
