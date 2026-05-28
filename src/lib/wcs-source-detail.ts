/** Client-side render helpers for WcsSourceViewItem detail pages. */

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

function formatDate(iso: string) {
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

function sectionHeader(label: string) {
  const h = document.createElement("h2");
  h.className = "mb-3 text-xs font-mono uppercase tracking-widest text-slate-500";
  h.textContent = label;
  return h;
}

function kindLabel(kind: string) {
  if (!kind || kind === "taught") return null;
  return (
    ATTRIBUTION_KIND_LABELS[kind] ||
    kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function sourceInstructors(source: { instructors_raw?: string[] }) {
  return source.instructors_raw?.length ? source.instructors_raw.join(" + ") : "";
}

function sourceWith(source: {
  session_type: string;
  students_raw?: string[];
  organization?: string;
}) {
  if (source.session_type === "private_lesson") {
    return source.students_raw?.length ? source.students_raw.join(" + ") : "";
  }
  return source.organization || "";
}

function buildDisplayTitle(source: {
  session_date?: string | null;
  session_type: string;
  students_raw?: string[];
  organization?: string;
  instructors_raw?: string[];
  title?: string | null;
}) {
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

function appendSubDetail(parent: HTMLElement, label: string, text: string | null) {
  if (!text) return;
  const row = document.createElement("p");
  row.className = "text-xs text-slate-400 mt-1";
  const strong = document.createElement("span");
  strong.className = "text-slate-500";
  strong.textContent = label + ": ";
  row.appendChild(strong);
  row.appendChild(document.createTextNode(text));
  parent.appendChild(row);
}

function renderAttributions(attributions: Array<Record<string, unknown>>) {
  if (!attributions?.length) return null;
  const section = document.createElement("section");
  section.appendChild(sectionHeader("Teaching"));
  const wrapper = document.createElement("div");
  wrapper.className = "space-y-4";

  const sorted = [...attributions].sort(
    (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)
  );
  for (const attr of sorted) {
    const card = document.createElement("div");
    card.className = "rounded-lg border border-white/8 bg-surface/40 px-4 py-3";

    const head = document.createElement("div");
    head.className = "flex flex-wrap items-baseline gap-2 mb-1";

    if (attr.raw_term) {
      const term = document.createElement("p");
      term.className = "text-sm font-medium text-slate-200";
      term.textContent = String(attr.raw_term);
      head.appendChild(term);
    }

    const label = kindLabel(String(attr.attribution_kind ?? ""));
    if (label) {
      const badge = document.createElement("span");
      badge.className =
        "inline-flex rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-slate-500";
      badge.textContent = label;
      head.appendChild(badge);
    }

    if (head.childNodes.length) card.appendChild(head);

    if (attr.prose) {
      const prose = document.createElement("p");
      prose.className = "text-sm text-slate-300 leading-relaxed";
      prose.textContent = String(attr.prose);
      card.appendChild(prose);
    }

    appendSubDetail(card, "Goal", attr.drill_goal ? String(attr.drill_goal) : null);
    const drillSteps = attr.drill_steps;
    if (Array.isArray(drillSteps) && drillSteps.length > 0) {
      const stepsLabel = document.createElement("p");
      stepsLabel.className = "text-xs text-slate-500 mt-2 mb-1";
      stepsLabel.textContent = "Steps";
      card.appendChild(stepsLabel);
      const ol = document.createElement("ol");
      ol.className = "space-y-1";
      drillSteps.forEach((step, i) => {
        const li = document.createElement("li");
        li.className = "text-sm text-slate-300 flex gap-2";
        const num = document.createElement("span");
        num.className = "text-slate-600 shrink-0 font-mono text-xs";
        num.textContent = String(i + 1) + ".";
        const t = document.createElement("span");
        t.textContent = String(step);
        li.appendChild(num);
        li.appendChild(t);
        ol.appendChild(li);
      });
      card.appendChild(ol);
    }
    if (attr.mistake_text || attr.correction_text) {
      const mc = document.createElement("p");
      mc.className = "text-sm mt-2";
      if (attr.mistake_text) {
        const m = document.createElement("span");
        m.className = "text-slate-300";
        m.textContent = String(attr.mistake_text);
        mc.appendChild(m);
      }
      if (attr.correction_text) {
        const arrow = document.createElement("span");
        arrow.className = "text-slate-500";
        arrow.textContent = " → ";
        const c = document.createElement("span");
        c.className = "text-slate-300";
        c.textContent = String(attr.correction_text);
        mc.appendChild(arrow);
        mc.appendChild(c);
      }
      card.appendChild(mc);
    }

    wrapper.appendChild(card);
  }

  section.appendChild(wrapper);
  return section;
}

function renderDefinitions(definitions: Array<Record<string, unknown>>) {
  if (!definitions?.length) return null;
  const section = document.createElement("section");
  section.appendChild(sectionHeader("Definitions"));
  const dl = document.createElement("dl");
  dl.className = "space-y-3";
  const sorted = [...definitions].sort(
    (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)
  );
  for (const item of sorted) {
    const div = document.createElement("div");
    const dt = document.createElement("dt");
    dt.className = "text-sm font-medium text-slate-200";
    dt.textContent = String(item.term ?? "");
    div.appendChild(dt);
    if (item.definition) {
      const dd = document.createElement("dd");
      dd.className = "text-sm text-slate-400 mt-0.5 leading-relaxed";
      dd.textContent = String(item.definition);
      div.appendChild(dd);
    }
    dl.appendChild(div);
  }
  section.appendChild(dl);
  return section;
}

function renderSkillCards(label: string, items: Array<Record<string, unknown>>) {
  if (!items?.length) return null;
  const section = document.createElement("section");
  section.appendChild(sectionHeader(label));
  const wrapper = document.createElement("div");
  wrapper.className = "space-y-4";
  for (const item of items) {
    const card = document.createElement("div");
    card.className = "rounded-lg border border-white/8 bg-surface/40 px-4 py-3";
    if (item.skill_name) {
      const name = document.createElement("p");
      name.className = "font-medium text-sm text-slate-200";
      name.textContent = String(item.skill_name);
      card.appendChild(name);
    }
    if (item.prose) {
      const prose = document.createElement("p");
      prose.className = "text-sm text-slate-300 mt-1 leading-relaxed";
      prose.textContent = String(item.prose);
      card.appendChild(prose);
    }
    if (item.focus_context) {
      const ctx = document.createElement("p");
      ctx.className = "text-xs text-slate-500 mt-1";
      ctx.textContent = String(item.focus_context);
      card.appendChild(ctx);
    }
    wrapper.appendChild(card);
  }
  section.appendChild(wrapper);
  return section;
}

function renderRelations(relations: Array<Record<string, unknown>>) {
  if (!relations?.length) return null;
  const section = document.createElement("section");
  section.appendChild(sectionHeader("Relations"));
  const ul = document.createElement("ul");
  ul.className = "space-y-3";
  for (const rel of relations) {
    const li = document.createElement("li");
    li.className = "text-sm text-slate-300";
    const relLabel = kindLabel(String(rel.relation_kind ?? ""));
    if (relLabel) {
      const badge = document.createElement("span");
      badge.className =
        "inline-block mr-2 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-slate-500";
      badge.textContent = relLabel;
      li.appendChild(badge);
    }
    li.appendChild(document.createTextNode(String(rel.prose ?? "")));
    ul.appendChild(li);
  }
  section.appendChild(ul);
  return section;
}

function renderReferences(references: Array<Record<string, unknown>>) {
  if (!references?.length) return null;
  const section = document.createElement("section");
  section.appendChild(sectionHeader("People mentioned"));
  const wrapper = document.createElement("div");
  wrapper.className = "space-y-3";
  for (const ref of references) {
    const div = document.createElement("div");
    div.className = "text-sm";
    const name = String(ref.referenced_name ?? "").trim();
    if (name) {
      const nameEl = document.createElement("span");
      nameEl.className = "font-medium text-slate-200";
      nameEl.textContent = name;
      div.appendChild(nameEl);
    }
    if (ref.ref_type) {
      const typeEl = document.createElement("span");
      typeEl.className = "ml-2 text-xs font-mono text-slate-500";
      typeEl.textContent = String(ref.ref_type).replace(/_/g, " ");
      div.appendChild(typeEl);
    }
    if (ref.context) {
      const ctx = document.createElement("p");
      ctx.className = "text-slate-400 mt-0.5 leading-relaxed";
      ctx.textContent = String(ref.context);
      div.appendChild(ctx);
    }
    wrapper.appendChild(div);
  }
  section.appendChild(wrapper);
  return section;
}

/** Render a full source view into the content container. */
export function renderSourceView(
  contentEl: HTMLElement,
  view: {
    source: {
      session_date?: string | null;
      session_type: string;
      students_raw?: string[];
      organization?: string;
      instructors_raw?: string[];
      title?: string | null;
      created_at?: string;
    };
    attributions?: Array<Record<string, unknown>>;
    definitions?: Array<Record<string, unknown>>;
    drill_purposes?: Array<Record<string, unknown>>;
    technique_requirements?: Array<Record<string, unknown>>;
    relations?: Array<Record<string, unknown>>;
    references?: Array<Record<string, unknown>>;
  }
) {
  const source = view.source;
  const displayTitle = buildDisplayTitle(source);
  if (displayTitle) {
    document.title = displayTitle + " — Kaiano Levine";
    const h1 = document.querySelector("h1");
    if (h1) h1.textContent = displayTitle;
  }

  const existingSub = document.querySelector("header p");
  if (existingSub) existingSub.remove();

  const sections = [
    renderAttributions(view.attributions ?? []),
    renderDefinitions(view.definitions ?? []),
    renderSkillCards("Drills", view.drill_purposes ?? []),
    renderSkillCards("Technique requirements", view.technique_requirements ?? []),
    renderRelations(view.relations ?? []),
    renderReferences(view.references ?? []),
  ];
  for (const section of sections) {
    if (section) contentEl.appendChild(section);
  }

  if (source.created_at) {
    const footer = document.createElement("div");
    footer.className = "border-t border-white/8 pt-4 text-xs text-slate-600";
    footer.textContent = "Added " + formatDate(source.created_at);
    contentEl.appendChild(footer);
  }
}
