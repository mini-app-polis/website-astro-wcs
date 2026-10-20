/** @jsxImportSource preact */
import { useEffect, useMemo, useState } from "preact/hooks";
import { getSessionToken, handleDenial } from "../lib/session";
import {
  KIND_LABELS,
  Markdown,
  formatDate,
  lessonHref,
  pageHref,
  plainText,
  type WikiPage,
  type WikiPageSummary,
} from "../lib/wiki";

// The admin's review of the wiki, in three tabs:
//
// Folds — every consolidation decision, grouped by the page each entity ended
// up on. The private facets-review.md, read from the curator's stored state.
//
// Thin — entities with little evidence (at most one source, at most one page
// referring to them), with what was said about them and where they ended up.
// The curator decides which are thin and stores the list; this only shows it.
// Context for one goes in a note.
//
// Changes — which pages each source changed. Every page write the curator
// makes records a revision tagged with the source that started the work;
// opening one shows what changed on the page. Work an admin started (a
// rebuild) has no source and is grouped as such.
//
// Each tab loads when first opened. Nothing here writes.

type Props = { apiBase: string };

type Tab = "folds" | "thin" | "changes";

const TABS: { id: Tab; label: string }[] = [
  { id: "folds", label: "Folds" },
  { id: "thin", label: "Thin" },
  { id: "changes", label: "Changes" },
];

const BTN_CLASS =
  "rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-xs font-mono transition-colors hover:border-white/20 hover:text-slate-100";
const BTN_ON = " border-accent bg-accent/15 text-accent";
const LINK_CLASS = "text-slate-100 hover:text-accent transition-colors";
const SEARCH_CLASS =
  "w-full max-w-sm rounded-full border border-white/10 bg-white/[0.02] px-4 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 outline-none focus:border-accent/50 transition-colors";

/** Groups or rows drawn before "show all". */
const FIRST_ROWS = 60;

// ---------- Shapes the API serves ----------

type FacetDecision = {
  parent: string | null;
  same: boolean;
  reason: string;
  version: string;
  model: string;
  decided_at: string | null;
};

type FacetsState = { entities: Record<string, FacetDecision> };

type ThinQuote = {
  text: string;
  source_id: string | null;
  session_date: string | null;
  source_title: string;
};

type ThinEntity = {
  slug: string;
  name: string;
  kind: string;
  sources: number;
  references: number;
  page: string;
  same: boolean;
  definition: string;
  quotes: ThinQuote[];
};

type SourceGroup = {
  source_id: string | null;
  title: string | null;
  session_date: string | null;
  session_type: string | null;
  pages: number;
  created: number;
  changed: number;
  removed: number;
  last_at: string;
};

type Revision = {
  id: number;
  slug: string;
  name: string | null;
  kind: string | null;
  change: "created" | "changed" | "removed";
  origin_source_id: string | null;
  origin_job_id: string | null;
  at: string;
};

type RevisionDetail = Revision & { previous: WikiPage | null; document: WikiPage | null };

type Load<T> =
  { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; data: T };

// ---------- Fetching ----------

/** GET an admin route and return its ``data``; null when signed out. */
async function apiGet<T>(apiBase: string, path: string, signal: AbortSignal): Promise<T | null> {
  const token = (await getSessionToken()) || "";
  if (!token) return null;
  const res = await fetch(`${apiBase.replace(/\/$/, "")}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (res.status === 401 || res.status === 403) {
    handleDenial(res.status);
    await new Promise<never>(() => {});
  }
  if (!res.ok) throw new Error(`The API answered ${res.status}.`);
  const json = await res.json();
  if (json?.data === undefined) throw new Error("The API's answer had no data.");
  return json.data as T;
}

/** Load ``path``, again when it changes; nothing while it is null. */
function useApi<T>(apiBase: string, path: string | null): Load<T> {
  const [state, setState] = useState<Load<T>>({ kind: "loading" });
  useEffect(() => {
    if (!path) return;
    if (!apiBase) {
      setState({ kind: "error", message: "Could not reach the API." });
      return;
    }
    setState({ kind: "loading" });
    const controller = new AbortController();
    apiGet<T>(apiBase, path, controller.signal)
      .then((data) =>
        setState(
          data === null
            ? { kind: "error", message: "Sign in to view this." }
            : { kind: "ready", data },
        ),
      )
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setState({ kind: "error", message: err.message || "Could not load this." });
      });
    return () => controller.abort();
  }, [apiBase, path]);
  return state;
}

function Status({ state }: { state: Load<unknown> }) {
  if (state.kind === "loading") return <div class="text-sm text-slate-500">Loading…</div>;
  if (state.kind === "error") return <div class="text-sm text-slate-500">{state.message}</div>;
  return null;
}

function words(slug: string): string {
  return slug.replace(/-/g, " ");
}

function matches(query: string, ...hay: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const text = hay.filter(Boolean).join(" ").toLowerCase();
  return q.split(/\s+/).every((w) => text.includes(w));
}

function ShowAll({ shown, total, onClick }: { shown: number; total: number; onClick: () => void }) {
  if (shown >= total) return null;
  return (
    <button type="button" class={BTN_CLASS} onClick={onClick}>
      Show all {total}
    </button>
  );
}

// ---------- Folds ----------

type FoldGroup = {
  page: string;
  members: { slug: string; via: string | null; same: boolean; reason: string }[];
};

/** Where each folded slug ends up: its parent's parent, and so on. Cycles stand alone. */
function foldGroups(entities: Record<string, FacetDecision>): FoldGroup[] {
  const endOf = (slug: string): string | null => {
    const seen = new Set([slug]);
    let at = entities[slug]?.parent ?? null;
    if (!at) return null;
    while (entities[at]?.parent) {
      const next = entities[at].parent as string;
      if (seen.has(next)) return null;
      seen.add(at);
      at = next;
    }
    return at;
  };
  const groups = new Map<string, FoldGroup>();
  for (const [slug, d] of Object.entries(entities)) {
    const page = endOf(slug);
    if (!page) continue;
    const group = groups.get(page) ?? { page, members: [] };
    group.members.push({
      slug,
      via: d.parent && d.parent !== page ? d.parent : null,
      same: d.same,
      reason: d.reason,
    });
    groups.set(page, group);
  }
  for (const g of groups.values()) g.members.sort((a, b) => a.slug.localeCompare(b.slug));
  return [...groups.values()].sort(
    (a, b) => b.members.length - a.members.length || a.page.localeCompare(b.page),
  );
}

function Folds({ apiBase }: Props) {
  const facets = useApi<FacetsState>(apiBase, "/v1/wcs/wiki/state/facets");
  const index = useApi<WikiPageSummary[]>(apiBase, "/v1/wcs/wiki/admin/pages");
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);

  const names = useMemo(
    () => new Map(index.kind === "ready" ? index.data.map((p) => [p.slug, p.name] as const) : []),
    [index],
  );
  const groups = useMemo(
    () => (facets.kind === "ready" ? foldGroups(facets.data.entities ?? {}) : []),
    [facets],
  );
  const shown = useMemo(
    () =>
      groups.filter((g) =>
        matches(query, g.page, names.get(g.page), ...g.members.flatMap((m) => [m.slug, m.reason])),
      ),
    [groups, names, query],
  );

  if (facets.kind !== "ready") return <Status state={facets} />;
  const visible = all ? shown : shown.slice(0, FIRST_ROWS);
  const folded = groups.reduce((n, g) => n + g.members.length, 0);

  return (
    <div class="space-y-4">
      <p class="text-xs text-slate-500">
        {folded} entities fold into {groups.length} pages. “Another name” folds as an alias, with no
        Details line; the rest are facets. Disagree with one? Say so in a note — newest wins.
      </p>
      <input
        type="search"
        class={SEARCH_CLASS}
        placeholder="Page, entity or reason…"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      <ul class="space-y-3">
        {visible.map((g) => (
          <li class="rounded-lg border border-white/8 bg-surface/40 px-4 py-3">
            <a class={`${LINK_CLASS} text-sm font-medium`} href={pageHref("admin", g.page)}>
              {names.get(g.page) ?? words(g.page)}
            </a>
            <span class="ml-2 font-mono text-xs text-slate-500">{g.members.length}</span>
            <ul class="mt-2 space-y-1.5">
              {g.members.map((m) => (
                <li class="text-sm text-slate-300 leading-snug">
                  <span class="text-slate-100">{words(m.slug)}</span>
                  {m.via ? <span class="text-slate-500"> (via {words(m.via)})</span> : null}
                  {m.same ? (
                    <span class="ml-2 rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 font-mono text-[11px] text-sky-300">
                      another name
                    </span>
                  ) : null}
                  {m.reason ? <span class="text-slate-500"> — {m.reason}</span> : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {shown.length === 0 ? <p class="text-sm text-slate-500">Nothing matches.</p> : null}
      <ShowAll shown={visible.length} total={shown.length} onClick={() => setAll(true)} />
    </div>
  );
}

// ---------- Thin ----------

function ThinRow({ e }: { e: ThinEntity }) {
  const folded = e.page !== e.slug;
  return (
    <li class="rounded-lg border border-white/8 bg-surface/40 px-4 py-3">
      <details>
        <summary class="cursor-pointer list-none">
          <span class="text-sm font-medium text-slate-100">{e.name}</span>
          <span class="ml-2 font-mono text-xs text-slate-500">
            {KIND_LABELS[e.kind] ?? e.kind} · {e.sources} source{e.sources === 1 ? "" : "s"} ·{" "}
            {e.references} ref{e.references === 1 ? "" : "s"}
          </span>
          {folded ? (
            <span class="block text-xs text-slate-500 mt-0.5">
              {e.same ? "another name for " : "folded into "}
              <a class={LINK_CLASS} href={pageHref("admin", e.page)}>
                {words(e.page)}
              </a>
            </span>
          ) : null}
        </summary>
        <div class="mt-3 space-y-3">
          {e.definition ? (
            <Markdown text={e.definition} mode="admin" class="text-sm text-slate-300" />
          ) : (
            <p class="text-sm text-slate-500">No definition.</p>
          )}
          {e.quotes.length ? (
            <ul class="space-y-2 border-l border-white/10 pl-3">
              {e.quotes.map((q) => (
                <li class="text-sm text-slate-300">
                  {plainText(q.text)}
                  <span class="block font-mono text-xs text-slate-500">
                    {q.source_id ? (
                      <a class={LINK_CLASS} href={lessonHref("admin", q.source_id)}>
                        {[formatDate(q.session_date), q.source_title].filter(Boolean).join(" · ") ||
                          "lesson"}
                      </a>
                    ) : (
                      [formatDate(q.session_date), q.source_title].filter(Boolean).join(" · ")
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>
    </li>
  );
}

function Thin({ apiBase }: Props) {
  const thin = useApi<{ entities: ThinEntity[] }>(apiBase, "/v1/wcs/wiki/state/thin");
  const [query, setQuery] = useState("");
  const [where, setWhere] = useState<"own" | "folded">("own");
  const [all, setAll] = useState(false);

  const entities = thin.kind === "ready" ? (thin.data.entities ?? []) : [];
  const own = entities.filter((e) => e.page === e.slug);
  const folded = entities.filter((e) => e.page !== e.slug);
  const shown = (where === "own" ? own : folded).filter((e) =>
    matches(query, e.name, e.slug, e.page, e.definition, ...e.quotes.map((q) => q.text)),
  );

  if (thin.kind !== "ready") return <Status state={thin} />;
  if (entities.length === 0) {
    return (
      <p class="text-sm text-slate-500">
        No thin entities stored yet. The next curator deploy fills the list, for free; new
        lessons keep it current after that.
      </p>
    );
  }
  const visible = all ? shown : shown.slice(0, FIRST_ROWS);

  return (
    <div class="space-y-4">
      <p class="text-xs text-slate-500">
        At most one source and at most one page referring to it. Give one context in a note and it
        reaches its page; one on its own page has no broader home yet.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class={BTN_CLASS + (where === "own" ? BTN_ON : "")}
          onClick={() => setWhere("own")}
        >
          On their own page · {own.length}
        </button>
        <button
          type="button"
          class={BTN_CLASS + (where === "folded" ? BTN_ON : "")}
          onClick={() => setWhere("folded")}
        >
          Folded into a broader page · {folded.length}
        </button>
      </div>
      <input
        type="search"
        class={SEARCH_CLASS}
        placeholder="Name, page or quote…"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      <ul class="space-y-2">
        {visible.map((e) => (
          <ThinRow e={e} />
        ))}
      </ul>
      {shown.length === 0 ? <p class="text-sm text-slate-500">Nothing matches.</p> : null}
      <ShowAll shown={visible.length} total={shown.length} onClick={() => setAll(true)} />
    </div>
  );
}

// ---------- Changes ----------

const CHANGE_STYLE: Record<Revision["change"], string> = {
  created: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  changed: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  removed: "border-rose-500/25 bg-rose-500/10 text-rose-300",
};

function ChangeBadge({ change }: { change: Revision["change"] }) {
  return (
    <span
      class={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] ${CHANGE_STYLE[change]}`}
    >
      {change}
    </span>
  );
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function groupLabel(g: SourceGroup): string {
  if (!g.source_id) return "No source — rebuilds and operator runs";
  return [formatDate(g.session_date), g.title || "Untitled source"].filter(Boolean).join(" · ");
}

/** One page field as the lines a reader compares. */
const LIST_FIELDS: { key: keyof WikiPage; label: string; lines: (p: WikiPage) => string[] }[] = [
  { key: "aliases", label: "Also called", lines: (p) => p.aliases ?? [] },
  { key: "details", label: "Details", lines: (p) => (p.details ?? []).map((d) => d.name) },
  {
    key: "by_teacher",
    label: "By teacher",
    lines: (p) =>
      (p.by_teacher ?? []).flatMap((t) =>
        t.statements.map((s) => `${t.name}: ${plainText(s.text)}`),
      ),
  },
  {
    key: "mistakes",
    label: "Common mistakes",
    lines: (p) => (p.mistakes ?? []).map((m) => plainText(m.text)),
  },
  {
    key: "develops",
    label: "Develops",
    lines: (p) => (p.develops ?? []).map((s) => `${s.skill}: ${plainText(s.text)}`),
  },
  {
    key: "requires",
    label: "Requires",
    lines: (p) => (p.requires ?? []).map((s) => `${s.skill}: ${plainText(s.text)}`),
  },
  {
    key: "related",
    label: "Related",
    lines: (p) => (p.related ?? []).map((r) => `${r.relation.replace(/_/g, " ")} ${r.name}`),
  },
  { key: "mentions", label: "Mentions", lines: (p) => (p.mentions ?? []).map((l) => l.name) },
  {
    key: "referenced_by",
    label: "Referenced by",
    lines: (p) => (p.referenced_by ?? []).map((l) => l.name),
  },
  { key: "sources", label: "Sources", lines: (p) => (p.sources ?? []).map((c) => c.source_slug) },
  { key: "folded", label: "Folded in", lines: (p) => p.folded ?? [] },
];

const TEXT_FIELDS: { key: "definition" | "in_practice"; label: string }[] = [
  { key: "definition", label: "Definition" },
  { key: "in_practice", label: "In practice" },
];

function PageDiff({ before, after }: { before: WikiPage | null; after: WikiPage | null }) {
  const blocks = [];
  for (const f of TEXT_FIELDS) {
    const a = before?.[f.key] ?? "";
    const b = after?.[f.key] ?? "";
    if (a === b) continue;
    blocks.push(
      <div>
        <h4 class="mb-1 text-xs font-mono uppercase tracking-widest text-slate-500">{f.label}</h4>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded border border-rose-500/20 bg-rose-500/5 p-2">
            {a ? (
              <Markdown text={a} mode="admin" class="text-sm text-slate-300" />
            ) : (
              <p class="text-sm text-slate-600">—</p>
            )}
          </div>
          <div class="rounded border border-emerald-500/20 bg-emerald-500/5 p-2">
            {b ? (
              <Markdown text={b} mode="admin" class="text-sm text-slate-200" />
            ) : (
              <p class="text-sm text-slate-600">—</p>
            )}
          </div>
        </div>
      </div>,
    );
  }
  for (const f of LIST_FIELDS) {
    const a = before ? f.lines(before) : [];
    const b = after ? f.lines(after) : [];
    const had = new Set(a);
    const has = new Set(b);
    const added = b.filter((l) => !had.has(l));
    const removed = a.filter((l) => !has.has(l));
    if (!added.length && !removed.length) continue;
    blocks.push(
      <div>
        <h4 class="mb-1 text-xs font-mono uppercase tracking-widest text-slate-500">{f.label}</h4>
        <ul class="space-y-0.5 text-sm">
          {removed.map((l) => (
            <li class="text-rose-300/90">− {l}</li>
          ))}
          {added.map((l) => (
            <li class="text-emerald-300/90">+ {l}</li>
          ))}
        </ul>
      </div>,
    );
  }
  for (const key of ["name", "kind", "status"] as const) {
    const a = before?.[key] ?? "";
    const b = after?.[key] ?? "";
    if (before && after && a !== b) {
      blocks.push(
        <p class="text-sm text-slate-300">
          <span class="font-mono text-xs uppercase tracking-widest text-slate-500">{key}</span>{" "}
          <span class="text-rose-300/90">{a || "—"}</span> →{" "}
          <span class="text-emerald-300/90">{b || "—"}</span>
        </p>,
      );
    }
  }
  if (!blocks.length) {
    return <p class="text-sm text-slate-500">No difference in the fields shown here.</p>;
  }
  return <div class="space-y-4">{blocks}</div>;
}

function RevisionRow({ apiBase, r }: Props & { r: Revision }) {
  const [open, setOpen] = useState(false);
  const detail = useApi<RevisionDetail>(
    apiBase,
    open ? `/v1/wcs/wiki/admin/revisions/${r.id}` : null,
  );
  return (
    <li class="py-2">
      <button
        type="button"
        class="flex w-full flex-wrap items-center gap-2 text-left"
        onClick={() => setOpen(!open)}
      >
        <ChangeBadge change={r.change} />
        <span class="text-sm text-slate-100">{r.name ?? words(r.slug)}</span>
        {r.kind ? (
          <span class="font-mono text-xs text-slate-500">{KIND_LABELS[r.kind] ?? r.kind}</span>
        ) : null}
        <span class="ml-auto font-mono text-xs text-slate-500">{when(r.at)}</span>
      </button>
      {open ? (
        <div class="mt-3 ml-1 border-l border-white/10 pl-3">
          {detail.kind === "ready" ? (
            <>
              <PageDiff before={detail.data.previous} after={detail.data.document} />
              {r.change !== "removed" ? (
                <a
                  class={`${LINK_CLASS} mt-3 inline-block text-xs font-mono`}
                  href={pageHref("admin", r.slug)}
                >
                  Open the page →
                </a>
              ) : null}
            </>
          ) : (
            <Status state={detail} />
          )}
        </div>
      ) : null}
    </li>
  );
}

function SourceChanges({ apiBase, group }: Props & { group: SourceGroup }) {
  const key = group.source_id ?? "none";
  const revisions = useApi<Revision[]>(
    apiBase,
    `/v1/wcs/wiki/admin/revisions?source_id=${encodeURIComponent(key)}&limit=500`,
  );
  if (revisions.kind !== "ready") return <Status state={revisions} />;
  return (
    <ul class="divide-y divide-white/5">
      {revisions.data.map((r) => (
        <RevisionRow apiBase={apiBase} r={r} />
      ))}
    </ul>
  );
}

function Changes({ apiBase }: Props) {
  const groups = useApi<SourceGroup[]>(apiBase, "/v1/wcs/wiki/admin/revisions/sources?limit=200");
  const [open, setOpen] = useState<string | null>(null);

  if (groups.kind !== "ready") return <Status state={groups} />;
  if (groups.data.length === 0) {
    return (
      <p class="text-sm text-slate-500">
        No page changes recorded yet. They are recorded from the first page write after this
        shipped.
      </p>
    );
  }
  return (
    <div class="space-y-3">
      <p class="text-xs text-slate-500">
        The pages each source changed, newest first. When several sources reach the same page, the
        latest one is credited.
      </p>
      <ul class="space-y-2">
        {groups.data.map((g) => {
          const key = g.source_id ?? "none";
          const isOpen = open === key;
          return (
            <li class="rounded-lg border border-white/8 bg-surface/40 px-4 py-3">
              <button
                type="button"
                class="flex w-full flex-wrap items-center gap-2 text-left"
                onClick={() => setOpen(isOpen ? null : key)}
              >
                <span class="text-sm font-medium text-slate-100">{groupLabel(g)}</span>
                <span class="font-mono text-xs text-slate-500">
                  {g.pages} page{g.pages === 1 ? "" : "s"}
                  {g.created ? ` · ${g.created} new` : ""}
                  {g.changed ? ` · ${g.changed} changed` : ""}
                  {g.removed ? ` · ${g.removed} removed` : ""}
                </span>
                <span class="ml-auto font-mono text-xs text-slate-500">{when(g.last_at)}</span>
              </button>
              {g.source_id ? (
                <a
                  class={`${LINK_CLASS} text-xs font-mono`}
                  href={lessonHref("admin", g.source_id)}
                >
                  Open the source →
                </a>
              ) : null}
              {isOpen ? (
                <div class="mt-2">
                  <SourceChanges apiBase={apiBase} group={g} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- The panel ----------

export default function WikiReview({ apiBase }: Props) {
  const [tab, setTab] = useState<Tab | null>(null);
  // Tabs stay mounted once opened, so switching back does not reload them.
  const [opened, setOpened] = useState<Set<Tab>>(new Set());
  const choose = (t: Tab) => {
    setTab(tab === t ? null : t);
    setOpened(new Set([...opened, t]));
  };

  return (
    <section class="rounded-lg border border-white/8 bg-surface/40 px-4 py-3 space-y-3">
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="text-xs font-mono uppercase tracking-widest text-slate-500">Review</h2>
        <div class="flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <button
              type="button"
              class={BTN_CLASS + (tab === t.id ? BTN_ON : "")}
              aria-pressed={tab === t.id}
              onClick={() => choose(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {opened.has("folds") ? (
        <div hidden={tab !== "folds"}>
          <Folds apiBase={apiBase} />
        </div>
      ) : null}
      {opened.has("thin") ? (
        <div hidden={tab !== "thin"}>
          <Thin apiBase={apiBase} />
        </div>
      ) : null}
      {opened.has("changes") ? (
        <div hidden={tab !== "changes"}>
          <Changes apiBase={apiBase} />
        </div>
      ) : null}
    </section>
  );
}
