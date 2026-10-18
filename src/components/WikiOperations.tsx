/** @jsxImportSource preact */
import { useEffect, useRef, useState } from "preact/hooks";
import { getSessionToken, handleDenial } from "../lib/session";

// Curator work started from the admin pages rather than a terminal (MINI-103).
// Each button sends one request to the API, which puts the job on the
// curator's queue; the worker runs it like any other wiki job. Every
// operation offered here is free — it rebuilds page documents from what the
// curator has already stored and calls no model. The paid passes are not
// offered here.
//
// Progress. The queue reports nothing back, but every page written gets a new
// updated_at in the admin index. Before queueing, the panel notes each page's
// updated_at; after, it re-reads the index and counts the pages whose time has
// moved on. That compares the API's times with the API's times, so the
// browser's clock does not matter.

/** ``page``: the operations for the page in ``?slug=``; otherwise the wiki's. */
type Props = { apiBase: string; scope: "wiki" | "page" };

type Operation = {
  action: "rebuild_every_page" | "rebuild_pages";
  label: string;
  what: string;
  confirm: string;
};

const EVERY_PAGE: Operation = {
  action: "rebuild_every_page",
  label: "Rebuild every page",
  what:
    "Rebuilds every page from the curator's stored links, folds and prose — for after the " +
    "page logic changes, or to fill in a new field. Runs on the queue in batches of 25 " +
    "pages and takes a few minutes; progress shows here. You can leave this page — the " +
    "rebuild carries on without it.",
  confirm: "Rebuild every page? This is free (no model calls) and takes a few minutes.",
};

function onePage(slug: string): Operation {
  return {
    action: "rebuild_pages",
    label: "Rebuild this page",
    what:
      "Rebuilds this page from the curator's stored links, folds and prose. Takes under a " +
      "minute; progress shows here, and you reload the page to see the result.",
    confirm: `Rebuild “${slug.replace(/-/g, " ")}”? This is free (no model calls).`,
  };
}

/** How often the panel re-reads the index while a rebuild runs. */
const POLL_MS = 10_000;
/** When it stops watching. The rebuild itself carries on regardless. */
const WATCH_LIMIT_MS = 30 * 60_000;

const BTN_CLASS =
  "rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-sm text-slate-200 transition-colors hover:border-accent hover:text-accent disabled:opacity-50 disabled:hover:border-white/15 disabled:hover:text-slate-200";

type Row = { slug: string; updated_at: string };

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "watching"; summary: string; done: number; total: number; since: string }
  | { kind: "finished"; total: number }
  | { kind: "stopped"; done: number; total: number }
  | { kind: "error"; message: string };

function clock(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function WikiOperations({ apiBase, scope }: Props) {
  const slug =
    scope === "page" && typeof location !== "undefined"
      ? (new URLSearchParams(location.search).get("slug") ?? "")
      : "";
  const op = slug ? onePage(slug) : EVERY_PAGE;
  const [state, setState] = useState<State>({ kind: "idle" });
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (scope === "page" && !slug) return null;

  const base = apiBase.replace(/\/$/, "");

  /** The admin index as slug → updated_at, or null when it could not be read. */
  const readIndex = async (token: string): Promise<Map<string, string> | null> => {
    try {
      const res = await fetch(`${base}/v1/wcs/wiki/admin/pages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const rows = ((await res.json())?.data ?? []) as Row[];
      return new Map(rows.map((r) => [r.slug, r.updated_at]));
    } catch {
      return null;
    }
  };

  /** Pages written since ``before`` (a changed or new time); for one page, only it. */
  const progress = (before: Map<string, string>, now: Map<string, string>) => {
    const watched = slug ? [...now.keys()].filter((s) => s === slug) : [...now.keys()];
    const done = watched.filter((s) => now.get(s) !== before.get(s)).length;
    return { done, total: slug ? 1 : watched.length };
  };

  const watch = (before: Map<string, string>, summary: string, since: string, startedMs: number) => {
    const tick = async () => {
      const token = (await getSessionToken()) || "";
      const now = token ? await readIndex(token) : null;
      if (now) {
        const { done, total } = progress(before, now);
        if (total > 0 && done >= total) {
          setState({ kind: "finished", total });
          return;
        }
        if (Date.now() - startedMs > WATCH_LIMIT_MS) {
          setState({ kind: "stopped", done, total });
          return;
        }
        setState({ kind: "watching", summary, done, total, since });
      }
      timer.current = window.setTimeout(tick, POLL_MS);
    };
    timer.current = window.setTimeout(tick, POLL_MS);
  };

  const run = async () => {
    if (!apiBase || !window.confirm(op.confirm)) return;
    setState({ kind: "sending" });
    try {
      const token = (await getSessionToken()) || "";
      if (!token) {
        setState({ kind: "error", message: "Sign in to start this." });
        return;
      }
      // Before queueing, so a page the worker writes straight away still counts.
      const before = (await readIndex(token)) ?? new Map<string, string>();
      const res = await fetch(`${base}/v1/wcs/wiki/admin/jobs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          op.action === "rebuild_pages" ? { action: op.action, slugs: [slug] } : { action: op.action },
        ),
      });
      if (res.status === 401 || res.status === 403) {
        handleDenial(res.status);
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const detail =
          json?.error?.message || json?.detail?.message || `HTTP ${res.status}`;
        setState({ kind: "error", message: `Not queued: ${detail}` });
        return;
      }
      const summary = json?.data?.summary || "Queued.";
      // A folded slug rebuilds the page it folded into, which this page's
      // index row does not name; there is nothing here to watch.
      if (slug && !before.has(slug)) {
        setState({ kind: "finished", total: 0 });
        return;
      }
      const since = clock(new Date());
      const total = slug ? 1 : before.size;
      setState({ kind: "watching", summary, done: 0, total, since });
      watch(before, summary, since, Date.now());
    } catch {
      setState({ kind: "error", message: "Not queued: the API could not be reached." });
    }
  };

  const busy = state.kind === "sending" || state.kind === "watching";
  const noun = (n: number) => `page${n === 1 ? "" : "s"}`;

  return (
    <section class="rounded-lg border border-white/8 bg-surface/40 px-4 py-3 space-y-2">
      <h2 class="text-xs font-mono uppercase tracking-widest text-slate-500">
        Operations
        <span class="ml-2 normal-case tracking-normal text-emerald-400/80">free · no model calls</span>
      </h2>
      <div class="flex flex-wrap items-center gap-3">
        <button type="button" class={BTN_CLASS} disabled={busy} onClick={run}>
          {state.kind === "sending"
            ? "Queuing…"
            : state.kind === "watching"
              ? "Rebuilding…"
              : op.label}
        </button>
        {state.kind === "watching" ? (
          <span class="text-sm text-slate-300">
            {state.summary}{" "}
            <span class="font-mono text-slate-100">
              {state.done} of {state.total}
            </span>{" "}
            {noun(state.total)} rebuilt since {state.since}.
          </span>
        ) : state.kind === "finished" && state.total === 0 ? (
          <span class="text-sm text-emerald-400">Queued; reload in a minute to see it.</span>
        ) : state.kind === "finished" ? (
          <span class="text-sm text-emerald-400">
            Done — {state.total} {noun(state.total)} rebuilt.
            {slug ? " Reload to see it." : ""}
          </span>
        ) : state.kind === "stopped" ? (
          <span class="text-sm text-amber-300">
            Stopped watching after 30 minutes with {state.done} of {state.total}{" "}
            {noun(state.total)} rebuilt. The rebuild may still be running; a batch that keeps
            failing is reported as a run report.
          </span>
        ) : state.kind === "error" ? (
          <span class="text-sm text-rose-400">{state.message}</span>
        ) : null}
      </div>
      <p class="text-xs text-slate-500 leading-relaxed">{op.what}</p>
    </section>
  );
}
