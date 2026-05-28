/**
 * Client-side renderer for WCS source detail pages (/notes/[id] and /notes/admin/[id]).
 *
 * This file is served as a static asset from /wcs-source-detail.js. It is NOT processed
 * by Astro/Vite. Do not add bare imports here. Keep it pure ES2020 browser JS.
 *
 * Mount contract: the page must contain
 *   <div data-notes-browser
 *        data-session-token="..."
 *        data-source-id="..."
 *        data-mode="public" | "admin"></div>
 * plus #note-loading, #note-error, #note-content elements.
 *
 * The page's <html> element must carry data-api-url="https://api...".
 */
(() => {
  const SESSION_LABELS = {
    private_lesson: "Private lesson",
    group_class: "Group class",
    workshop: "Workshop",
    other: "Other",
  };

  const ATTRIBUTION_KIND_LABELS = {
    taught: "Taught",
    demonstrated: "Demonstrated",
    drilled: "Drilled",
  };

  function formatDate(iso) {
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

  function sectionHeader(label) {
    const h = document.createElement("h2");
    h.className =
      "mb-3 text-xs font-mono uppercase tracking-widest text-slate-500";
    h.textContent = label;
    return h;
  }

  function kindLabel(kind) {
    if (!kind || kind === "taught") return null;
    return (
      ATTRIBUTION_KIND_LABELS[kind] ||
      kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    );
  }

  function sourceInstructors(source) {
    return source.instructors_raw && source.instructors_raw.length
      ? source.instructors_raw.join(" + ")
      : "";
  }

  function sourceWith(source) {
    if (source.session_type === "private_lesson") {
      return source.students_raw && source.students_raw.length
        ? source.students_raw.join(" + ")
        : "";
    }
    return source.organization || "";
  }

  function buildDisplayTitle(source) {
    const parts = [];
    if (source.session_date) parts.push(formatDate(source.session_date));
    parts.push(SESSION_LABELS[source.session_type] || source.session_type);
    const withVal = sourceWith(source);
    if (withVal) parts.push(withVal);
    const instructors = sourceInstructors(source);
    if (instructors && source.session_type !== "private_lesson") {
      parts.push(instructors);
    }
    if (source.title && source.title.trim()) parts.push(source.title.trim());
    return parts.join(" · ");
  }

  function appendSubDetail(parent, label, text) {
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

  function renderAttributions(attributions) {
    if (!attributions || !attributions.length) return null;
    const section = document.createElement("section");
    section.appendChild(sectionHeader("Teaching"));
    const wrapper = document.createElement("div");
    wrapper.className = "space-y-4";

    const sorted = [...attributions].sort(
      (a, b) => Number(a.position || 0) - Number(b.position || 0)
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

      const label = kindLabel(String(attr.attribution_kind || ""));
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

  function renderDefinitions(definitions) {
    if (!definitions || !definitions.length) return null;
    const section = document.createElement("section");
    section.appendChild(sectionHeader("Definitions"));
    const dl = document.createElement("dl");
    dl.className = "space-y-3";
    const sorted = [...definitions].sort(
      (a, b) => Number(a.position || 0) - Number(b.position || 0)
    );
    for (const item of sorted) {
      const div = document.createElement("div");
      const dt = document.createElement("dt");
      dt.className = "text-sm font-medium text-slate-200";
      dt.textContent = String(item.term || "");
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

  function renderSkillCards(label, items) {
    if (!items || !items.length) return null;
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

  function renderRelations(relations) {
    if (!relations || !relations.length) return null;
    const section = document.createElement("section");
    section.appendChild(sectionHeader("Relations"));
    const ul = document.createElement("ul");
    ul.className = "space-y-3";
    for (const rel of relations) {
      const li = document.createElement("li");
      li.className = "text-sm text-slate-300";
      const relLabel = kindLabel(String(rel.relation_kind || ""));
      if (relLabel) {
        const badge = document.createElement("span");
        badge.className =
          "inline-block mr-2 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-slate-500";
        badge.textContent = relLabel;
        li.appendChild(badge);
      }
      li.appendChild(document.createTextNode(String(rel.prose || "")));
      ul.appendChild(li);
    }
    section.appendChild(ul);
    return section;
  }

  function renderReferences(references) {
    if (!references || !references.length) return null;
    const section = document.createElement("section");
    section.appendChild(sectionHeader("People mentioned"));
    const wrapper = document.createElement("div");
    wrapper.className = "space-y-3";
    for (const ref of references) {
      const div = document.createElement("div");
      div.className = "text-sm";
      const name = String(ref.referenced_name || "").trim();
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

  function renderSourceView(contentEl, view) {
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
      renderAttributions(view.attributions || []),
      renderDefinitions(view.definitions || []),
      renderSkillCards("Drills", view.drill_purposes || []),
      renderSkillCards("Technique requirements", view.technique_requirements || []),
      renderRelations(view.relations || []),
      renderReferences(view.references || []),
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

  // ---- bootstrap ----

  function show(el) { if (el) el.classList.remove("hidden"); }
  function hide(el) { if (el) el.classList.add("hidden"); }

  function bootstrap() {
    const root = document.querySelector("[data-notes-browser]");
    if (!root) return;

    const BASE = document.documentElement.dataset.apiUrl || "";
    const SESSION_TOKEN = root.dataset.sessionToken || "";
    const id = root.dataset.sourceId || "";
    const mode = root.dataset.mode || "public"; // "public" | "admin"

    const loadingEl = document.getElementById("note-loading");
    const errorEl = document.getElementById("note-error");
    const contentEl = document.getElementById("note-content");

    if (!BASE || !id || !contentEl) {
      hide(loadingEl);
      show(errorEl);
      return;
    }

    const path =
      mode === "admin"
        ? `/v1/wcs/wiki/admin/sources/${id}`
        : `/v1/wcs/wiki/sources/${id}`;

    fetch(`${BASE.replace(/\/$/, "")}${path}`, {
      headers: SESSION_TOKEN
        ? { Authorization: `Bearer ${SESSION_TOKEN}` }
        : {},
    })
      .then((res) => {
        if (res.status === 403) {
          if (errorEl) errorEl.textContent = "Admin access required.";
          throw new Error("forbidden");
        }
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((json) => {
        const view = json && json.data;
        if (!view || !view.source) throw new Error("no data");
        hide(loadingEl);
        renderSourceView(contentEl, view);
        show(contentEl);
      })
      .catch(() => {
        hide(loadingEl);
        show(errorEl);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
