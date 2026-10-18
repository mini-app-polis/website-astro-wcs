/** @jsxImportSource preact */
import { useEffect, useState } from "preact/hooks";
import { getSessionToken, handleDenial } from "../lib/session";
import {
  KIND_LABELS,
  Markdown,
  formatDate,
  inline,
  lessonHref,
  pageHref,
  pagesPath,
  type WikiCitation,
  type WikiLink,
  type WikiMode,
  type WikiPage as Page,
  type WikiSkill,
} from "../lib/wiki";

// One wiki page, read at request time from its stored document (MINI-97).
// The page is static; the slug rides in ?slug= and the token comes live from
// Clerk, as on /notes/detail. The API filters the document to the sources the
// caller can see, so nothing here decides what is private.

type Props = { apiBase: string; mode: WikiMode };

/** Past this many, Referenced by shows the count until asked for the list. */
const REFERENCED_BY_LIMIT = 25;

const SECTION_HEADER_CLASS =
  "mb-3 text-xs font-mono uppercase tracking-widest text-slate-500";
const CARD_CLASS = "rounded-lg border border-white/8 bg-surface/40 px-4 py-3";
const LINK_CLASS =
  "text-slate-100 hover:text-accent transition-colors underline-offset-2 hover:underline";

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <h2 class={SECTION_HEADER_CLASS}>
      {label}
      {typeof count === "number" && count > 0 ? (
        <span class="ml-2 text-slate-600 normal-case tracking-normal">{count}</span>
      ) : null}
    </h2>
  );
}

function Badge({ label, tone = "slate" }: { label: string; tone?: "slate" | "amber" }) {
  const cls =
    tone === "amber"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
      : "border-white/10 text-slate-500";
  return (
    <span
      class={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

function Citation({ citation, mode }: { citation: WikiCitation; mode: WikiMode }) {
  return (
    <span class="inline-flex items-center gap-2 text-xs font-mono text-slate-500">
      <a href={lessonHref(mode, citation.source_id)} class={LINK_CLASS}>
        {formatDate(citation.session_date) || "lesson"}
      </a>
      {mode === "admin" && !citation.public ? <Badge label="private" tone="amber" /> : null}
    </span>
  );
}

function LinkList({ links, mode }: { links: WikiLink[]; mode: WikiMode }) {
  return (
    <ul class="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {links.map((l) => (
        <li>
          <a href={pageHref(mode, l.slug)} class={LINK_CLASS}>
            {l.name}
          </a>
          {l.count > 1 ? <span class="ml-1 text-xs text-slate-600">{l.count}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function Skills({ label, items, mode }: { label: string; items: WikiSkill[]; mode: WikiMode }) {
  if (!items.length) return null;
  return (
    <section>
      <SectionHeader label={label} count={items.length} />
      <ul class="space-y-3">
        {items.map((s) => (
          <li class={CARD_CLASS}>
            <p class="text-sm text-slate-100">{s.skill}</p>
            {s.text ? <p class="mt-1 text-sm text-slate-300">{s.text}</p> : null}
            {s.focus ? (
              <p class="mt-1 text-sm text-slate-400">
                <span class="text-slate-500">Focus: </span>
                {s.focus}
              </p>
            ) : null}
            {s.citation ? (
              <div class="mt-2">
                <Citation citation={s.citation} mode={mode} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReferencedBy({ links, mode }: { links: WikiLink[]; mode: WikiMode }) {
  const [open, setOpen] = useState(false);
  if (!links.length) return null;
  const many = links.length > REFERENCED_BY_LIMIT;
  return (
    <section>
      <SectionHeader label="Referenced by" count={links.length} />
      {many && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          class="text-sm text-slate-400 hover:text-accent transition-colors"
        >
          Referenced by {links.length} pages — show them
        </button>
      ) : (
        <LinkList links={links} mode={mode} />
      )}
    </section>
  );
}

function Body({ page, mode }: { page: Page; mode: WikiMode }) {
  const statements = page.by_teacher.reduce((n, t) => n + t.statements.length, 0);
  return (
    <div class="space-y-10">
      <div class="flex flex-wrap items-center gap-2">
        <Badge label={KIND_LABELS[page.kind] || page.kind} />
        {page.aliases.length ? (
          <span class="text-xs text-slate-500">also called {page.aliases.join(", ")}</span>
        ) : null}
      </div>

      {page.definition ? (
        <Markdown text={page.definition} mode={mode} class="text-lg text-slate-200 leading-relaxed" />
      ) : (
        <p class="text-sm text-slate-500">No definition yet.</p>
      )}

      {page.in_practice ? (
        <section>
          <SectionHeader label="In practice" />
          <Markdown text={page.in_practice} mode={mode} class="text-slate-300 leading-relaxed" />
        </section>
      ) : null}

      {page.details.length ? (
        <section>
          <SectionHeader label="Details" count={page.details.length} />
          <ul class="space-y-2 text-sm">
            {page.details.map((d) => (
              <li style={{ marginLeft: `${d.depth * 1.25}rem` }} class="text-slate-300">
                <span class="text-slate-100">{d.name}</span>
                {d.gist ? <span class="text-slate-400"> — {inline(d.gist, mode)}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {page.by_teacher.length ? (
        <section>
          <SectionHeader label="By teacher" count={statements} />
          <div class="space-y-6">
            {page.by_teacher.map((t) => (
              <div>
                <h3 class="mb-2 text-sm font-medium text-slate-200">{t.name}</h3>
                <ul class="space-y-3">
                  {t.statements.map((s) => (
                    <li class={CARD_CLASS}>
                      {s.kind === "definition" && s.term ? (
                        <p class="text-sm font-medium text-slate-100">{s.term}</p>
                      ) : null}
                      {s.text ? <p class="text-sm text-slate-300 leading-relaxed">{s.text}</p> : null}
                      {s.goal ? (
                        <p class="mt-1 text-sm text-slate-400">
                          <span class="text-slate-500">Goal: </span>
                          {s.goal}
                        </p>
                      ) : null}
                      {s.steps.length ? (
                        <ol class="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-300">
                          {s.steps.map((step) => (
                            <li>{step}</li>
                          ))}
                        </ol>
                      ) : null}
                      <div class="mt-2">
                        <Citation citation={s.citation} mode={mode} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {page.mistakes.length ? (
        <section>
          <SectionHeader label="Common mistakes" count={page.mistakes.length} />
          <ul class="space-y-3">
            {page.mistakes.map((m) => (
              <li class={CARD_CLASS}>
                <p class="text-sm text-slate-300">{m.text}</p>
                <div class="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  {m.teacher ? <span>{m.teacher}</span> : null}
                  <Citation citation={m.citation} mode={mode} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Skills label="Develops" items={page.develops} mode={mode} />
      <Skills label="Requires" items={page.requires} mode={mode} />

      {page.related.length ? (
        <section>
          <SectionHeader label="Related" count={page.related.length} />
          <ul class="space-y-2 text-sm">
            {page.related.map((r) => (
              <li class="text-slate-300">
                <a href={pageHref(mode, r.slug)} class={LINK_CLASS}>
                  {r.name}
                </a>
                <span class="text-slate-500"> ({r.relation.replace(/[-_]/g, " ")})</span>
                {r.text ? <span>: {r.text}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {page.mentions.length ? (
        <section>
          <SectionHeader label="Mentions" count={page.mentions.length} />
          <LinkList links={page.mentions} mode={mode} />
        </section>
      ) : null}

      <ReferencedBy links={page.referenced_by} mode={mode} />

      {mode === "admin" ? (
        <section class="space-y-2 border-t border-white/8 pt-6">
          <p class="font-mono text-[10px] text-slate-600">
            {page.slug} · {page.sources.length} cited sources (
            {page.sources.filter((c) => !c.public).length} private) ·{" "}
            {page.evidence_sources.length} evidence sources
          </p>
        </section>
      ) : null}
    </div>
  );
}

// Most lesson topics are folded into a broader page (MINI-93), so a lesson's
// link to one often has no page of its own. Searching for its words finds the
// page it is part of.
function NotFound({ slug, mode }: { slug: string; mode: WikiMode }) {
  const words = slug.replace(/-/g, " ");
  const index = mode === "admin" ? "/admin/wiki" : "/wiki";
  return (
    <div class="space-y-2 text-sm text-slate-400">
      <p>“{words}” has no page of its own. It may be part of a broader page.</p>
      <p>
        <a href={`${index}?q=${encodeURIComponent(words)}`} class={LINK_CLASS}>
          Search the wiki for “{words}”
        </a>
      </p>
    </div>
  );
}

function AsPublicToggle({ asPublic }: { asPublic: boolean }) {
  const toggle = () => {
    const params = new URLSearchParams(location.search);
    if (asPublic) params.delete("as");
    else params.set("as", "public");
    location.search = params.toString();
  };
  return (
    <div class="flex items-center gap-3 text-xs font-mono">
      <span class="text-slate-500">Showing</span>
      <button
        type="button"
        onClick={toggle}
        class="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-slate-300 transition-colors hover:border-white/20"
      >
        {asPublic ? "as the public sees it — show everything" : "everything — show as the public sees it"}
      </button>
    </div>
  );
}

export default function WikiPage({ apiBase, mode }: Props) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; page: Page }
  >({ kind: "loading" });
  const params =
    typeof location !== "undefined" ? new URLSearchParams(location.search) : null;
  const slug = params?.get("slug") ?? "";
  const asPublic = mode === "admin" && params?.get("as") === "public";

  useEffect(() => {
    if (!slug) {
      setState({ kind: "error", message: "No page selected." });
      return;
    }
    if (!apiBase) {
      setState({ kind: "error", message: "Page not found." });
      return;
    }
    const controller = new AbortController();
    (async () => {
      const token = (await getSessionToken()) || "";
      // Signed out: do not call; the surrounding <Show> renders the prompt.
      if (!token) return null;
      return fetch(`${apiBase.replace(/\/$/, "")}${pagesPath(mode, slug, asPublic)}`, {
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
        if (res.status === 404) throw new Error("not-found");
        if (!res.ok) throw new Error("Could not load the page.");
        const json = await res.json();
        const page = json?.data as Page | undefined;
        if (!page?.slug) throw new Error("Could not load the page.");
        return page;
      })
      .then((page) => {
        if (page) setState({ kind: "ready", page });
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setState({ kind: "error", message: err.message || "Page not found." });
      });
    return () => controller.abort();
  }, [apiBase, mode, slug, asPublic]);

  useEffect(() => {
    if (state.kind !== "ready") return;
    document.title = `${state.page.name} — Kaiano Levine`;
    const h1 = document.querySelector("h1");
    if (h1) h1.textContent = state.page.name;
  }, [state]);

  return (
    <div class="space-y-8">
      {mode === "admin" && slug ? <AsPublicToggle asPublic={asPublic} /> : null}
      {state.kind === "loading" ? (
        <div class="text-sm text-slate-500">Loading…</div>
      ) : state.kind === "error" && state.message === "not-found" ? (
        <NotFound slug={slug} mode={mode} />
      ) : state.kind === "error" ? (
        <div class="text-sm text-slate-500">{state.message}</div>
      ) : (
        <Body page={state.page} mode={mode} />
      )}
    </div>
  );
}
