/** @jsxImportSource preact */
import { useEffect, useState } from "preact/hooks";
import { getSessionToken } from "../lib/session";
import { driveFileUrl } from "../lib/url";
import {
  type Choices,
  type DuplicateFile,
  type DuplicateGroup,
  type Outcome,
  allowed,
  differentEditsTrashed,
  initialChoices,
  keptTogether,
  megabytes,
  minutes,
  problems,
  reasonsText,
  resolveBody,
  shownPath,
} from "../lib/duplicates";

// The owner's duplicates page (deejay-cog ADR-0008, decision 7, and ADR-0007
// amended 2026-11-11: one entry may keep several files): each group of
// library files on one song, as deejay-cog's nightly report found them. The
// owner decides each file: keep it on the entry, give it a version entry of
// its own, or send it to Drive's trash, which the next nightly run moves it
// to. A file marked as a different edit defaults to its own version, and
// trashing one takes a separate, deliberate confirmation. No choice that
// leaves the entry with no file in the library is offered. Listing and
// resolving need catalog.tracks.write: the API decides, and a refusal is
// what a visitor without it sees.

type Props = { apiBase: string };

const PAGE = 50;
const BTN =
  "rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-sm text-slate-200 transition-colors hover:border-accent hover:text-accent disabled:opacity-50";
const DANGER =
  "rounded-full border border-red-400/40 bg-red-400/10 px-4 py-1.5 text-sm text-red-200 transition-colors hover:border-red-300 disabled:opacity-50";

type State =
  | { kind: "loading" }
  | { kind: "refused"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "ready" };

function FileLine({ f }: { f: DuplicateFile }) {
  return (
    <div class="min-w-0">
      <p class="truncate font-mono text-xs text-slate-200" title={shownPath(f)}>
        <a href={driveFileUrl(f.drive_file_id)} class="hover:underline" target="_blank" rel="noopener noreferrer">
          {shownPath(f)}
        </a>
      </p>
      <p class="text-xs text-slate-400">
        {megabytes(f.size_bytes)} · {minutes(f.duration_secs)}
        {f.bitrate_kbps ? ` · ${f.bitrate_kbps} kbps` : ""}
        {f.edit_label ? ` · ${f.edit_label}` : ""}
        {f.title ? ` · ${f.title} — ${f.artist ?? ""}` : " · not linked to the catalog"}
        {f.play_count != null ? ` · ${f.play_count} plays` : ""}
      </p>
    </div>
  );
}

const OUTCOME_TEXT: Record<Outcome, string> = {
  keep: "Keep on the entry",
  own_version: "Own version",
  trash: "Trash",
};

function Group({
  group,
  resolve,
}: {
  group: DuplicateGroup;
  resolve: (group: DuplicateGroup, choices: Choices, confirmDifferentEdit: boolean) => Promise<string | null>;
}) {
  const [choices, setChoices] = useState<Choices>(() => initialChoices(group));
  const [differentEditOk, setDifferentEditOk] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wrong = problems(group, choices);
  const editsTrashed = differentEditsTrashed(group, choices);
  const ready = wrong.length === 0 && (editsTrashed.length === 0 || differentEditOk);

  function choose(id: string, outcome: Outcome) {
    setChoices((before) => ({ ...before, [id]: { ...before[id], outcome } }));
    setDifferentEditOk(false);
  }

  function version(id: string, text: string) {
    setChoices((before) => ({ ...before, [id]: { ...before[id], version: text } }));
  }

  async function confirm() {
    setBusy(true);
    setError("");
    const problem = await resolve(group, choices, editsTrashed.length > 0 && differentEditOk);
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <li class="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <p class="text-xs font-mono uppercase tracking-wide text-slate-500">
        {group.files.length} files · {reasonsText(group.reasons)}
      </p>
      <fieldset class="space-y-3" disabled={busy || confirming}>
        <legend class="sr-only">What happens to each file</legend>
        {group.files.map((f) => {
          const c = choices[f.drive_file_id];
          return (
            <div class="space-y-1">
              <FileLine f={f} />
              {f.kept_on_purpose && <p class="text-xs text-amber-300/80">Different edit: {f.why_kept}</p>}
              <div class="flex flex-wrap items-center gap-4 text-sm text-slate-300">
                {(["keep", "own_version", "trash"] as Outcome[]).map((o) => (
                  <label class="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`outcome-${group.id}-${f.drive_file_id}`}
                      checked={c.outcome === o}
                      disabled={!allowed(group, choices, f.drive_file_id, o)}
                      onChange={() => choose(f.drive_file_id, o)}
                    />
                    {OUTCOME_TEXT[o]}
                  </label>
                ))}
                {c.outcome === "own_version" && (
                  <input
                    type="text"
                    class="rounded border border-white/15 bg-transparent px-2 py-0.5 text-sm"
                    placeholder="Version (e.g. Radio Edit)"
                    value={c.version}
                    onInput={(e) => version(f.drive_file_id, (e.target as HTMLInputElement).value)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </fieldset>
      {editsTrashed.length > 0 && !confirming && (
        <label class="flex items-start gap-2 rounded-md border border-red-400/30 bg-red-400/5 p-3 text-sm text-red-200">
          <input
            type="checkbox"
            class="mt-1"
            checked={differentEditOk}
            onChange={(e) => setDifferentEditOk((e.target as HTMLInputElement).checked)}
          />
          <span>
            Yes, send {editsTrashed.length === 1 ? "this different edit" : "these different edits"} to the
            trash:{" "}
            <span class="font-mono text-xs">{editsTrashed.map((f) => shownPath(f)).join(", ")}</span>
          </span>
        </label>
      )}
      {wrong.length > 0 && <p class="text-xs text-slate-400">{wrong[0]}</p>}
      {!confirming && (
        <button class={BTN} disabled={!ready} onClick={() => setConfirming(true)}>
          {keptTogether(group, choices) ? "Keep these files together…" : "Resolve…"}
        </button>
      )}
      {confirming && ready && (
        <div class="space-y-2 rounded-md border border-white/15 bg-white/[0.03] p-3 text-sm">
          <ul class="space-y-1 text-slate-200">
            {group.files.map((f) => {
              const c = choices[f.drive_file_id];
              return (
                <li>
                  <span class="font-mono text-xs">{shownPath(f)}</span>:{" "}
                  {c.outcome === "own_version" ? `own version "${c.version.trim()}"` : OUTCOME_TEXT[c.outcome].toLowerCase()}
                </li>
              );
            })}
          </ul>
          <p class="text-xs text-slate-400">
            The entries of the files kept and trashed merge into one; trashed files go to Drive's trash on
            the next nightly run.
          </p>
          <div class="flex flex-wrap gap-3">
            <button class={editsTrashed.length ? DANGER : BTN} disabled={busy} onClick={confirm}>
              {busy ? "Resolving…" : "Confirm"}
            </button>
            <button class={BTN} disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p class="text-sm text-red-300">{error}</p>}
    </li>
  );
}

export default function CatalogDuplicates({ apiBase }: Props) {
  const base = apiBase.replace(/\/$/, "");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState<string[]>([]);

  async function authed(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await getSessionToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${base}${path}`, { ...init, headers });
  }

  async function load(offset: number) {
    const res = await authed(`/v1/catalog/library/duplicates?limit=${PAGE}&offset=${offset}`);
    if (res.status === 401 || res.status === 403) {
      setState({
        kind: "refused",
        message: `The API refused (${res.status}): the duplicates page needs catalog.tracks.write.`,
      });
      return;
    }
    if (!res.ok) {
      setState({ kind: "failed", message: `The API answered ${res.status}.` });
      return;
    }
    const body = await res.json();
    setGroups((before) => (offset === 0 ? body.data : [...before, ...body.data]));
    setTotal(body.meta?.total ?? body.data.length);
    setState({ kind: "ready" });
  }

  useEffect(() => {
    load(0);
  }, []);

  async function resolve(
    group: DuplicateGroup,
    choices: Choices,
    confirmDifferentEdit: boolean,
  ): Promise<string | null> {
    let body;
    try {
      body = resolveBody(group, choices, confirmDifferentEdit);
    } catch (e) {
      return (e as Error).message;
    }
    const res = await authed(`/v1/catalog/library/duplicates/${group.id}/resolve`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) return `The API refused (${res.status}).`;
    if (!res.ok) {
      const answer = await res.json().catch(() => null);
      return answer?.error?.message ?? `The API answered ${res.status}.`;
    }
    const result = (await res.json()).data;
    const trashed = result.trash_requested.length;
    const versions = Object.keys(result.own_versions ?? {}).length;
    setGroups((before) => before.filter((g) => g.id !== group.id));
    setTotal((t) => Math.max(0, t - 1));
    setDone((before) => [
      result.group.kept_together
        ? `Kept ${group.files.length} files together on one entry.`
        : `Resolved: ${versions} own ${versions === 1 ? "version" : "versions"}, ` +
          `${trashed} ${trashed === 1 ? "file goes" : "files go"} to Drive's trash on the next nightly run.`,
      ...before,
    ]);
    return null;
  }

  if (state.kind === "loading") return <p class="text-sm text-slate-500">Loading…</p>;
  if (state.kind !== "ready") return <p class="text-sm text-slate-400">{state.message}</p>;

  return (
    <div class="space-y-6">
      {done.length > 0 && (
        <ul class="space-y-1 text-sm text-emerald-300">
          {done.map((line) => (
            <li>{line}</li>
          ))}
        </ul>
      )}
      <p class="text-sm text-slate-400">
        {total === 0
          ? "No duplicate groups are open."
          : `${total} open ${total === 1 ? "group" : "groups"}.`}
      </p>
      <ul class="space-y-4">
        {groups.map((g) => (
          <Group key={g.id} group={g} resolve={resolve} />
        ))}
      </ul>
      {groups.length < total && (
        <button class={BTN} onClick={() => load(groups.length)}>
          Show more
        </button>
      )}
    </div>
  );
}
