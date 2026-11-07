/** @jsxImportSource preact */
import { useEffect, useState } from "preact/hooks";
import { getSessionToken } from "../lib/session";
import { megabytes, minutes } from "../lib/duplicates";
import { entryBody, guessFromPath, type EntryForm } from "../lib/unidentified";

// The owner's page for library files the nightly run could not identify
// (deejay-cog ADR-0008, decision 2: no entry from an unconfident
// identification). Each file can be linked to a catalog entry found by title
// or artist, or to a new library entry made from parts the owner enters.
// Linked files get the catalog's values on the next nightly sync. Listing and
// linking need catalog.tracks.write: the API decides, and a refusal is what a
// visitor without it sees.

type Props = { apiBase: string };

type LibraryFile = {
  drive_file_id: string;
  path: string;
  size_bytes: number | null;
  duration_secs: number | null;
  edit_label: string | null;
  comment_backup: string | null;
  first_seen: string;
};

type Listed = { id: string; title: string; artist: string; play_count: number };

const PAGE = 50;
const INPUT =
  "w-full rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-sm text-slate-100 focus:border-accent focus:outline-none";
const BTN =
  "rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-sm text-slate-200 transition-colors hover:border-accent hover:text-accent disabled:opacity-50";

type State =
  | { kind: "loading" }
  | { kind: "refused"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "ready" };

function FileCard({
  file,
  base,
  link,
}: {
  file: LibraryFile;
  base: string;
  link: (file: LibraryFile, body: Record<string, unknown>) => Promise<string | null>;
}) {
  const [tab, setTab] = useState<"none" | "find" | "new">("none");
  const [query, setQuery] = useState(guessFromPath(file.path).title);
  const [results, setResults] = useState<Listed[]>([]);
  const [form, setForm] = useState<EntryForm>({
    ...guessFromPath(file.path),
    remix: "",
    genre: "",
    bpm: "",
    release_year: "",
    label: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function find(e?: Event) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    const [byTitle, byArtist] = await Promise.all(
      ["title", "artist"].map((field) =>
        fetch(`${base}/v1/catalog?${field}=${encodeURIComponent(q)}&limit=15`).then((r) =>
          r.ok ? r.json() : { data: [] },
        ),
      ),
    );
    const seen = new Map<string, Listed>();
    for (const row of [...byTitle.data, ...byArtist.data] as Listed[]) seen.set(row.id, row);
    setResults([...seen.values()]);
  }

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const problem = await link(file, body);
    setBusy(false);
    if (problem) setError(problem);
  }

  const field = (key: keyof EntryForm, label: string) => (
    <label class="space-y-1 text-xs text-slate-400">
      <span>{label}</span>
      <input
        class={INPUT}
        value={form[key]}
        onInput={(e) => setForm({ ...form, [key]: (e.target as HTMLInputElement).value })}
      />
    </label>
  );

  return (
    <li class="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div>
        <p class="font-mono text-xs text-slate-200">{file.path}</p>
        <p class="text-xs text-slate-400">
          {megabytes(file.size_bytes)} · {minutes(file.duration_secs)}
          {file.edit_label ? ` · ${file.edit_label}` : ""} · found{" "}
          {new Date(file.first_seen).toLocaleDateString()}
        </p>
        {file.comment_backup && (
          <p class="mt-1 text-xs text-slate-500">Comment: {file.comment_backup}</p>
        )}
      </div>
      <div class="flex flex-wrap gap-2">
        <button class={BTN} onClick={() => setTab(tab === "find" ? "none" : "find")}>
          Link to an entry
        </button>
        <button class={BTN} onClick={() => setTab(tab === "new" ? "none" : "new")}>
          New entry
        </button>
      </div>
      {tab === "find" && (
        <div class="space-y-2">
          <form class="flex gap-2" onSubmit={find}>
            <input
              class={INPUT}
              placeholder="Title or artist"
              value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
            <button class={BTN} type="submit">
              Find
            </button>
          </form>
          {results.length > 0 && (
            <ul class="divide-y divide-white/5 rounded-md border border-white/10">
              {results.map((r) => (
                <li>
                  <button
                    class="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-white/[0.03] disabled:opacity-50"
                    disabled={busy}
                    onClick={() => send({ catalog_id: r.id })}
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
        </div>
      )}
      {tab === "new" && (
        <div class="space-y-3">
          <div class="grid gap-3 sm:grid-cols-2">
            {field("title", "Title")}
            {field("artist", "Artist, with any featured artists")}
            {field("remix", "Version (remix, live, acoustic…)")}
            {field("genre", "Genre")}
            {field("bpm", "BPM")}
            {field("release_year", "Year")}
            {field("label", "Record label")}
          </div>
          <button
            class={BTN}
            disabled={busy || !form.title.trim() || !form.artist.trim()}
            onClick={() => send({ entry: entryBody(form) })}
          >
            {busy ? "Saving…" : "Make the entry and link the file"}
          </button>
        </div>
      )}
      {error && <p class="text-sm text-red-300">{error}</p>}
    </li>
  );
}

export default function CatalogUnidentified({ apiBase }: Props) {
  const base = apiBase.replace(/\/$/, "");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState<string[]>([]);

  async function authed(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await getSessionToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${base}${path}`, { ...init, headers });
  }

  async function load(offset: number) {
    const res = await authed(`/v1/catalog/library/unidentified?limit=${PAGE}&offset=${offset}`);
    if (res.status === 401 || res.status === 403) {
      setState({
        kind: "refused",
        message: `The API refused (${res.status}): this page needs catalog.tracks.write.`,
      });
      return;
    }
    if (!res.ok) {
      setState({ kind: "failed", message: `The API answered ${res.status}.` });
      return;
    }
    const body = await res.json();
    setFiles((before) => (offset === 0 ? body.data : [...before, ...body.data]));
    setTotal(body.meta?.total ?? body.data.length);
    setState({ kind: "ready" });
  }

  useEffect(() => {
    load(0);
  }, []);

  async function link(file: LibraryFile, body: Record<string, unknown>): Promise<string | null> {
    const res = await authed(
      `/v1/catalog/library/files/${encodeURIComponent(file.drive_file_id)}/link`,
      { method: "POST", body: JSON.stringify(body) },
    );
    if (res.status === 401 || res.status === 403) return `The API refused (${res.status}).`;
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      return err?.error?.message ?? `The API answered ${res.status}.`;
    }
    const data = (await res.json()).data;
    setFiles((before) => before.filter((f) => f.drive_file_id !== file.drive_file_id));
    setTotal((t) => Math.max(0, t - 1));
    setDone((before) => [
      `${file.path} → ${data.entry.title} — ${data.entry.artist}` +
        `${data.created ? " (new entry)" : ""}; its tags are written on the next nightly sync.`,
      ...before,
    ]);
    return null;
  }

  if (state.kind === "loading") return <p class="text-sm text-slate-500">Loading…</p>;
  if (state.kind !== "ready") return <p class="text-sm text-slate-400">{state.message}</p>;

  return (
    <div class="space-y-6">
      {done.length > 0 && (
        <ul class="space-y-1 text-sm text-emerald-300">
          {done.map((line) => (
            <li>{line}</li>
          ))}
        </ul>
      )}
      <p class="text-sm text-slate-400">
        {total === 0
          ? "Every library file is identified."
          : `${total} unidentified ${total === 1 ? "file" : "files"}.`}
      </p>
      <ul class="space-y-4">
        {files.map((f) => (
          <FileCard key={f.drive_file_id} file={f} base={base} link={link} />
        ))}
      </ul>
      {files.length < total && (
        <button class={BTN} onClick={() => load(files.length)}>
          Show more
        </button>
      )}
    </div>
  );
}
