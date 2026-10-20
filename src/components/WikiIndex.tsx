/** @jsxImportSource preact */
import { useEffect, useMemo, useState } from "preact/hooks";
import { getSessionToken, handleDenial } from "../lib/session";
import {
  KIND_LABELS,
  formatDate,
  pageHref,
  pagesPath,
  plainText,
  type WikiMode,
  type WikiPageSummary,
} from "../lib/wiki";

// The wiki's index: every page the caller can see, searchable,
// filterable by kind, sorted by name or by when it last changed. One request
// returns the whole index; filtering happens here.

type Props = { apiBase: string; mode: WikiMode };

/** Rows drawn before "show all": the index is about a thousand pages. */
const FIRST_ROWS = 150;

const BTN_CLASS =
  "rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-xs font-mono transition-colors hover:border-white/20 hover:text-slate-100";
const BTN_ON = " border-accent bg-accent/15 text-accent";

function snippet(text: string): string {
  const plain = plainText(text);
  const end = plain.search(/[.!?](\s|$)/);
  const first = end >= 0 ? plain.slice(0, end + 1) : plain;
  return first.length > 180 ? `${first.slice(0, 177).trimEnd()}…` : first;
}

/** How many of the query's words the page contains. */
function score(page: WikiPageSummary, words: string[]): number {
  const hay = [page.name, page.slug, ...page.aliases, plainText(page.definition)]
    .join(" ")
    .toLowerCase();
  return words.filter((w) => hay.includes(w)).length;
}

const STOP = new Set(["a", "an", "and", "the", "of", "in", "on", "to", "with", "for"]);

export default function WikiIndex({ apiBase, mode }: Props) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; pages: WikiPageSummary[] }
  >({ kind: "loading" });
  const [query, setQuery] = useState(
    typeof location !== "undefined"
      ? (new URLSearchParams(location.search).get("q") ?? "")
      : "",
  );
  const [kind, setKind] = useState("");
  const [sort, setSort] = useState<"name" | "recent">("name");
  const [all, setAll] = useState(false);
  const asPublic =
    mode === "admin" &&
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).get("as") === "public";

  useEffect(() => {
    if (!apiBase) {
      setState({ kind: "error", message: "Could not load the wiki." });
      return;
    }
    const controller = new AbortController();
    (async () => {
      const token = (await getSessionToken()) || "";
      if (!token) return null;
      return fetch(`${apiBase.replace(/\/$/, "")}${pagesPath(mode, undefined, asPublic)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    })()
      .then(async (res) => {
        if (res === null) {
          setState({ kind: "error", message: "Sign in to view this." });
          return null;
        }
        if (res.status === 401 || res.status === 403) {
          handleDenial(res.status);
          await new Promise<never>(() => {});
        }
        if (!res.ok) throw new Error("Could not load the wiki.");
        const json = await res.json();
        if (!Array.isArray(json?.data)) throw new Error("Could not load the wiki.");
        return json.data as WikiPageSummary[];
      })
      .then((pages) => {
        if (pages) setState({ kind: "ready", pages });
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setState({ kind: "error", message: err.message || "Could not load the wiki." });
      });
    return () => controller.abort();
  }, [apiBase, mode, asPublic]);

  const pages = state.kind === "ready" ? state.pages : [];
  const kinds = useMemo(
    () => Object.keys(KIND_LABELS).filter((k) => pages.some((p) => p.kind === k)),
    [pages],
  );
  const shown = useMemo(() => {
    const ofKind = pages.filter((p) => !kind || p.kind === kind);
    const words = query.toLowerCase().split(/\s+/).filter((w) => w && !STOP.has(w));
    let rows = ofKind;
    if (words.length) {
      // Every word, when anything has them all; otherwise the pages with the
      // most of them — a folded topic's words are rarely all on its page.
      const scored = ofKind
        .map((p) => ({ p, n: score(p, words) }))
        .filter((r) => r.n > 0);
      const full = scored.filter((r) => r.n === words.length);
      rows = (full.length ? full : scored.sort((a, b) => b.n - a.n)).map((r) => r.p);
    }
    if (sort === "recent") {
      rows = [...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    }
    return rows;
  }, [pages, kind, query, sort]);

  if (state.kind === "loading") return <div class="text-sm text-slate-500">Loading…</div>;
  if (state.kind === "error") return <div class="text-sm text-slate-500">{state.message}</div>;

  const visible = all ? shown : shown.slice(0, FIRST_ROWS);
  const toggleAsPublic = () => {
    const params = new URLSearchParams(location.search);
    if (asPublic) params.delete("as");
    else params.set("as", "public");
    location.search = params.toString();
  };

  return (
    <div>
      <div class="mb-8 space-y-4">
        <div class="flex items-center gap-3">
          <span class="shrink-0 text-xs font-mono text-slate-500">Search</span>
          <input
            type="text"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            placeholder="Name, alias or definition…"
            class="w-full max-w-sm rounded-full border border-white/10 bg-white/[0.02] px-4 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 outline-none focus:border-accent/50 transition-colors"
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="shrink-0 text-xs font-mono text-slate-500">Kind</span>
          {["", ...kinds].map((k) => (
            <button
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              class={BTN_CLASS + (kind === k ? BTN_ON : "")}
            >
              {k ? KIND_LABELS[k] : "All"}
            </button>
          ))}
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="shrink-0 text-xs font-mono text-slate-500">Sort</span>
          <button
            type="button"
            aria-pressed={sort === "name"}
            onClick={() => setSort("name")}
            class={BTN_CLASS + (sort === "name" ? BTN_ON : "")}
          >
            Name
          </button>
          <button
            type="button"
            aria-pressed={sort === "recent"}
            onClick={() => setSort("recent")}
            class={BTN_CLASS + (sort === "recent" ? BTN_ON : "")}
          >
            Recently changed
          </button>
          {mode === "admin" ? (
            <button type="button" onClick={toggleAsPublic} class={BTN_CLASS + " ml-4"}>
              {asPublic ? "Showing public pages — show all" : "Show only public pages"}
            </button>
          ) : null}
        </div>
      </div>

      <p class="mb-5 text-xs font-mono text-slate-500">
        {shown.length === pages.length
          ? `${pages.length} page${pages.length === 1 ? "" : "s"}`
          : `${shown.length} of ${pages.length}`}
      </p>

      {shown.length === 0 ? (
        <p class="text-sm text-slate-500">No pages match.</p>
      ) : (
        <ul class="divide-y divide-white/5">
          {visible.map((p) => (
            <li class="py-3">
              <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <a
                  href={pageHref(mode, p.slug)}
                  class="text-sm font-medium text-slate-100 hover:text-accent transition-colors"
                >
                  {p.name}
                </a>
                <span class="text-[10px] font-mono uppercase tracking-wide text-slate-600">
                  {KIND_LABELS[p.kind] || p.kind}
                </span>
                {sort === "recent" ? (
                  <span class="text-[10px] font-mono text-slate-600">
                    {formatDate(p.updated_at)}
                  </span>
                ) : null}
              </div>
              {p.definition ? (
                <p class="mt-1 text-sm text-slate-400 leading-snug">{snippet(p.definition)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!all && shown.length > FIRST_ROWS ? (
        <button
          type="button"
          onClick={() => setAll(true)}
          class={BTN_CLASS + " mt-6"}
        >
          Show all {shown.length}
        </button>
      ) : null}
    </div>
  );
}
