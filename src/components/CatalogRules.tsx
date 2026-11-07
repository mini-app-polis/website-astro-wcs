/** @jsxImportSource preact */
import { useEffect, useState } from "preact/hooks";
import { getSessionToken } from "../lib/session";

// The catalog's display rules, edited by the owner: how every entry's parts
// are written out as the title and artist shown (deejay-cog ADR-0008,
// decisions 3 and 11). Reading the rules is public; saving needs the API's
// catalog.tracks.write, and the API's refusal is what a visitor without it
// sees. A saved change reaches every linked file on the next nightly sync.
//
// The example under the form is written out here, in the browser, so it
// updates as a rule changes. It follows the API's services/display.py; the
// API's own render is what every reader and every file gets, and the example
// is only a preview of it.

type Rules = {
  featured_placement: "artist" | "title";
  featured_word: string;
  artist_joiner: string;
  version_open: string;
  version_close: string;
  bpm_decimals: number;
  case_style: "as_styled";
  changed_at?: string | null;
};

type Props = { apiBase: string };

/** A song with every part filled, so each rule shows in the example. */
const EXAMPLE = {
  base_title: "Attention",
  version: "Lash Remix",
  main_artists: ["Charlie Puth", "Kelly Clarkson"],
  featured_artists: ["Kehlani", "Jessie Reyez"],
  bpm: 95.46,
};

/** The example as the rules write it out (see the note above). */
export function writeOut(rules: Rules): { title: string; artist: string; bpm: string } {
  let title = EXAMPLE.base_title;
  if (EXAMPLE.version) title = `${title} ${rules.version_open}${EXAMPLE.version}${rules.version_close}`;
  let artist = EXAMPLE.main_artists.join(rules.artist_joiner);
  const credit = `${rules.featured_word} ${EXAMPLE.featured_artists.join(rules.artist_joiner)}`;
  if (rules.featured_placement === "artist") artist = `${artist} ${credit}`;
  else title = `${title} ${rules.version_open}${credit}${rules.version_close}`;
  return { title, artist, bpm: EXAMPLE.bpm.toFixed(rules.bpm_decimals) };
}

const INPUT =
  "w-full rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-sm text-slate-100 focus:border-accent focus:outline-none";
const BTN =
  "rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-sm text-slate-200 transition-colors hover:border-accent hover:text-accent disabled:opacity-50";

type Status =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "refused"; message: string }
  | { kind: "error"; message: string };

export default function CatalogRules({ apiBase }: Props) {
  const base = apiBase.replace(/\/$/, "");
  const [rules, setRules] = useState<Rules | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    fetch(`${base}/v1/catalog/display-rules`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        setRules(json.data as Rules);
        setStatus({ kind: "ready" });
      })
      .catch((e: Error) => setStatus({ kind: "error", message: e.message }));
  }, [base]);

  if (!rules) {
    return (
      <p class="text-sm text-slate-500">
        {status.kind === "error" ? `Could not load the rules (${status.message}).` : "Loading…"}
      </p>
    );
  }

  const set = <K extends keyof Rules>(key: K, value: Rules[K]) => {
    setRules({ ...rules, [key]: value });
    if (status.kind === "saved" || status.kind === "refused") setStatus({ kind: "ready" });
  };

  async function save() {
    if (!rules) return;
    setStatus({ kind: "saving" });
    const token = await getSessionToken();
    if (!token) {
      setStatus({ kind: "refused", message: "Sign in to change the rules." });
      return;
    }
    const { changed_at: _ignored, ...body } = rules;
    const res = await fetch(`${base}/v1/catalog/display-rules`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) {
      setStatus({
        kind: "refused",
        message: `The API refused the change (${res.status}): changing the rules needs catalog.tracks.write.`,
      });
      return;
    }
    if (!res.ok) {
      setStatus({ kind: "error", message: `The API answered ${res.status}.` });
      return;
    }
    const json = await res.json();
    setRules(json.data as Rules);
    setStatus({ kind: "saved", at: json.data.changed_at ?? "" });
  }

  const shown = writeOut(rules);
  return (
    <div class="space-y-6">
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="space-y-1 text-sm text-slate-300">
          <span>Featured artists go in</span>
          <select
            class={INPUT}
            value={rules.featured_placement}
            onChange={(e) =>
              set("featured_placement", (e.target as HTMLSelectElement).value as Rules["featured_placement"])
            }
          >
            <option value="artist">the artist</option>
            <option value="title">the title</option>
          </select>
        </label>
        <label class="space-y-1 text-sm text-slate-300">
          <span>Word before featured artists</span>
          <input
            class={INPUT}
            value={rules.featured_word}
            onInput={(e) => set("featured_word", (e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="space-y-1 text-sm text-slate-300">
          <span>Between artists</span>
          <input
            class={INPUT}
            value={rules.artist_joiner}
            onInput={(e) => set("artist_joiner", (e.target as HTMLInputElement).value)}
          />
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="space-y-1 text-sm text-slate-300">
            <span>Version opens with</span>
            <input
              class={INPUT}
              value={rules.version_open}
              onInput={(e) => set("version_open", (e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="space-y-1 text-sm text-slate-300">
            <span>and closes with</span>
            <input
              class={INPUT}
              value={rules.version_close}
              onInput={(e) => set("version_close", (e.target as HTMLInputElement).value)}
            />
          </label>
        </div>
        <label class="space-y-1 text-sm text-slate-300">
          <span>BPM decimals</span>
          <select
            class={INPUT}
            value={String(rules.bpm_decimals)}
            onChange={(e) => set("bpm_decimals", Number((e.target as HTMLSelectElement).value))}
          >
            {[0, 1, 2, 3].map((n) => (
              <option value={String(n)}>{n}</option>
            ))}
          </select>
        </label>
        <div class="space-y-1 text-sm text-slate-300">
          <span>Capitalisation</span>
          <p class="text-slate-500">Kept as the artist styles it.</p>
        </div>
      </div>

      <div class="rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <p class="text-xs font-mono uppercase tracking-wide text-slate-500">Example</p>
        <p class="mt-2 text-slate-100">{shown.title}</p>
        <p class="text-slate-300">{shown.artist}</p>
        <p class="text-xs font-mono text-slate-500">{shown.bpm} BPM</p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <button class={BTN} disabled={status.kind === "saving"} onClick={save}>
          {status.kind === "saving" ? "Saving…" : "Save the rules"}
        </button>
        <span class="text-sm text-slate-400">
          {status.kind === "saved" && "Saved. Every linked file gets the new display on the next nightly sync."}
          {status.kind === "refused" && status.message}
          {status.kind === "error" && status.message}
        </span>
      </div>
      <p class="text-xs text-slate-500">
        A change reaches every file linked to the catalog on the next nightly sync.
        {rules.changed_at ? ` Last changed ${new Date(rules.changed_at).toLocaleString()}.` : " These are the first rules."}
      </p>
    </div>
  );
}
