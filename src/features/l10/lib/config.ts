// Copied from the Leadership Hub (src/lib/meetings/config.ts); keep in step with it. See src/features/l10/README.md.
/**
 * Lovable's per-meeting configuration (lib/access.ts), carried over as it was:
 * the meetings and the agenda. (The people in each meeting come from the Hub at request time: see `Roster`.)
 */
export type MeetingKey = "leadership" | "stc-dm" | "bcs-dm" | "bcs-gm" | "maintenance";

export const MEETING_KEYS: readonly MeetingKey[] = ["leadership", "stc-dm", "bcs-dm", "bcs-gm", "maintenance"];

export function isMeetingKey(value: string): value is MeetingKey {
  return (MEETING_KEYS as readonly string[]).includes(value);
}

/*
 * The Hub's meeting catalog (names, teams and descriptions of every meeting) and its picker are not copied: Ask Bubbles
 * opens only the meetings the Hub lists for it, and their names come from the Hub with the meeting.
 */

/**
 * THE PEOPLE SIDE OF A MEETING IS NOT IN THIS REPOSITORY. The Hub's config holds who sits in each meeting (first
 * names, full names, who usually leads it, seat titles). Ask Bubbles' repository is public, so the Hub serves that
 * at request time (the partner API's `meeting` operation) and the page passes it down as a `Roster`.
 */
export interface Roster {
  /** The round-robin, in the Hub's order: first name (the Hub's key), the name shown, and the seat title if any. */
  members: { first: string; name: string; role: string }[];
  /** Who usually leads the meeting (a name shown), or null. */
  leader: string | null;
  /** The Hub's agenda for this meeting (sections, titles, minutes). Absent: this copy's agendaFor. */
  agenda?: AgendaSection[];
  /** The Hub's one-line hint under each section title. Absent: this copy's sectionHintsFor. */
  hints?: Partial<Record<AgendaKey, string>>;
  /** Whether the meeting has the Reference views (Business Plan, Accountability Chart). Absent: this copy's hasReference. */
  reference?: boolean;
}

export const EMPTY_ROSTER: Roster = { members: [], leader: null };

export type AgendaKey = "business-best" | "scorecard" | "rocks" | "headlines" | "todos" | "ids" | "conclude";

export interface AgendaSection {
  key: AgendaKey;
  title: string;
  minutes: number;
}

export const AGENDA: AgendaSection[] = [
  { key: "business-best", title: "Segue · Business Best", minutes: 5 },
  { key: "scorecard", title: "Scorecard", minutes: 5 },
  { key: "rocks", title: "Rock Review", minutes: 5 },
  { key: "headlines", title: "Customer / Employee Headlines", minutes: 5 },
  { key: "todos", title: "To-Do List", minutes: 5 },
  { key: "ids", title: "IDS · Issues", minutes: 60 },
  { key: "conclude", title: "Conclude", minutes: 5 },
];

/**
 * The leadership meeting has no Headlines and no To-Do List; their 10 minutes go to IDS (70), so it is the 90 minutes
 * its cadence says ("Mondays · 90 min").
 *
 * ASK BUBBLES: the Hub's exceptions for the other company's DM meeting (its agenda and segue name) are not copied:
 * this app opens only the Buff City meetings, and the Hub serves each meeting's agenda and hints with the roster
 * (`agendaFromRoster`, `hintsFromRoster`), which win.
 */
/**
 * The meetings without the Reference views (Business Plan, Accountability Chart): the BCS DM L10 (owner, 15 Nov 2026)
 * and the BCS GM L10 (owner, 17 Nov 2026: "remove this in BCS GM L10"; built like the DM L10, without rocks).
 */
export const NO_REFERENCE: readonly string[] = ["bcs-dm", "bcs-gm"];

/**
 * Whether a meeting shows the Reference views. The BCS DM L10 does not (the owner's decision, 15 Nov 2026); the Hub's
 * database also keeps them out of everything it sends for that meeting.
 */
export const hasReference = (key: string): boolean => !NO_REFERENCE.includes(key);

/** Reference views for this page: the Hub's word (served with the roster) when it gives one, and never where this copy says none. */
export const referenceFromRoster = (key: string, roster: Pick<Roster, "reference">): boolean => hasReference(key) && roster.reference !== false;

/** What each person shares in the segue (the Hub may rename it in the agenda it serves). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- same signature as the Hub's, which varies by meeting
export function segueName(_key: string): string {
  return "Business Best";
}

/**
 * The meetings whose pages are laid out like Bloom Growth's (the owner's request, 15 Nov 2026): here, the BCS DM L10
 * (the Hub lists both DM L10s).
 */
export const bloomStyle = (key: string): boolean => key === "bcs-dm" || key === "bcs-gm";

/** The meetings whose cadence line shows the total of the agenda the page runs (QA, 15 Nov 2026): the BCS DM and GM L10s. */
export const CADENCE_FROM_AGENDA: readonly string[] = ["bcs-dm", "bcs-gm"];

/** The meetings that run without rocks (17 Nov 2026: "We don't use rocks at the GM/SD level"): no Rock Review, no Goals page in the report. */
export const NO_ROCKS: readonly string[] = ["bcs-gm"];
export const hasRocks = (key: string): boolean => !NO_ROCKS.includes(key);

/**
 * The BCS GM L10's agenda (17 Nov 2026: "We don't use rocks at the GM/SD level, so the agenda for both should be:
 * Segue, Scorecard, To-dos, IDS, Conclude"). The Hub serves the agenda it runs with the roster, which wins; this is the
 * page's own copy for when it does not.
 */
export const NO_ROCKS_AGENDA: AgendaSection[] = [
  { key: "business-best", title: "Segue", minutes: 5 },
  { key: "scorecard", title: "Scorecard", minutes: 5 },
  { key: "todos", title: "To-dos", minutes: 5 },
  { key: "ids", title: "IDS", minutes: 60 },
  { key: "conclude", title: "Conclude", minutes: 5 },
];

/**
 * The cadence line a meeting shows ("Tuesdays · 70 min"). For the meetings above, the minutes are the total of the
 * agenda the page runs (the Hub's, served with the roster), so the words cannot drift from it (the sibling app's #1033
 * mechanism; there it is the STC DM L10). Display only.
 */
export function cadenceLabel(key: string, cadence: string, agenda: AgendaSection[] = agendaFor(key)): string {
  if (!CADENCE_FROM_AGENDA.includes(key)) return cadence;
  const total = agenda.reduce((t, a) => t + a.minutes, 0);
  return /\d+\s*min/.test(cadence) ? cadence.replace(/\d+\s*min/, `${total} min`) : `${cadence} · ${total} min`;
}

export function agendaFor(key: string): AgendaSection[] {
  if (key === "bcs-gm") return NO_ROCKS_AGENDA;
  if (key === "leadership") return AGENDA.filter((a) => a.key !== "headlines" && a.key !== "todos").map((a) => (a.key === "ids" ? { ...a, minutes: 70 } : a));
  return AGENDA;
}

/** Lovable's one-line hint under each section title. */
export const SECTION_HINTS: Record<AgendaKey, string> = {
  "business-best": "Round-robin: each person shares one business best, then you check them off.",
  scorecard: "Any metric off track from goal for two weeks becomes an issue.",
  rocks: "Quarterly rocks by owner: status, milestones and notes.",
  headlines: "Customer and employee headlines to share with the team.",
  todos: "Weekly commitments. Open to-dos carry forward.",
  // Ask Bubbles: no ranking on IDS (see RANKING in meeting/_components/Ids.tsx), so the hint does not mention it.
  ids: "Identify, Discuss, Solve. Number the issues 1, 2, 3 in the order to work them, then solve them in that order.",
  conclude: "Recap, cascade the message and rate the meeting.",
};

/** The one-line hints for a meeting (the Hub's, served with the roster, win: see `hintsFromRoster`). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- same signature as the Hub's, which varies by meeting
export function sectionHintsFor(_key: string): Record<AgendaKey, string> {
  return SECTION_HINTS;
}

const AGENDA_KEYS = new Set<string>(AGENDA.map((a) => a.key));

/**
 * The agenda the page runs: the Hub's (served with the roster, so a change there reaches Ask Bubbles without a deploy)
 * when it is well formed, else this copy's.
 */
export function agendaFromRoster(key: string, roster: Pick<Roster, "agenda">): AgendaSection[] {
  const a = roster.agenda;
  const ok = Array.isArray(a) && a.length > 0 && a.every((s) => s && AGENDA_KEYS.has(s.key) && typeof s.title === "string" && Number.isFinite(s.minutes) && s.minutes > 0);
  const agenda = ok ? a.map((s) => ({ key: s.key, title: s.title, minutes: s.minutes })) : agendaFor(key);
  const title = SECTION_TITLE[key];
  return title ? agenda.map((s) => (title[s.key] ? { ...s, title: title[s.key]! } : s)) : agenda;
}

/**
 * Ask Bubbles: section names shown in place of the Hub's for a meeting. The BCS DM L10's segue (the Hub's "AI Share")
 * is "Recap" here (the owner, 17 Nov 2026: 'replace AI SHare with "Recap"'); the page shows last week's feedback.
 * Display only: the Hub's agenda, minutes and order are unchanged.
 */
export const SECTION_TITLE: Readonly<Record<string, Partial<Record<AgendaKey, string>>>> = { "bcs-dm": { "business-best": "Recap" } };

/** The hints the page shows: the Hub's where it sent one, else this copy's. */
export function hintsFromRoster(key: string, roster: Pick<Roster, "hints">): Record<AgendaKey, string> {
  const out = { ...sectionHintsFor(key) };
  for (const [k, v] of Object.entries(roster.hints ?? {})) if (AGENDA_KEYS.has(k) && typeof v === "string" && v.trim()) out[k as AgendaKey] = v;
  return out;
}
