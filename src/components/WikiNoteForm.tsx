/** @jsxImportSource preact */
import { useState } from "preact/hooks";
import { getSessionToken, handleDenial } from "../lib/session";

// A note written from a wiki page (MINI-98). It goes through the same
// pipeline as a note dropped in Drive as "<date> <instructor> > Note -
// <title>": the API puts it on transcription-cog's queue, the extraction
// reads it with the note prompt, and it is stored as a correction source,
// which the wiki then links, consolidates and generates from. Newest wins, so
// a note can correct a page, deny a link, say two names are one thing (or
// not), or give a thin entity context.
//
// Unlike Operations, this costs money: one model call to extract the note,
// then the wiki's paid passes for the pages it touches. The form says so and
// asks before sending. Nothing changes on the page until those have run.

type Props = { apiBase: string };

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; summary: string }
  | { kind: "error"; message: string };

const INPUT_CLASS =
  "w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-accent/50 transition-colors";
const BTN_CLASS =
  "rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-sm text-slate-200 transition-colors hover:border-accent hover:text-accent disabled:opacity-50 disabled:hover:border-white/15 disabled:hover:text-slate-200";

/** Today as YYYY-MM-DD, in the browser's time zone. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The same floor transcription-cog applies to a note (MIN_NOTE_CHARS). */
const MIN_CHARS = 20;
/** The API's limit on a note's text. */
const MAX_CHARS = 20_000;

export default function WikiNoteForm({ apiBase }: Props) {
  const slug =
    typeof location !== "undefined" ? (new URLSearchParams(location.search).get("slug") ?? "") : "";
  const [date, setDate] = useState(today());
  const [instructor, setInstructor] = useState("Kaiano");
  const [title, setTitle] = useState(slug.replace(/-/g, " "));
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  if (!slug) return null;

  const length = text.trim().length;
  const problem =
    !instructor.trim() || /[>+]/.test(instructor)
      ? "Name one instructor (no “>” or “+”)."
      : length < MIN_CHARS
        ? `Write at least ${MIN_CHARS} characters.`
        : length > MAX_CHARS
          ? `Keep it under ${MAX_CHARS.toLocaleString()} characters.`
          : null;

  const send = async (e: Event) => {
    e.preventDefault();
    if (!apiBase || problem) return;
    const ok = window.confirm(
      "Send this note? It costs money: one model call to extract it, then the wiki's paid " +
        "passes for the pages it touches. It is stored as a private correction.",
    );
    if (!ok) return;
    setState({ kind: "sending" });
    try {
      const token = (await getSessionToken()) || "";
      if (!token) {
        setState({ kind: "error", message: "Sign in to send this." });
        return;
      }
      const res = await fetch(`${apiBase.replace(/\/$/, "")}/v1/wcs/wiki/admin/notes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          instructor: instructor.trim(),
          title: title.trim(),
          text: text.trim(),
        }),
      });
      if (res.status === 401 || res.status === 403) {
        handleDenial(res.status);
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = json?.error?.message || json?.detail?.message || `HTTP ${res.status}`;
        setState({ kind: "error", message: `Not sent: ${detail}` });
        return;
      }
      const data = json?.data ?? {};
      setState({
        kind: "sent",
        summary: data.deduplicated
          ? "Already sent a moment ago; this one was not queued again."
          : data.summary || "Queued.",
      });
      setText("");
    } catch {
      setState({ kind: "error", message: "Not sent: the API could not be reached." });
    }
  };

  const busy = state.kind === "sending";

  return (
    <section class="rounded-lg border border-white/8 bg-surface/40 px-4 py-3 space-y-3">
      <h2 class="text-xs font-mono uppercase tracking-widest text-slate-500">
        Add a note
        <span class="ml-2 normal-case tracking-normal text-amber-300/80">
          paid · one extraction, then the wiki's passes
        </span>
      </h2>
      <p class="text-xs text-slate-500 leading-relaxed">
        A correction, a denied link, two names for one thing (or two things under one name), or
        context for something thin. It goes through the same pipeline as a note in Drive, is stored
        as a private correction, and the newest statement wins. The page changes once the extraction
        and the wiki's passes have run.
      </p>
      <form class="space-y-3" onSubmit={send}>
        <div class="grid gap-3 sm:grid-cols-[10rem_12rem_1fr]">
          <label class="space-y-1">
            <span class="block text-xs font-mono text-slate-500">Date</span>
            <input
              type="date"
              class={INPUT_CLASS}
              value={date}
              required
              onInput={(e) => setDate((e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="space-y-1">
            <span class="block text-xs font-mono text-slate-500">Instructor</span>
            <input
              type="text"
              class={INPUT_CLASS}
              value={instructor}
              required
              onInput={(e) => setInstructor((e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="space-y-1">
            <span class="block text-xs font-mono text-slate-500">Title</span>
            <input
              type="text"
              class={INPUT_CLASS}
              value={title}
              maxLength={200}
              onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            />
          </label>
        </div>
        <label class="block space-y-1">
          <span class="block text-xs font-mono text-slate-500">Note</span>
          <textarea
            class={`${INPUT_CLASS} min-h-[8rem]`}
            value={text}
            placeholder="e.g. A right side pass with the arm raised is the underarm turn; “right side pass” alone is the low pattern."
            onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          />
        </label>
        <div class="flex flex-wrap items-center gap-3">
          <button type="submit" class={BTN_CLASS} disabled={busy || !!problem}>
            {busy ? "Sending…" : "Send note"}
          </button>
          {state.kind === "sent" ? (
            <span class="text-sm text-emerald-400">{state.summary}</span>
          ) : state.kind === "error" ? (
            <span class="text-sm text-rose-400">{state.message}</span>
          ) : problem && length > 0 ? (
            <span class="text-xs text-slate-500">{problem}</span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
