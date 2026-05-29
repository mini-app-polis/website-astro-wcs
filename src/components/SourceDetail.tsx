/** @jsxImportSource preact */
import { useEffect, useState } from "preact/hooks";

type Source = {
  session_date?: string | null;
  session_type: string;
  students_raw?: string[];
  organization?: string;
  instructors_raw?: string[];
  title?: string | null;
  created_at?: string;
};

type Attribution = {
  raw_term?: string;
  attribution_kind?: string;
  prose?: string;
  drill_goal?: string;
  drill_steps?: string[];
  mistake_text?: string;
  correction_text?: string;
  position?: number;
};

type Definition = { term?: string; definition?: string; position?: number };
type SkillItem = { skill_name?: string; prose?: string; focus_context?: string };
type Relation = { relation_kind?: string; prose?: string };
type Reference = { referenced_name?: string; ref_type?: string; context?: string };

type View = {
  source: Source;
  attributions?: Attribution[];
  definitions?: Definition[];
  drill_purposes?: SkillItem[];
  technique_requirements?: SkillItem[];
  relations?: Relation[];
  references?: Reference[];
};

type Props = {
  sourceId: string;
  sessionToken: string;
  apiBase: string;
  mode: "public" | "admin";
};

const SESSION_LABELS: Record<string, string> = {
  private_lesson: "Private lesson",
  group_class: "Group class",
  workshop: "Workshop",
  other: "Other",
};

const ATTRIBUTION_KIND_LABELS: Record<string, string> = {
  taught: "Taught",
  demonstrated: "Demonstrated",
  drilled: "Drilled",
};

function formatDate(iso: string): string {
  if (!iso) return "";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = dateOnly
    ? (() => {
        const [y, m, day] = iso.split("-").map(Number);
        return new Date(y, m - 1, day);
      })()
    : new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function kindLabel(kind: string): string | null {
  if (!kind || kind === "taught") return null;
  return (
    ATTRIBUTION_KIND_LABELS[kind] ||
    kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function sourceInstructors(source: Source): string {
  return source.instructors_raw?.length ? source.instructors_raw.join(" + ") : "";
}

function sourceWith(source: Source): string {
  if (source.session_type === "private_lesson") {
    return source.students_raw?.length ? source.students_raw.join(" + ") : "";
  }
  return source.organization || "";
}

function buildDisplayTitle(source: Source): string {
  const parts: string[] = [];
  if (source.session_date) parts.push(formatDate(source.session_date));
  parts.push(SESSION_LABELS[source.session_type] || source.session_type);
  const withVal = sourceWith(source);
  if (withVal) parts.push(withVal);
  const instructors = sourceInstructors(source);
  if (instructors && source.session_type !== "private_lesson") {
    parts.push(instructors);
  }
  if (source.title?.trim()) parts.push(source.title.trim());
  return parts.join(" · ");
}

const SECTION_HEADER_CLASS =
  "mb-3 text-xs font-mono uppercase tracking-widest text-slate-500";
const CARD_CLASS = "rounded-lg border border-white/8 bg-surface/40 px-4 py-3";

function SectionHeader({ label }: { label: string }) {
  return <h2 class={SECTION_HEADER_CLASS}>{label}</h2>;
}

function SubDetail({ label, text }: { label: string; text?: string | null }) {
  if (!text) return null;
  return (
    <p class="text-xs text-slate-400 mt-1">
      <span class="text-slate-500">{label}: </span>
      {text}
    </p>
  );
}

function Attributions({ items }: { items: Attribution[] }) {
  if (!items.length) return null;
  const sorted = [...items].sort(
    (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0),
  );
  return (
    <section>
      <SectionHeader label="Teaching" />
      <div class="space-y-4">
        {sorted.map((attr, i) => {
          const label = kindLabel(String(attr.attribution_kind ?? ""));
          return (
            <div key={i} class={CARD_CLASS}>
              {(attr.raw_term || label) && (
                <div class="flex flex-wrap items-baseline gap-2 mb-1">
                  {attr.raw_term && (
                    <p class="text-sm font-medium text-slate-200">
                      {String(attr.raw_term)}
                    </p>
                  )}
                  {label && (
                    <span class="inline-flex rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-slate-500">
                      {label}
                    </span>
                  )}
                </div>
              )}
              {attr.prose && (
                <p class="text-sm text-slate-300 leading-relaxed">
                  {String(attr.prose)}
                </p>
              )}
              <SubDetail
                label="Goal"
                text={attr.drill_goal ? String(attr.drill_goal) : null}
              />
              {Array.isArray(attr.drill_steps) && attr.drill_steps.length > 0 && (
                <>
                  <p class="text-xs text-slate-500 mt-2 mb-1">Steps</p>
                  <ol class="space-y-1">
                    {attr.drill_steps.map((step, j) => (
                      <li key={j} class="text-sm text-slate-300 flex gap-2">
                        <span class="text-slate-600 shrink-0 font-mono text-xs">
                          {j + 1}.
                        </span>
                        <span>{String(step)}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {(attr.mistake_text || attr.correction_text) && (
                <p class="text-sm mt-2">
                  {attr.mistake_text && (
                    <span class="text-slate-300">{String(attr.mistake_text)}</span>
                  )}
                  {attr.correction_text && (
                    <>
                      <span class="text-slate-500"> → </span>
                      <span class="text-slate-300">
                        {String(attr.correction_text)}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Definitions({ items }: { items: Definition[] }) {
  if (!items.length) return null;
  const sorted = [...items].sort(
    (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0),
  );
  return (
    <section>
      <SectionHeader label="Definitions" />
      <dl class="space-y-3">
        {sorted.map((item, i) => (
          <div key={i}>
            <dt class="text-sm font-medium text-slate-200">
              {String(item.term ?? "")}
            </dt>
            {item.definition && (
              <dd class="text-sm text-slate-400 mt-0.5 leading-relaxed">
                {String(item.definition)}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}

function SkillCards({ label, items }: { label: string; items: SkillItem[] }) {
  if (!items.length) return null;
  return (
    <section>
      <SectionHeader label={label} />
      <div class="space-y-4">
        {items.map((item, i) => (
          <div key={i} class={CARD_CLASS}>
            {item.skill_name && (
              <p class="font-medium text-sm text-slate-200">
                {String(item.skill_name)}
              </p>
            )}
            {item.prose && (
              <p class="text-sm text-slate-300 mt-1 leading-relaxed">
                {String(item.prose)}
              </p>
            )}
            {item.focus_context && (
              <p class="text-xs text-slate-500 mt-1">
                {String(item.focus_context)}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Relations({ items }: { items: Relation[] }) {
  if (!items.length) return null;
  return (
    <section>
      <SectionHeader label="Relations" />
      <ul class="space-y-3">
        {items.map((rel, i) => {
          const label = kindLabel(String(rel.relation_kind ?? ""));
          return (
            <li key={i} class="text-sm text-slate-300">
              {label && (
                <span class="inline-block mr-2 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-slate-500">
                  {label}
                </span>
              )}
              {String(rel.prose ?? "")}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function References({ items }: { items: Reference[] }) {
  if (!items.length) return null;
  return (
    <section>
      <SectionHeader label="People mentioned" />
      <div class="space-y-3">
        {items.map((ref, i) => {
          const name = String(ref.referenced_name ?? "").trim();
          return (
            <div key={i} class="text-sm">
              {name && <span class="font-medium text-slate-200">{name}</span>}
              {ref.ref_type && (
                <span class="ml-2 text-xs font-mono text-slate-500">
                  {String(ref.ref_type).replace(/_/g, " ")}
                </span>
              )}
              {ref.context && (
                <p class="text-slate-400 mt-0.5 leading-relaxed">
                  {String(ref.context)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function SourceDetail({
  sourceId,
  sessionToken,
  apiBase,
  mode,
}: Props) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; view: View }
  >({ kind: "loading" });

  useEffect(() => {
    if (!apiBase || !sourceId) {
      setState({
        kind: "error",
        message: mode === "admin" ? "Source not found." : "Lesson not found.",
      });
      return;
    }

    const path =
      mode === "admin"
        ? `/v1/wcs/wiki/admin/sources/${sourceId}`
        : `/v1/wcs/wiki/sources/${sourceId}`;

    const controller = new AbortController();

    fetch(`${apiBase.replace(/\/$/, "")}${path}`, {
      headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.status === 403) {
          throw new Error(
            mode === "admin"
              ? "Admin access required."
              : "You don't have access to this lesson.",
          );
        }
        if (!res.ok) throw new Error("not found");
        const json = await res.json();
        const view = json?.data as View | undefined;
        if (!view?.source) throw new Error("no data");
        return view;
      })
      .then((view) => setState({ kind: "ready", view }))
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        const fallback =
          mode === "admin" ? "Source not found." : "Lesson not found.";
        setState({ kind: "error", message: err.message || fallback });
      });

    return () => controller.abort();
  }, [sourceId, sessionToken, apiBase, mode]);

  // Side effects on successful load: update <title> and remove any pre-existing
  // header subtitle. The .astro page's <Page> layout renders an h1 we update.
  useEffect(() => {
    if (state.kind !== "ready") return;
    const displayTitle = buildDisplayTitle(state.view.source);
    if (displayTitle) {
      document.title = displayTitle + " — Kaiano Levine";
      const h1 = document.querySelector("h1");
      if (h1) h1.textContent = displayTitle;
    }
    const existingSub = document.querySelector("header p");
    if (existingSub) existingSub.remove();
  }, [state]);

  if (state.kind === "loading") {
    return <div class="text-sm text-slate-500">Loading…</div>;
  }

  if (state.kind === "error") {
    return <div class="text-sm text-slate-500">{state.message}</div>;
  }

  const { view } = state;
  const { source } = view;

  return (
    <div class="space-y-8">
      <Attributions items={view.attributions ?? []} />
      <Definitions items={view.definitions ?? []} />
      <SkillCards label="Drills" items={view.drill_purposes ?? []} />
      <SkillCards
        label="Technique requirements"
        items={view.technique_requirements ?? []}
      />
      <Relations items={view.relations ?? []} />
      <References items={view.references ?? []} />
      {source.created_at && (
        <div class="border-t border-white/8 pt-4 text-xs text-slate-600">
          Added {formatDate(source.created_at)}
        </div>
      )}
    </div>
  );
}
