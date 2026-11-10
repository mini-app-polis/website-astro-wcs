/** @jsxImportSource preact */
import { useEffect, useState } from "preact/hooks";
import { getSessionToken } from "../lib/session";
import { driveFileUrl } from "../lib/url";
import {
  type Approvals,
  type ReconcileDifference,
  type Review,
  type Side,
  KINDS,
  approvalsBody,
  byKind,
  changed,
  covers,
  fileCanWin,
  fileName,
  idleKinds,
  kindLabel,
  kindSide,
  shown,
  sideLabel,
  sideOf,
  withFileSide,
  withKindSide,
} from "../lib/reconcile";

// The owner's reconcile review (deejay-cog ADR-0008, step 3): every open
// difference between a library file and its catalog entry, as the hourly
// reconcile last reported it, grouped by kind. The owner approves whole
// kinds, or "other" differences one file and field at a time, for one side
// or the other, and saves. The next write run settles each approved
// difference: catalog wins, its value is written over the file; file wins,
// the file's value goes up to the catalog and the file is not written
// (approved fill-ups go up to the catalog too). Either way the two then
// match. Nothing here writes music. Reading
// and saving need catalog.tracks.write: the API decides, and a refusal is
// what a visitor without it sees.

type Props = { apiBase: string };

const SHOWN = 20;
const BTN =
  "rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-sm text-slate-200 transition-colors hover:border-accent hover:text-accent disabled:opacity-50";

type State =
  | { kind: "loading" }
  | { kind: "refused"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "ready" };

function Line({ d, children }: { d: ReconcileDifference; children?: preact.ComponentChildren }) {
  return (
    <li class="flex items-start gap-3 text-xs">
      {children}
      <div class="min-w-0">
        <p class="truncate font-mono text-slate-200" title={d.path}>
          <a href={driveFileUrl(d.drive_file_id)} class="hover:underline" target="_blank" rel="noopener noreferrer">
            {fileName(d.path)}
          </a>
        </p>
        <p class="text-slate-400">
          {d.field}: <span class="text-slate-300">{shown(d.file_value)}</span> →{" "}
          <span class="text-emerald-300">{shown(d.catalog_value)}</span>
        </p>
      </div>
    </li>
  );
}

const SIDE_BTN = "px-3 py-1 text-xs transition-colors first:rounded-l-full last:rounded-r-full";

/** Not decided, catalog wins, or file wins: one choice, as a segmented control. */
function SideChoice({
  value,
  fileAllowed,
  label,
  onChange,
}: {
  value: Side | null;
  fileAllowed: boolean;
  label: string;
  onChange: (side: Side | null) => void;
}) {
  const options: (Side | null)[] = [null, "catalog", "file"];
  return (
    <div role="radiogroup" aria-label={label} class="inline-flex shrink-0 overflow-hidden rounded-full border border-white/15">
      {options.map((side) => {
        const on = side === value;
        // The file's side is shown but not offered where the file has nothing
        // to send up, so every row's choices line up.
        const off = side === "file" && !fileAllowed;
        const tone = off
          ? "cursor-not-allowed text-slate-600"
          : !on
          ? "text-slate-400 hover:text-slate-200"
          : side === "file"
            ? "bg-sky-500/20 text-sky-200"
            : side === "catalog"
              ? "bg-emerald-500/20 text-emerald-200"
              : "bg-white/10 text-slate-200";
        return (
          <button
            type="button"
            role="radio"
            aria-checked={on}
            disabled={off}
            title={off ? "The file has nothing here to send up to the catalog." : undefined}
            class={`${SIDE_BTN} ${tone}`}
            onClick={() => onChange(side)}
          >
            {sideLabel(side)}
          </button>
        );
      })}
    </div>
  );
}

function KindSection({
  kind,
  diffs,
  draft,
  setDraft,
}: {
  kind: string;
  diffs: ReconcileDifference[];
  draft: Approvals;
  setDraft: (a: Approvals) => void;
}) {
  const [all, setAll] = useState(false);
  const meta = KINDS.find((k) => k.kind === kind);
  const isOther = kind === "other";
  const side = kindSide(draft, kind);
  const list = all ? diffs : diffs.slice(0, SHOWN);
  const files = new Set(diffs.map((d) => d.drive_file_id)).size;
  return (
    <li class="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-slate-100">
            {kindLabel(kind)}{" "}
            <span class="font-mono text-xs text-slate-500">
              {diffs.length} in {files} {files === 1 ? "file" : "files"}
            </span>
          </h2>
          {meta && <p class="text-xs text-slate-400">{meta.means}</p>}
        </div>
        {!isOther && (
          <SideChoice
            value={side}
            fileAllowed={fileCanWin(kind)}
            label={`Approve ${kindLabel(kind)}`}
            onChange={(next) => setDraft(withKindSide(draft, kind, next))}
          />
        )}
      </div>
      <ul class="space-y-2">
        {list.map((d) =>
          isOther ? (
            <Line d={d}>
              <SideChoice
                value={sideOf(draft, d)}
                fileAllowed={fileCanWin(d.kind, d.field)}
                label={`Approve ${d.field} of ${fileName(d.path)}`}
                onChange={(next) => setDraft(withFileSide(draft, d.drive_file_id, d.field, next))}
              />
            </Line>
          ) : (
            <Line d={d} />
          ),
        )}
      </ul>
      {diffs.length > SHOWN && (
        <button class={BTN} onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${diffs.length}`}
        </button>
      )}
    </li>
  );
}

export default function CatalogReconcile({ apiBase }: Props) {
  const base = apiBase.replace(/\/$/, "");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [review, setReview] = useState<Review | null>(null);
  const [draft, setDraft] = useState<Approvals>({ kinds: [], files: {} });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function authed(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await getSessionToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${base}${path}`, { ...init, headers });
  }

  async function load() {
    const res = await authed("/v1/catalog/library/reconcile");
    if (res.status === 401 || res.status === 403) {
      setState({
        kind: "refused",
        message: `The API refused (${res.status}): the reconcile review needs catalog.tracks.write.`,
      });
      return;
    }
    if (!res.ok) {
      setState({ kind: "failed", message: `The API answered ${res.status}.` });
      return;
    }
    const data: Review = (await res.json()).data;
    setReview(data);
    setDraft(data.approvals);
    setState({ kind: "ready" });
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setBusy(true);
    setMessage("");
    let res: Response;
    try {
      res = await authed("/v1/catalog/library/reconcile/approvals", {
        method: "PUT",
        body: JSON.stringify(approvalsBody(draft)),
      });
    } catch {
      setMessage("The API could not be reached: nothing was saved.");
      return;
    } finally {
      setBusy(false);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setMessage(body?.error?.message ?? `The API answered ${res.status}: nothing was saved.`);
      return;
    }
    await load();
    setMessage("Saved. The next hourly reconcile settles what is approved, for the side chosen.");
  }

  if (state.kind === "loading") return <p class="text-sm text-slate-500">Loading…</p>;
  if (state.kind !== "ready") return <p class="text-sm text-slate-400">{state.message}</p>;
  if (!review) return null;

  const groups = byKind(review.differences);
  const idle = idleKinds(draft, review.differences);
  const dirty = changed(review.approvals, draft);
  const pending = review.differences.filter((d) => covers(draft, d)).length;
  const files = new Set(review.differences.map((d) => d.drive_file_id)).size;
  const saved = review.approvals.updated_at
    ? `Approvals last saved ${new Date(review.approvals.updated_at).toLocaleString()}${review.approvals.updated_by ? ` by ${review.approvals.updated_by}` : ""}.`
    : "No approvals are saved yet: write runs write nothing.";

  return (
    <div class="space-y-6">
      <div class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/90 p-3 backdrop-blur">
        <p class="text-sm text-slate-300">
          {review.differences.length} open {review.differences.length === 1 ? "difference" : "differences"} in {files}{" "}
          {files === 1 ? "file" : "files"}; {pending} approved.
          <span class="block text-xs text-slate-500">{saved}</span>
        </p>
        <div class="flex items-center gap-3">
          {dirty && <span class="text-xs text-amber-300">Unsaved changes</span>}
          <button class={BTN} disabled={!dirty || busy} onClick={() => setDraft(review.approvals)}>
            Undo
          </button>
          <button class={BTN} disabled={!dirty || busy} onClick={save}>
            {busy ? "Saving…" : "Save approvals"}
          </button>
        </div>
      </div>
      {message && <p class="text-sm text-emerald-300">{message}</p>}
      {groups.length === 0 && <p class="text-sm text-slate-400">No open differences: the library matches the catalog.</p>}
      <ul class="space-y-4">
        {groups.map((g) => (
          <KindSection key={g.kind} kind={g.kind} diffs={g.diffs} draft={draft} setDraft={setDraft} />
        ))}
      </ul>
      {idle.length > 0 && (
        <div class="space-y-2 rounded-lg border border-white/10 p-4">
          <p class="text-sm text-slate-300">Also approved, with nothing open now:</p>
          {idle.map((kind) => (
            <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
              {kindLabel(kind)}
              <SideChoice
                value={kindSide(draft, kind)}
                fileAllowed={fileCanWin(kind)}
                label={`Approve ${kindLabel(kind)}`}
                onChange={(next) => setDraft(withKindSide(draft, kind, next))}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
