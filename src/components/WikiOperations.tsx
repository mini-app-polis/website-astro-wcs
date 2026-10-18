/** @jsxImportSource preact */
import { useState } from "preact/hooks";
import { getSessionToken, handleDenial } from "../lib/session";

// Curator work started from the admin pages rather than a terminal (MINI-103).
// Each button sends one request to the API, which puts the job on the
// curator's queue; the worker runs it like any other wiki job. Every
// operation offered here is free — it rebuilds page documents from what the
// curator has already stored and calls no model. The paid passes are not
// offered here.

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
    "pages and takes a few minutes. Watch it finish with Sort: Recently changed.",
  confirm: "Rebuild every page? This is free (no model calls) and takes a few minutes.",
};

function onePage(slug: string): Operation {
  return {
    action: "rebuild_pages",
    label: "Rebuild this page",
    what:
      "Rebuilds this page from the curator's stored links, folds and prose. Takes under a " +
      "minute; reload the page to see it.",
    confirm: `Rebuild “${slug.replace(/-/g, " ")}”? This is free (no model calls).`,
  };
}

const BTN_CLASS =
  "rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-sm text-slate-200 transition-colors hover:border-accent hover:text-accent disabled:opacity-50 disabled:hover:border-white/15 disabled:hover:text-slate-200";

export default function WikiOperations({ apiBase, scope }: Props) {
  const slug =
    scope === "page" && typeof location !== "undefined"
      ? (new URLSearchParams(location.search).get("slug") ?? "")
      : "";
  if (scope === "page" && !slug) return null;
  const op = slug ? onePage(slug) : EVERY_PAGE;
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "done"; summary: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const run = async () => {
    if (!apiBase || !window.confirm(op.confirm)) return;
    setState({ kind: "sending" });
    try {
      const token = (await getSessionToken()) || "";
      if (!token) {
        setState({ kind: "error", message: "Sign in to start this." });
        return;
      }
      const res = await fetch(`${apiBase.replace(/\/$/, "")}/v1/wcs/wiki/admin/jobs`, {
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
      setState({ kind: "done", summary: json?.data?.summary || "Queued." });
    } catch {
      setState({ kind: "error", message: "Not queued: the API could not be reached." });
    }
  };

  return (
    <section class="rounded-lg border border-white/8 bg-surface/40 px-4 py-3 space-y-2">
      <h2 class="text-xs font-mono uppercase tracking-widest text-slate-500">
        Operations
        <span class="ml-2 normal-case tracking-normal text-emerald-400/80">free · no model calls</span>
      </h2>
      <div class="flex flex-wrap items-center gap-3">
        <button type="button" class={BTN_CLASS} disabled={state.kind === "sending"} onClick={run}>
          {state.kind === "sending" ? "Queuing…" : op.label}
        </button>
        {state.kind === "done" ? (
          <span class="text-sm text-emerald-400">{state.summary}</span>
        ) : state.kind === "error" ? (
          <span class="text-sm text-rose-400">{state.message}</span>
        ) : null}
      </div>
      <p class="text-xs text-slate-500 leading-relaxed">{op.what}</p>
    </section>
  );
}
