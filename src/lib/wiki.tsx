/** @jsxImportSource preact */
/**
 * The wiki's page documents (wiki-curator-cog ADR-006, MINI-96/97).
 *
 * Pages are built by the curator and stored in api-kaianolevine-com, which
 * serves them filtered to the sources the caller can see. This module is the
 * site's half of that contract: the shapes the pages read, the URLs a page
 * links to, and the renderer for the small amount of markdown in their text.
 *
 * Links in page text are neutral — `[[slug]]`, `[[slug|label]]` for a page,
 * `[[source:<uuid>|label]]` for a lesson — and are turned into this site's
 * URLs here. Text is rendered as Preact nodes, never as HTML, so nothing in a
 * page can inject markup.
 */
import type { ComponentChildren } from "preact";

export type WikiMode = "public" | "admin";

export type WikiCitation = {
  source_id: string;
  source_slug: string;
  session_date: string | null;
  /** The source's visibility now: the API rewrites it on every read. */
  public: boolean;
};

export type WikiStatement = {
  kind: "attribution" | "definition";
  term: string;
  text: string;
  goal: string;
  steps: string[];
  citation: WikiCitation;
};

export type WikiTeacher = { name: string; statements: WikiStatement[] };

export type WikiMistake = { text: string; teacher: string; citation: WikiCitation };

export type WikiSkill = {
  skill: string;
  text: string;
  focus: string;
  citation: WikiCitation | null;
};

export type WikiLink = { slug: string; kind: string; name: string; count: number };

export type WikiRelated = {
  slug: string;
  kind: string;
  name: string;
  relation: string;
  text: string;
  citation: WikiCitation | null;
};

export type WikiDetail = { slug: string; name: string; gist: string; depth: number };

/** GET /v1/wcs/wiki/pages/{slug} (and the admin form). */
export type WikiPage = {
  slug: string;
  name: string;
  kind: string;
  status: string;
  aliases: string[];
  teachers: string[];
  definition: string;
  in_practice: string;
  details: WikiDetail[];
  by_teacher: WikiTeacher[];
  mistakes: WikiMistake[];
  develops: WikiSkill[];
  requires: WikiSkill[];
  related: WikiRelated[];
  mentions: WikiLink[];
  referenced_by: WikiLink[];
  sources: WikiCitation[];
  evidence_sources: string[];
  /** Every slug folded into this page (MINI-100). */
  folded?: string[];
  /** Set when the page was asked for under a slug folded into it: that slug. */
  requested_slug?: string | null;
};

/** GET /v1/wcs/wiki/pages (and the admin form): one row of the index. */
export type WikiPageSummary = {
  slug: string;
  name: string;
  kind: string;
  aliases: string[];
  definition: string;
  updated_at: string;
};

export const KIND_LABELS: Record<string, string> = {
  concept: "Concept",
  technique: "Technique",
  pattern: "Pattern",
  drill: "Drill",
};

/** Where the page data comes from, per mode. */
export function pagesPath(mode: WikiMode, slug?: string, asPublic = false): string {
  const base = mode === "admin" ? "/v1/wcs/wiki/admin/pages" : "/v1/wcs/wiki/pages";
  const path = slug ? `${base}/${encodeURIComponent(slug)}` : base;
  return mode === "admin" && asPublic ? `${path}?as=public` : path;
}

export function pageHref(mode: WikiMode, slug: string): string {
  const base = mode === "admin" ? "/admin/wiki/page" : "/wiki/page";
  return `${base}?slug=${encodeURIComponent(slug)}`;
}

export function lessonHref(mode: WikiMode, sourceId: string): string {
  const base = mode === "admin" ? "/notes/admin/detail" : "/notes/detail";
  return `${base}?id=${encodeURIComponent(sourceId)}`;
}

const LINK_CLASS =
  "text-slate-100 hover:text-accent transition-colors underline underline-offset-2 decoration-white/20 hover:decoration-accent";

// A neutral link, **bold**, or _italic_ / *italic*.
const TOKEN =
  /\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]|\*\*([^*]+)\*\*|(?<![\w*])_([^_]+)_(?!\w)|(?<![\w*])\*([^*\s][^*]*)\*(?![\w*])/g;

function words(slug: string): string {
  return slug.replace(/-/g, " ");
}

/** One line of page text as Preact nodes. */
export function inline(text: string, mode: WikiMode): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const [, target, , label, bold, under, star] = m;
    if (target !== undefined) {
      const t = target.trim();
      if (t.startsWith("source:")) {
        out.push(
          <a href={lessonHref(mode, t.slice("source:".length))} class={LINK_CLASS}>
            {label || "lesson"}
          </a>,
        );
      } else {
        out.push(
          <a href={pageHref(mode, t)} class={LINK_CLASS}>
            {label || words(t)}
          </a>,
        );
      }
    } else if (bold !== undefined) {
      out.push(<strong class="font-medium text-slate-100">{bold}</strong>);
    } else {
      out.push(<em>{under ?? star}</em>);
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Page text as paragraphs: blank lines separate them. */
export function Markdown({
  text,
  mode,
  class: cls = "",
}: {
  text: string;
  mode: WikiMode;
  class?: string;
}) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div class={`space-y-3 ${cls}`}>
      {paragraphs.map((p) => (
        <p>{inline(p.replace(/\s*\n\s*/g, " "), mode)}</p>
      ))}
    </div>
  );
}

/** Page text with the link syntax and emphasis taken out, for snippets. */
export function plainText(text: string): string {
  return text
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_m, t: string, l?: string) =>
      l || (t.startsWith("source:") ? "lesson" : words(t)),
    )
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<![\w*])[_*]([^_*]+)[_*](?![\w*])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = dateOnly
    ? (() => {
        const [y, m, day] = iso.split("-").map(Number);
        return new Date(y, m - 1, day);
      })()
    : new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
