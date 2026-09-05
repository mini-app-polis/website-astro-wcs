/** @jsxImportSource preact */
import { useEffect, useState } from "preact/hooks";
import { getSessionToken, handleDenial } from "../lib/session";

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
  entity_id?: string;
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
  entity_id?: string;
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
  /** Omitted on static pages: taken from the last path segment instead. */
  sourceId?: string;
  /** Omitted on static pages: fetched live from Clerk instead. */
  sessionToken?: string;
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

// Build a stable content key for an attribution. Two attributions with the
// same key are considered "the same teaching point" — typically because the
// composer wrote one row per co-instructor on a co-taught lesson.
function attributionContentKey(a: Attribution): string {
  return JSON.stringify([
    a.attribution_kind,
    a.prose,
    a.raw_term,
    a.drill_goal ?? "",
    Array.isArray(a.drill_steps) ? a.drill_steps : [],
    a.mistake_text ?? "",
    a.correction_text ?? "",
  ]);
}

// Same idea for definitions: dedup by entity + term + definition prose, since
// "shared center defined by Kaiano" and "shared center defined by Amy" are
// duplicates of the same definition when the prose is identical.
function definitionContentKey(d: Definition): string {
  return JSON.stringify([d.entity_id, d.term, d.definition]);
}

// Collapse a list of attributions by content key. For each surviving row,
// also return the set of instructor display names that contributed to it.
// The surviving row is the one with the smallest position; that determines
// the row's ordering downstream.
type DedupedAttribution = {
  row: Attribution;
  instructorNames: string[];
};

function dedupAttributions(items: Attribution[]): DedupedAttribution[] {
  const buckets = new Map<string, Attribution[]>();
  for (const a of items) {
    const k = attributionContentKey(a);
    const arr = buckets.get(k) ?? [];
    arr.push(a);
    buckets.set(k, arr);
  }
  const result: DedupedAttribution[] = [];
  for (const arr of buckets.values()) {
    arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const namesInOrder: string[] = [];
    const seen = new Set<string>();
    for (const a of arr) {
      if (a.instructor_name && !seen.has(a.instructor_name)) {
        seen.add(a.instructor_name);
        namesInOrder.push(a.instructor_name);
      }
    }
    result.push({ row: arr[0], instructorNames: namesInOrder });
  }
  return result;
}

type DedupedDefinition = {
  row: Definition;
  instructorNames: string[];
};

function dedupDefinitions(items: Definition[]): DedupedDefinition[] {
  const buckets = new Map<string, Definition[]>();
  for (const d of items) {
    const k = definitionContentKey(d);
    const arr = buckets.get(k) ?? [];
    arr.push(d);
    buckets.set(k, arr);
  }
  const result: DedupedDefinition[] = [];
  for (const arr of buckets.values()) {
    arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const namesInOrder: string[] = [];
    const seen = new Set<string>();
    for (const d of arr) {
      if (d.instructor_name && !seen.has(d.instructor_name)) {
        seen.add(d.instructor_name);
        namesInOrder.push(d.instructor_name);
      }
    }
    result.push({ row: arr[0], instructorNames: namesInOrder });
  }
  return result;
}

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
  const instructors = sourceInstructors(s);
  const withVal = sourceWith(s);
  const bits: string[] = [];
  if (s.session_type === "private_lesson") {
    bits.push(
      `${SESSION_LABELS[s.session_type] || s.session_type}${
        instructors ? ` with ${instructors}` : ""
      }${withVal ? ` for ${withVal}` : ""}`,
    );
  } else {
    bits.push(
      `${SESSION_LABELS[s.session_type] || s.session_type}${
        instructors ? ` with ${instructors}` : ""
      }${withVal ? ` at ${withVal}` : ""}`,
    );
  }
  if (s.session_date) bits.push(formatDate(s.session_date));
  return bits.join(" · ");
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

  const groups = new Map<string, Attribution[]>();
  for (const a of items) {
    const key = a.entity_slug || a.entity_id || a.raw_term || "unknown";
    const arr = groups.get(key) ?? [];
    arr.push(a);
    groups.set(key, arr);
  }

  const ordered = [...groups.entries()]
    .map(([key, arr]) => {
      const deduped = dedupAttributions(arr);
      const minPos = Math.min(
        ...deduped.map((d) => d.row.position ?? 0),
        Infinity,
      );
      return { key, deduped, minPos };
    })
    .sort((x, y) => x.minPos - y.minPos);

  return (
    <section>
      <SectionHeader
        label="Teaching"
        count={ordered.reduce((sum, g) => sum + g.deduped.length, 0)}
      />
      <div class="space-y-6">
        {ordered.map(({ key, deduped }) => {
          const head = deduped[0].row;
          const conceptName = head.entity_name || head.raw_term || "(unnamed)";
          const conceptSlug = head.entity_slug;
          const conceptKind = head.entity_kind;

          const sorted = [
            ...deduped.filter(
              (d) => !d.row.mistake_text && !d.row.correction_text,
            ),
            ...deduped.filter(
              (d) => d.row.mistake_text || d.row.correction_text,
            ),
          ];

          return (
            <article key={key} class="border-l-2 border-accent/30 pl-4">
              <h3 class="mb-2 text-base font-medium text-slate-100">
                <EntityLink
                  slug={conceptSlug}
                  name={conceptName}
                  kind={conceptKind}
                />
              </h3>

              <div class="space-y-3">
                {sorted.map(({ row: attr }) => {
                  const isMistake =
                    !!attr.mistake_text || !!attr.correction_text;
                  const badge = kindLabel(attr.attribution_kind);

                  if (isMistake) {
                    return (
                      <div
                        key={attr.id}
                        class="border-l-2 border-amber-500/50 pl-3 py-0.5 text-sm"
                      >
                        <p class="text-[10px] font-mono uppercase tracking-wider text-amber-400/70 mb-1">
                          Common mistake
                        </p>
                        {attr.mistake_text && (
                          <p class="text-slate-300 leading-relaxed">
                            {attr.mistake_text}
                          </p>
                        )}
                        {attr.correction_text && (
                          <p class="text-slate-200 leading-relaxed mt-1">
                            <span class="text-slate-500">Fix: </span>
                            {attr.correction_text}
                          </p>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={attr.id} class="text-sm">
                      {attr.prose && (
                        <p class="text-slate-300 leading-relaxed">
                          {badge && (
                            <span class="mr-2 inline-flex items-baseline rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-slate-500 align-baseline">
                              {badge}
                            </span>
                          )}
                          {attr.prose}
                        </p>
                      )}

                      {attr.drill_goal && (
                        <p class="text-xs text-slate-500 italic mt-1">
                          Goal: {attr.drill_goal}
                        </p>
                      )}

                      {Array.isArray(attr.drill_steps) &&
                        attr.drill_steps.length > 0 && (
                          <ol class="mt-2 space-y-1">
                            {attr.drill_steps.map((step, j) => (
                              <li
                                key={j}
                                class="text-sm text-slate-300 flex gap-2"
                              >
                                <span class="text-slate-600 shrink-0">
                                  {j + 1}.
                                </span>
                                <span>{step}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Definitions({ items }: { items: Definition[] }) {
  if (!items.length) return null;

  const deduped = dedupDefinitions(items);
  deduped.sort(
    (a, b) => (a.row.position ?? 0) - (b.row.position ?? 0),
  );

  return (
    <section>
      <SectionHeader label="Vocabulary" count={deduped.length} />
      <dl class="space-y-4">
        {deduped.map(({ row: d }) => (
          <div key={d.id}>
            <dt class="text-sm font-medium text-slate-100">
              {d.entity_slug && d.entity_name ? (
                <EntityLink
                  slug={d.entity_slug}
                  name={d.entity_name}
                  kind={d.entity_kind}
                />
              ) : (
                d.term
              )}
            </dt>
            {d.definition && (
              <dd class="text-sm text-slate-300 mt-0.5 leading-relaxed">
                {d.definition}
              </dd>
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
      <div class="space-y-5">
        {items.map((d) => (
          <article key={d.id}>
            <h3 class="text-sm font-medium text-slate-100">
              <EntityLink
                slug={d.drill_entity_slug}
                name={d.drill_entity_name || d.skill_name}
                kind="drill"
              />
            </h3>
            {d.prose && (
              <p class="text-sm text-slate-300 leading-relaxed mt-1">
                {d.prose}
              </p>
            )}
            {d.focus_context && (
              <p class="text-xs text-slate-500 italic mt-1">
                {d.focus_context}
              </p>
            )}
          </article>
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
      <div class="space-y-5">
        {items.map((t) => (
          <article key={t.id}>
            <h3 class="text-sm font-medium text-slate-100">
              <EntityLink
                slug={t.technique_entity_slug}
                name={t.technique_entity_name || t.skill_name}
                kind="technique"
              />
            </h3>
            {t.prose && (
              <p class="text-sm text-slate-300 leading-relaxed mt-1">
                {t.prose}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function Relations({ items }: { items: Relation[] }) {
  if (!items.length) return null;
  return (
    <section>
      <SectionHeader label="How these connect" count={items.length} />
      <ul class="space-y-3">
        {items.map((r) => (
          <li key={r.id} class="text-sm">
            <p class="text-slate-200">
              <EntityLink
                slug={r.from_entity_slug}
                name={r.from_entity_name}
                kind={r.from_entity_kind}
              />
              <span class="mx-2 text-[10px] font-mono uppercase tracking-wide text-slate-500">
                {relationLabel(r.relation_kind)}
              </span>
              <EntityLink
                slug={r.to_entity_slug}
                name={r.to_entity_name}
                kind={r.to_entity_kind}
              />
            </p>
            {r.prose && (
              <p class="text-xs text-slate-500 mt-1 leading-relaxed">
                {r.prose}
              </p>
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
      <ul class="space-y-3">
        {items.map((ref) => (
          <li key={ref.id} class="text-sm">
            <p class="text-slate-200">
              {ref.referenced_name && (
                <span class="font-medium">{ref.referenced_name}</span>
              )}
              {ref.ref_type && (
                <span class="ml-2 text-xs text-slate-500 lowercase">
                  {ref.ref_type.replace(/_/g, " ")}
                </span>
              )}
            </p>
            {ref.context && (
              <p class="text-xs text-slate-400 mt-1 leading-relaxed">
                {ref.context}
              </p>
            )}
          </li>
        ))}
      </ul>
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
  const dedupedAttrs = dedupAttributions(attributions).map((d) => d.row);
  const dedupedDefs = dedupDefinitions(definitions).map((d) => d.row);

  const edited =
    dedupedAttrs.filter((a) => a.origin && a.origin !== "extraction").length +
    dedupedDefs.filter((d) => d.origin && d.origin !== "extraction").length +
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
    // The page is static, so neither the id nor the token can come from the
    // server. The id rides in ?id=, not in the path: a path-shaped id needs a
    // rewrite to reach a static shell, and that rewrite is what looped in
    // production. The token comes live from Clerk, so it is never the stale one
    // a cookie would hold.
    const id =
      sourceId ||
      (typeof location !== "undefined"
        ? (new URLSearchParams(location.search).get("id") ?? "")
        : "");

    // No id at all means nobody picked a lesson - most often a stale link, or a
    // browser replaying the 308 that the old /notes/* rewrite briefly produced.
    // Say that, and point back to the list. Deliberately NOT an automatic
    // redirect: a browser holding that cached 308 would bounce between /notes
    // and here forever.
    if (!id) {
      setState({ kind: "error", message: "No lesson selected." });
      return;
    }

    if (!apiBase) {
      setState({
        kind: "error",
        message: mode === "admin" ? "Source not found." : "Lesson not found.",
      });
      return;
    }

    const path =
      mode === "admin"
        ? `/v1/wcs/wiki/admin/sources/${id}`
        : `/v1/wcs/wiki/sources/${id}`;

    const controller = new AbortController();

    (async () => {
      const token = sessionToken || (await getSessionToken()) || "";
      // Signed out: do not call. An unauthenticated request earns a 401, and
      // handleDenial would bounce the visitor to /sign-in rather than letting
      // the surrounding <Show when="signed-out"> render its prompt.
      if (!token) return null;
      return fetch(`${apiBase.replace(/\/$/, "")}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      });
    })()
      .then(async (res) => {
        if (res === null) {
          setState({ kind: "error", message: "Sign in to view this." });
          return null;
        }
        // The API's refusal is the decision; route it rather than render it.
        if (res.status === 401 || res.status === 403) {
          handleDenial(res.status);
          await new Promise<never>(() => {});
        }
        if (!res.ok) throw new Error("not found");
        const json = await res.json();
        const view = json?.data as View | undefined;
        if (!view?.source) throw new Error("no data");
        return view;
      })
      .then((view) => { if (view) setState({ kind: "ready", view }); })
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
    <div class="space-y-10">
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
