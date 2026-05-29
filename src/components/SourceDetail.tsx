/** @jsxImportSource preact */
import { useEffect, useState } from "preact/hooks";

// ---------- Types (mirror the API response) ----------

type Source = {
  id: string;
  transcript_id: string;
  title: string | null;
  session_date: string | null;
  session_type: string;
  instructors_raw: string[];
  students_raw: string[];
  organization: string;
  visibility: string;
  is_default_visible: boolean;
  created_at: string;
};

type Attribution = {
  id: string;
  attribution_kind: string;
  prose: string;
  raw_term: string;
  position: number;
  drill_goal?: string | null;
  drill_steps?: string[] | null;
  mistake_text?: string | null;
  correction_text?: string | null;
  origin: string;
  entity_slug: string;
  entity_name: string;
  entity_kind: string;
  instructor_slug: string | null;
  instructor_name: string | null;
};

type Definition = {
  id: string;
  term: string;
  definition: string;
  position: number;
  origin: string;
  entity_slug: string;
  entity_name: string;
  entity_kind: string;
  instructor_slug: string | null;
  instructor_name: string | null;
};

type SkillItem = {
  id: string;
  skill_name: string;
  skill_slug: string;
  prose: string;
  focus_context?: string;
  origin: string;
};

type DrillPurpose = SkillItem & {
  drill_entity_slug: string;
  drill_entity_name: string;
};

type TechniqueRequirement = SkillItem & {
  technique_entity_slug: string;
  technique_entity_name: string;
};

type Relation = {
  id: string;
  relation_kind: string;
  prose: string;
  origin: string;
  from_entity_slug: string;
  from_entity_name: string;
  from_entity_kind: string;
  to_entity_slug: string;
  to_entity_name: string;
  to_entity_kind: string;
};

type Reference = {
  id: string;
  referenced_name: string;
  context: string;
  ref_type: string;
  origin: string;
  created_at: string;
};

type View = {
  source: Source;
  attributions?: Attribution[];
  definitions?: Definition[];
  drill_purposes?: DrillPurpose[];
  technique_requirements?: TechniqueRequirement[];
  relations?: Relation[];
  references?: Reference[];
};

type Props = {
  sourceId: string;
  sessionToken: string;
  apiBase: string;
  mode: "public" | "admin";
};

// ---------- Constants ----------

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

const RELATION_KIND_LABELS: Record<string, string> = {
  related_to: "related to",
  same_as: "same as",
  part_of: "part of",
  prerequisite_of: "prerequisite of",
  refines: "refines",
  contrasts_with: "contrasts with",
};

// ---------- Helpers ----------

function formatDate(iso: string | null | undefined): string {
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

function relationLabel(kind: string): string {
  return RELATION_KIND_LABELS[kind] || kind.replace(/_/g, " ");
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

function buildSummary(view: View): string {
  const s = view.source;
  const bits: string[] = [];
  const instructors = sourceInstructors(s);
  const withVal = sourceWith(s);
  const verb =
    s.session_type === "private_lesson"
      ? `with ${instructors || "an instructor"}${withVal ? ` for ${withVal}` : ""}`
      : `with ${instructors || "instructors"}${withVal ? ` at ${withVal}` : ""}`;
  bits.push(`${SESSION_LABELS[s.session_type] || s.session_type} ${verb}`);
  if (s.session_date) bits.push(formatDate(s.session_date));

  const counts: string[] = [];
  const attr = view.attributions?.length ?? 0;
  const defs = view.definitions?.length ?? 0;
  const drills = view.drill_purposes?.length ?? 0;
  const techs = view.technique_requirements?.length ?? 0;
  const rels = view.relations?.length ?? 0;
  if (attr) counts.push(`${attr} ${attr === 1 ? "attribution" : "attributions"}`);
  if (defs) counts.push(`${defs} ${defs === 1 ? "definition" : "definitions"}`);
  if (drills) counts.push(`${drills} ${drills === 1 ? "drill" : "drills"}`);
  if (techs) counts.push(`${techs} technique ${techs === 1 ? "requirement" : "requirements"}`);
  if (rels) counts.push(`${rels} ${rels === 1 ? "relation" : "relations"}`);

  return counts.length ? `${bits.join(" · ")} — ${counts.join(", ")}` : bits.join(" · ");
}

function entityHref(slug: string, _kind: string): string {
  if (!slug) return "#";
  return `/wiki/${slug}`;
}

function instructorHref(slug: string | null): string {
  if (!slug) return "#";
  return `/instructors/${slug}`;
}

// ---------- Visual primitives (match old UI vocabulary) ----------

const SECTION_HEADER_CLASS =
  "mb-3 text-xs font-mono uppercase tracking-widest text-slate-500";
const CARD_CLASS = "rounded-lg border border-white/8 bg-surface/40 px-4 py-3";

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <h2 class={SECTION_HEADER_CLASS}>
      {label}
      {typeof count === "number" && count > 0 ? (
        <span class="ml-2 text-slate-600 normal-case tracking-normal">
          {count}
        </span>
      ) : null}
    </h2>
  );
}

function EntityLink({
  slug,
  name,
  kind,
}: {
  slug: string;
  name: string;
  kind: string;
}) {
  if (!slug || !name) {
    return <span class="text-slate-300">{name || slug || "(unnamed)"}</span>;
  }
  return (
    <a
      href={entityHref(slug, kind)}
      class="text-slate-100 hover:text-accent transition-colors underline-offset-2 hover:underline"
    >
      {name}
    </a>
  );
}

function InstructorLink({
  slug,
  name,
}: {
  slug: string | null;
  name: string | null;
}) {
  if (!name) return null;
  if (!slug) return <span class="text-slate-300">{name}</span>;
  return (
    <a
      href={instructorHref(slug)}
      class="text-slate-100 hover:text-accent transition-colors underline-offset-2 hover:underline"
    >
      {name}
    </a>
  );
}

function KindBadge({ label }: { label: string }) {
  return (
    <span class="inline-flex shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-slate-500">
      {label}
    </span>
  );
}

function SkillPill({ label }: { label: string }) {
  return (
    <span class="inline-flex items-center rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-xs font-mono text-accent">
      {label}
    </span>
  );
}

// ---------- Sections ----------

function Hero({ view }: { view: View }) {
  const summary = buildSummary(view);
  return <p class="text-slate-300 leading-relaxed">{summary}</p>;
}

function Attributions({ items }: { items: Attribution[] }) {
  if (!items.length) return null;
  const sorted = [...items].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  return (
    <section>
      <SectionHeader label="Teaching" count={items.length} />
      <div class="space-y-4">
        {sorted.map((attr) => {
          const badge = kindLabel(attr.attribution_kind);
          return (
            <div key={attr.id} class={CARD_CLASS}>
              <div class="flex flex-wrap items-baseline gap-2 mb-1.5">
                <p class="text-sm font-medium text-slate-200">
                  {attr.instructor_name ? (
                    <>
                      <InstructorLink
                        slug={attr.instructor_slug}
                        name={attr.instructor_name}
                      />
                      <span class="text-slate-500"> on </span>
                    </>
                  ) : null}
                  <EntityLink
                    slug={attr.entity_slug}
                    name={attr.entity_name || attr.raw_term}
                    kind={attr.entity_kind}
                  />
                </p>
                {badge && <KindBadge label={badge} />}
              </div>

              {attr.prose && (
                <p class="text-sm text-slate-300 leading-relaxed">
                  {attr.prose}
                </p>
              )}

              {attr.drill_goal && (
                <p class="text-xs text-slate-500 italic mt-1.5">
                  Goal: {attr.drill_goal}
                </p>
              )}

              {Array.isArray(attr.drill_steps) && attr.drill_steps.length > 0 && (
                <>
                  <p class="text-xs text-slate-500 mt-2.5 mb-1 font-mono uppercase tracking-wider">
                    Steps
                  </p>
                  <ol class="space-y-1">
                    {attr.drill_steps.map((step, j) => (
                      <li key={j} class="text-sm text-slate-300 flex gap-2">
                        <span class="text-slate-600 shrink-0">{j + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {(attr.mistake_text || attr.correction_text) && (
                <div class="mt-3 border-l-2 border-amber-500/40 pl-3 text-sm">
                  {attr.mistake_text && (
                    <span class="text-slate-300">{attr.mistake_text}</span>
                  )}
                  {attr.correction_text && (
                    <>
                      <span class="text-slate-500"> → </span>
                      <span class="text-slate-200">{attr.correction_text}</span>
                    </>
                  )}
                </div>
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
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  return (
    <section>
      <SectionHeader label="Vocabulary" count={items.length} />
      <dl class="space-y-3">
        {sorted.map((d) => (
          <div key={d.id}>
            <dt class="text-sm font-medium text-slate-200 flex flex-wrap items-baseline gap-2">
              <span>{d.term}</span>
              {d.entity_slug &&
                d.entity_name &&
                d.entity_name.toLowerCase() !== d.term.toLowerCase() && (
                  <span class="text-[10px] font-mono text-slate-500">
                    →{" "}
                    <EntityLink
                      slug={d.entity_slug}
                      name={d.entity_name}
                      kind={d.entity_kind}
                    />
                  </span>
                )}
            </dt>
            {d.definition && (
              <dd class="text-sm text-slate-400 mt-0.5 leading-relaxed">
                {d.definition}
              </dd>
            )}
            {d.instructor_name && (
              <p class="text-xs text-slate-500 mt-1 italic">
                — defined by{" "}
                <InstructorLink
                  slug={d.instructor_slug}
                  name={d.instructor_name}
                />
              </p>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}

function DrillPurposes({ items }: { items: DrillPurpose[] }) {
  if (!items.length) return null;
  return (
    <section>
      <SectionHeader label="Drills" count={items.length} />
      <div class="space-y-4">
        {items.map((d) => (
          <div key={d.id} class={CARD_CLASS}>
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <p class="font-medium text-sm text-slate-200">
                <EntityLink
                  slug={d.drill_entity_slug}
                  name={d.drill_entity_name || d.skill_name}
                  kind="drill"
                />
              </p>
              {d.skill_name && d.skill_name !== d.drill_entity_name && (
                <SkillPill label={d.skill_name} />
              )}
            </div>
            {d.prose && (
              <p class="text-sm text-slate-300 leading-relaxed mt-1">
                {d.prose}
              </p>
            )}
            {d.focus_context && (
              <p class="text-xs text-slate-500 italic mt-1.5">
                {d.focus_context}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function TechniqueRequirements({ items }: { items: TechniqueRequirement[] }) {
  if (!items.length) return null;
  return (
    <section>
      <SectionHeader label="Technique requirements" count={items.length} />
      <div class="space-y-4">
        {items.map((t) => (
          <div key={t.id} class={CARD_CLASS}>
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <p class="font-medium text-sm text-slate-200">
                <EntityLink
                  slug={t.technique_entity_slug}
                  name={t.technique_entity_name || t.skill_name}
                  kind="technique"
                />
              </p>
              {t.skill_name && t.skill_name !== t.technique_entity_name && (
                <SkillPill label={t.skill_name} />
              )}
            </div>
            {t.prose && (
              <p class="text-sm text-slate-300 leading-relaxed mt-1">
                {t.prose}
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
      <SectionHeader label="Relations" count={items.length} />
      <ul class="space-y-3">
        {items.map((r) => (
          <li key={r.id} class="text-sm">
            <div class="flex flex-wrap items-baseline gap-2 text-slate-200">
              <EntityLink
                slug={r.from_entity_slug}
                name={r.from_entity_name}
                kind={r.from_entity_kind}
              />
              <span class="text-[10px] font-mono uppercase tracking-wide text-slate-500">
                {relationLabel(r.relation_kind)} →
              </span>
              <EntityLink
                slug={r.to_entity_slug}
                name={r.to_entity_name}
                kind={r.to_entity_kind}
              />
            </div>
            {r.prose && (
              <p class="text-slate-400 mt-1 leading-relaxed">{r.prose}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function References({ items }: { items: Reference[] }) {
  if (!items.length) return null;
  return (
    <section>
      <SectionHeader label="People mentioned" count={items.length} />
      <div class="space-y-3">
        {items.map((ref) => (
          <div key={ref.id} class="text-sm">
            <div class="flex flex-wrap items-baseline gap-2">
              {ref.referenced_name && (
                <span class="font-medium text-slate-200">
                  {ref.referenced_name}
                </span>
              )}
              {ref.ref_type && (
                <KindBadge label={ref.ref_type.replace(/_/g, " ")} />
              )}
            </div>
            {ref.context && (
              <p class="text-slate-400 mt-0.5 leading-relaxed">
                {ref.context}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function AdminProvenance({ source }: { source: Source }) {
  const visible = source.is_default_visible;
  return (
    <div class="border-t border-white/8 pt-4 mt-2 space-y-1.5">
      <div class="flex flex-wrap items-center gap-3 text-xs">
        <span class="inline-flex items-center gap-1.5 font-mono text-slate-400">
          <span
            class={`h-1.5 w-1.5 rounded-full ${
              visible ? "bg-accent" : "bg-slate-600"
            }`}
          />
          {visible ? "visible" : "hidden"}
        </span>
        <span class="text-slate-600">·</span>
        <span class="font-mono text-slate-500">
          added {formatDate(source.created_at)}
        </span>
      </div>
      <p class="font-mono text-[10px] text-slate-600 break-all">
        source {source.id} · transcript {source.transcript_id}
      </p>
    </div>
  );
}

function OperatorEditsCallout({
  attributions,
  definitions,
  relations,
  drills,
  techs,
}: {
  attributions: Attribution[];
  definitions: Definition[];
  relations: Relation[];
  drills: DrillPurpose[];
  techs: TechniqueRequirement[];
}) {
  const edited =
    attributions.filter((a) => a.origin && a.origin !== "extraction").length +
    definitions.filter((d) => d.origin && d.origin !== "extraction").length +
    relations.filter((r) => r.origin && r.origin !== "extraction").length +
    drills.filter((d) => d.origin && d.origin !== "extraction").length +
    techs.filter((t) => t.origin && t.origin !== "extraction").length;
  if (edited === 0) return null;
  return (
    <section class="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
      <p class="text-xs font-mono uppercase tracking-widest text-amber-400/80 mb-1">
        Operator edits
      </p>
      <p class="text-sm text-slate-300">
        {edited} {edited === 1 ? "row has" : "rows have"} been edited from the
        original LLM extraction.
      </p>
    </section>
  );
}

// ---------- Root component ----------

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
  const attributions = view.attributions ?? [];
  const definitions = view.definitions ?? [];
  const drills = view.drill_purposes ?? [];
  const techs = view.technique_requirements ?? [];
  const relations = view.relations ?? [];
  const references = view.references ?? [];

  return (
    <div class="space-y-8">
      <Hero view={view} />
      <Attributions items={attributions} />
      <Definitions items={definitions} />
      <DrillPurposes items={drills} />
      <TechniqueRequirements items={techs} />
      <Relations items={relations} />
      <References items={references} />
      {mode === "admin" && (
        <OperatorEditsCallout
          attributions={attributions}
          definitions={definitions}
          relations={relations}
          drills={drills}
          techs={techs}
        />
      )}
      {mode === "admin" && <AdminProvenance source={view.source} />}
    </div>
  );
}
