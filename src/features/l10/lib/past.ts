// Ask Bubbles only (not copied from the Leadership Hub): the DM L10's "Past meetings" list. See src/features/l10/README.md.
import { solvedIssues, type RecapRow } from "./types";

/**
 * A meeting held before the DM L10 moved to the Hub, kept in the meeting document as `meetingHistory` (written by the
 * one-time Bloom Growth import; the Hub keeps unknown fields, so it survives every save).
 */
export interface ImportedMeeting {
  id: string;
  source: "bloom-growth";
  /** When it started and ended (ISO). */
  startedAt: string;
  endedAt: string | null;
  attendees: { name: string; rating: number | null }[];
  issuesSolvedCount: number;
  /** Added by the Bloom enrichment (15 Nov 2026); absent on rows imported before it. */
  solvedIssues?: { title: string; owner: string }[];
  todos?: { text: string; owner: string; dueDate: string | null }[];
  notes?: string;
}

/** One row of the Past meetings list, from either a recap (ended in Ask Bubbles or the Hub) or the Bloom import. */
export interface PastMeeting {
  key: string;
  source: "l10" | "bloom-growth";
  /** When it was held (ISO): the recap's held_at, or the Bloom start time. */
  heldAt: string;
  durationSeconds: number | null;
  ratingAvg: number | null;
  /** Everyone listed for the meeting with their rating; null = did not rate. */
  attendees: { name: string; rating: number | null }[];
  issuesSolved: number;
  /** Solved issue titles, when known (recaps list them; the Bloom import only has the count). */
  solvedTitles: string[];
  /** The same issues with their owners (null when the recap does not say: plain titles, auto-saved and older recaps). */
  solvedIssues: { title: string; owner: string | null }[];
  /** Share of the meeting's to-dos done when it ended (0–100), or null when the recap does not say. */
  todosCompletedPct: number | null;
  /** The cascading message, when there was one. */
  cascade: string | null;
  /** The meeting's shared notes, when the recap has them (the Hub's 20261205120000_l10_recap_notes). */
  notes: string | null;
  /** The to-dos still open when it ended (recaps), or the meeting's to-dos (a Bloom row that carries them). */
  openTodos: { text: string; owner: string; due: string }[];
  /**
   * Whether the record says anything about these at all. Recaps always do. A Bloom row imported before the enrichment
   * (15 Nov 2026) has no to-dos, solved issues or notes: the summary says "Not recorded" rather than "none".
   */
  recorded: { todos: boolean; issues: boolean; notes: boolean };
}

/** "To-dos completed": done / total as a whole percent, or null when the recap has no counts (or none to do). */
export function todosCompletedPct(r: Pick<RecapRow, "todos_done" | "todos_total">): number | null {
  const done = r.todos_done, total = r.todos_total;
  return typeof done === "number" && typeof total === "number" && total > 0 && done >= 0 ? Math.round((Math.min(done, total) / total) * 100) : null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** The Bloom meetings stored in the document; anything malformed is skipped rather than shown wrong. */
export function importedMeetings(doc: Record<string, unknown>): ImportedMeeting[] {
  const raw = doc.meetingHistory;
  if (!Array.isArray(raw)) return [];
  const out: ImportedMeeting[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const r = m as Record<string, unknown>;
    const startedAt = str(r.startedAt);
    if (!startedAt || Number.isNaN(Date.parse(startedAt)) || typeof r.id !== "string") continue;
    const endedAt = str(r.endedAt);
    const attendees = Array.isArray(r.attendees)
      ? (r.attendees as unknown[]).flatMap((a) => {
          const o = a as Record<string, unknown> | null;
          return o && typeof o.name === "string" ? [{ name: o.name, rating: num(o.rating) }] : [];
        })
      : [];
    const row: ImportedMeeting = { id: r.id, source: "bloom-growth", startedAt, endedAt: endedAt && !Number.isNaN(Date.parse(endedAt)) ? endedAt : null, attendees, issuesSolvedCount: num(r.issuesSolvedCount) ?? 0 };
    // The optional fields the Bloom enrichment adds; each is read only when it is the right shape.
    if (Array.isArray(r.solvedIssues)) {
      row.solvedIssues = (r.solvedIssues as unknown[]).flatMap((i) => {
        const o = i as Record<string, unknown> | null;
        return o && typeof o.title === "string" ? [{ title: o.title, owner: typeof o.owner === "string" ? o.owner : "" }] : [];
      });
    }
    if (Array.isArray(r.todos)) {
      row.todos = (r.todos as unknown[]).flatMap((t) => {
        const o = t as Record<string, unknown> | null;
        return o && typeof o.text === "string" ? [{ text: o.text, owner: typeof o.owner === "string" ? o.owner : "", dueDate: str(o.dueDate) }] : [];
      });
    }
    if (typeof r.notes === "string") row.notes = r.notes;
    out.push(row);
  }
  return out;
}

function average(ratings: (number | null)[]): number | null {
  const given = ratings.filter((r): r is number => r !== null);
  return given.length ? Math.round((given.reduce((s, r) => s + r, 0) / given.length) * 10) / 10 : null;
}

/** One recap as a past meeting (everything it records). */
export function recapToPast(r: RecapRow): PastMeeting {
  return {
    key: `recap-${r.id}`,
    source: "l10",
    heldAt: r.held_at,
    durationSeconds: r.duration_seconds || null,
    ratingAvg: r.rating_avg ?? average((r.attendees ?? []).map((a) => a.rating)),
    attendees: r.attendees ?? [],
    issuesSolved: solvedIssues(r.resolved_issues).length,
    // Plain titles and { title, owner } (the Hub's newer recaps); anything else is skipped.
    solvedTitles: solvedIssues(r.resolved_issues).map((s) => s.title),
    solvedIssues: solvedIssues(r.resolved_issues),
    todosCompletedPct: todosCompletedPct(r),
    cascade: str(r.cascade),
    notes: str(r.notes),
    openTodos: (r.open_todos ?? []).flatMap((t) => (t && typeof t.text === "string" ? [{ text: t.text, owner: typeof t.owner === "string" ? t.owner : "", due: str(t.dueDate) ?? str(t.due) ?? "" }] : [])),
    recorded: { todos: true, issues: true, notes: true },
  };
}

/** Recaps and imported Bloom meetings together, newest first. Deleted recaps are left out. */
export function pastMeetings(recaps: RecapRow[], doc: Record<string, unknown>): PastMeeting[] {
  const fromRecaps: PastMeeting[] = recaps.filter((r) => !r.deleted_at).map(recapToPast);
  const fromBloom: PastMeeting[] = importedMeetings(doc).map((m) => ({
    key: m.id,
    source: "bloom-growth",
    heldAt: m.startedAt,
    durationSeconds: m.endedAt ? Math.max(0, Math.round((Date.parse(m.endedAt) - Date.parse(m.startedAt)) / 1000)) : null,
    ratingAvg: average(m.attendees.map((a) => a.rating)),
    attendees: m.attendees,
    issuesSolved: Math.max(m.issuesSolvedCount, m.solvedIssues?.length ?? 0),
    solvedTitles: (m.solvedIssues ?? []).map((i) => i.title),
    solvedIssues: m.solvedIssues ?? [],
    todosCompletedPct: null,
    cascade: null,
    notes: str(m.notes),
    openTodos: (m.todos ?? []).map((t) => ({ text: t.text, owner: t.owner, due: t.dueDate ?? "" })),
    recorded: { todos: m.todos !== undefined, issues: m.solvedIssues !== undefined, notes: m.notes !== undefined },
  }));
  return [...fromRecaps, ...fromBloom].sort((a, b) => Date.parse(b.heldAt) - Date.parse(a.heldAt));
}
