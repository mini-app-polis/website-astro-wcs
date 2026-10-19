/** @jsxImportSource preact */
import { useEffect, useRef, useState } from "preact/hooks";
import { getSessionToken, handleDenial } from "../lib/session";

// Curator work started from an admin wiki page rather than a terminal
// (MINI-103): "Rebuild this page" sends one request to the API, which puts the
// job on the curator's queue; the worker runs it like any other wiki job. It
// is free — it rebuilds the page document from what the curator has already
// stored and calls no model. The paid passes are not offered here.
//
// There is no "Rebuild every page" any more (MINI-109). Pages rebuild
// themselves: every curator job rebuilds the pages it changed, a local run
// does the same, and each curator deploy asks the API for one rebuild of every
// page. The API operation stays, for that deploy job and as an escape hatch.
//
// Progress. The queue reports nothing back, but every page written gets a new
// updated_at in the admin index. Before queueing, the panel notes each page's
// updated_at; after, it re-reads the index and counts the pages whose time has
// moved on. That compares the API's times with the API's times, so the
// browser's clock does not matter.
//
// A second click within five minutes queues nothing: SQS drops an identical
// message inside its dedup window. The API says so (``deduplicated``, with the
// first send's ``queued_at``), and the panel then watches that job instead —
// a page written since it was queued already counts. Before this it waited
// for a rebuild that had already happened (2026-10-18).

/** The operations for the page in ``?slug=``; nothing without one. */
type Props = { apiBase: string };

function onePage(slug: string) {
  return {
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
/** No new page for this long while some are still to go: say the job may have failed. */
const STALL_MS = 5 * 60_000;

const BTN_CLASS =
  "rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-sm text-slate-200 transition-colors hover:border-accent hover:text-accent disabled:opacity-50 disabled:hover:border-white/15 disabled:hover:text-slate-200";

type Row = { slug: string; updated_at: string };

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | {
      kind: "watching";
      summary: string;
      done: number;
      total: number;
      since: string;
      /** When the index was last read, and what went wrong if it could not be. */
      checked: string | null;
      problem: string | null;
      stalled: boolean;
    }
  | { kind: "finished"; total: number }
  | { kind: "stopped"; done: number; total: number }
  | { kind: "error"; message: string };

function clock(d: Date, seconds = false): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
  });
}

export default function WikiOperations({ apiBase }: Props) {
  const slug =
    typeof location !== "undefined"
      ? (new URLSearchParams(location.search).get("slug") ?? "")
      : "";
  const op = onePage(slug);
  const [state, setState] = useState<State>({ kind: "idle" });
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!slug) return null;

  const base = apiBase.replace(/\/$/, "");

  /** The admin index as slug → updated_at, or why it could not be read. */
  const readIndex = async (
    token: string,
  ): Promise<{ pages: Map<string, string> } | { problem: string }> => {
    try {
      const res = await fetch(`${base}/v1/wcs/wiki/admin/pages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { problem: `the API answered HTTP ${res.status}` };
      const rows = ((await res.json())?.data ?? []) as Row[];
      return { pages: new Map(rows.map((r) => [r.slug, r.updated_at])) };
    } catch {
      return { problem: "the API could not be reached" };
    }
  };

  /** Whether this page was written since ``before`` (a changed or new time). */
  const progress = (before: Map<string, string>, now: Map<string, string>) => {
    const done = now.has(slug) && now.get(slug) !== before.get(slug) ? 1 : 0;
    return { done, total: 1 };
  };

  const watch = (
    before: Map<string, string>,
    summary: string,
    since: string,
    startedMs: number,
    total0: number,
  ) => {
    // The last good count, and when it last went up, carried between ticks.
    let last = { done: 0, total: total0 };
    let movedMs = startedMs;
    const tick = async () => {
      const token = (await getSessionToken()) || "";
      const read = token ? await readIndex(token) : { problem: "you are signed out" };
      const checked = clock(new Date(), true);
      if ("pages" in read) {
        const now = progress(before, read.pages);
        if (now.done > last.done) movedMs = Date.now();
        last = now;
        if (now.total > 0 && now.done >= now.total) {
          setState({ kind: "finished", total: now.total });
          return;
        }
      }
      if (Date.now() - startedMs > WATCH_LIMIT_MS) {
        setState({ kind: "stopped", ...last });
        return;
      }
      setState({
        kind: "watching",
        summary,
        since,
        ...last,
        checked,
        problem: "problem" in read ? read.problem : null,
        stalled: Date.now() - movedMs > STALL_MS,
      });
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
      const first = await readIndex(token);
      if ("problem" in first) {
        setState({ kind: "error", message: `Not queued: ${first.problem}.` });
        return;
      }
      // A copy: a joined job marks pages done in it, against the index as read.
      const before = new Map(first.pages);
      const res = await fetch(`${base}/v1/wcs/wiki/admin/jobs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rebuild_pages", slugs: [slug] }),
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
      const data = json?.data ?? {};
      // The job this click belongs to: its own, or the one it joined.
      const joinedAt: Date | null =
        data.deduplicated && data.queued_at ? new Date(data.queued_at) : null;
      const summary = joinedAt
        ? `Already queued at ${clock(joinedAt)}; this click joins that job.`
        : data.summary || "Queued.";
      if (joinedAt) {
        // Pages that job has written already count as done.
        for (const [s, at] of before) {
          if (Date.parse(at) >= joinedAt.getTime()) before.set(s, "");
        }
      }
      // A folded slug rebuilds the page it folded into, which this page's
      // index row does not name; there is nothing here to watch.
      if (!before.has(slug)) {
        setState({ kind: "finished", total: 0 });
        return;
      }
      const since = clock(joinedAt ?? new Date());
      const total = 1;
      const done0 = progress(before, first.pages).done;
      if (total > 0 && done0 >= total) {
        setState({ kind: "finished", total });
        return;
      }
      setState({
        kind: "watching",
        summary,
        done: done0,
        total,
        since,
        checked: null,
        problem: null,
        stalled: false,
      });
      watch(before, summary, since, joinedAt ? joinedAt.getTime() : Date.now(), total);
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
            {state.done === 0 ? (
              <>Waiting for the queue — nothing rebuilt yet.</>
            ) : (
              <>
                <span class="font-mono text-slate-100">
                  {state.done} of {state.total}
                </span>{" "}
                {noun(state.total)} rebuilt since {state.since}.
              </>
            )}
            {state.checked ? (
              <span class="ml-2 font-mono text-xs text-slate-500">checked {state.checked}</span>
            ) : null}
            {state.problem ? (
              <span class="block text-amber-300">
                Couldn’t read progress: {state.problem}. Trying again.
              </span>
            ) : null}
            {state.stalled ? (
              <span class="block text-amber-300">
                No page rebuilt in the last 5 minutes. The job may have failed: a failed job is
                retried later on its own, and one that keeps failing goes to the dead-letter
                queue with a run report.
              </span>
            ) : null}
          </span>
        ) : state.kind === "finished" && state.total === 0 ? (
          <span class="text-sm text-emerald-400">Queued; reload in a minute to see it.</span>
        ) : state.kind === "finished" ? (
          <span class="text-sm text-emerald-400">
            Done — {state.total} {noun(state.total)} rebuilt. Reload to see it.
          </span>
        ) : state.kind === "stopped" ? (
          <span class="text-sm text-amber-300">
            Stopped watching after 30 minutes with {state.done} of {state.total}{" "}
            {noun(state.total)} rebuilt. The rebuild may still be running; a job that keeps
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
