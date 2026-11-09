/** @jsxImportSource preact */
import { useEffect, useState } from "preact/hooks";
import { getSessionToken } from "../lib/session";
import { driveFileUrl } from "../lib/url";
import {
  type DuplicateFile,
  type DuplicateGroup,
  megabytes,
  minutes,
  plan,
  reasonsText,
  resolveBody,
  split,
} from "../lib/duplicates";

// The owner's duplicates page (deejay-cog ADR-0008, decision 7): each group
// of library files that look like copies of one song, as deejay-cog's nightly
// report found them. The owner picks the copy to keep and confirms; the API
// merges the group's catalog entries and marks the other copies for the
// trash, which the next nightly run moves them to. Files kept on purpose (a
// different edit or release label) are shown apart and never sent to the
// trash. Listing and resolving need catalog.tracks.write: the API decides,
// and a refusal is what a visitor without it sees.

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
      <p class="truncate font-mono text-xs text-slate-200" title={f.path ?? f.drive_file_id}>
        <a href={driveFileUrl(f.drive_file_id)} class="hover:underline" target="_blank" rel="noopener noreferrer">
          {f.path ?? f.drive_file_id}
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

function Group({
  group,
  resolve,
}: {
  group: DuplicateGroup;
  resolve: (group: DuplicateGroup, keeper: string) => Promise<string | null>;
}) {
  const { copies, kept } = split(group);
  const [keeper, setKeeper] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chosen = keeper ? plan(group, keeper) : null;

  async function confirm() {
    setBusy(true);
    setError("");
    const problem = await resolve(group, keeper);
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <li class="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <p class="text-xs font-mono uppercase tracking-wide text-slate-500">
        {copies.length} copies · {reasonsText(group.reasons)}
      </p>
      <fieldset class="space-y-2" disabled={busy || confirming}>
        <legend class="sr-only">The copy to keep</legend>
        {copies.map((f) => (
          <label class="flex items-start gap-3">
            <input
              type="radio"
              class="mt-1"
              name={`keep-${group.id}`}
              checked={keeper === f.drive_file_id}
              onChange={() => setKeeper(f.drive_file_id)}
            />
            <FileLine f={f} />
          </label>
        ))}
      </fieldset>
      {kept.length > 0 && (
        <div class="space-y-2 border-t border-white/5 pt-3">
          <p class="text-xs text-slate-500">Kept on purpose, never trashed:</p>
          {kept.map((f) => (
            <div class="pl-7">
              <FileLine f={f} />
              <p class="text-xs text-slate-500">{f.why_kept}</p>
            </div>
          ))}
        </div>
      )}
      {!confirming && (
        <button class={BTN} disabled={!chosen} onClick={() => setConfirming(true)}>
          {chosen ? "Keep this copy…" : "Pick the copy to keep"}
        </button>
      )}
      {confirming && chosen && (
        <div class="space-y-2 rounded-md border border-red-400/30 bg-red-400/5 p-3 text-sm">
          <p class="text-slate-200">
            Keep <span class="font-mono text-xs">{chosen.keep.path}</span>, merge the copies'
            catalog entries into its entry, and send{" "}
            {chosen.trash.length === 1 ? "this copy" : `these ${chosen.trash.length} copies`} to
            Drive's trash on the next nightly run:
          </p>
          <ul class="list-disc pl-5 font-mono text-xs text-slate-300">
            {chosen.trash.map((f) => (
              <li>{f.path ?? f.drive_file_id}</li>
            ))}
          </ul>
          <div class="flex flex-wrap gap-3">
            <button class={DANGER} disabled={busy} onClick={confirm}>
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

  async function resolve(group: DuplicateGroup, keeper: string): Promise<string | null> {
    const res = await authed(`/v1/catalog/library/duplicates/${group.id}/resolve`, {
      method: "POST",
      body: JSON.stringify(resolveBody(group, keeper)),
    });
    if (res.status === 401 || res.status === 403) return `The API refused (${res.status}).`;
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return body?.error?.message ?? `The API answered ${res.status}.`;
    }
    const result = (await res.json()).data;
    const n = result.trash_requested.length;
    setGroups((before) => before.filter((g) => g.id !== group.id));
    setTotal((t) => Math.max(0, t - 1));
    setDone((before) => [
      `Kept ${result.group.files.find((f: DuplicateFile) => f.drive_file_id === keeper)?.path ?? keeper}; ` +
        `${n} ${n === 1 ? "copy goes" : "copies go"} to Drive's trash on the next nightly run.`,
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
