import { STAFF, type DirectoryRow } from "./cases";

/**
 * ============================================================================
 * REGRESSION SET #1 — THE SCENARIOS, AS PLAIN DATA (4 Nov 2026)
 * ============================================================================
 *
 * Step B (FORM_PATCH_REDUCER_ENABLED / FORM_REPLY_FROM_DIFF_ENABLED) was
 * flipped live on 3 Nov and rolled back. These are the chats that failed
 * live, in the managers' and QA's words (people invented), plus QA's 20 name
 * wordings. Two readers share them:
 *
 *   `nov4-live-regressions-cases.ts`  the replay pack: the real chat route,
 *                                      production's flags, scripted models,
 *                                      asserted invariants (CI).
 *   `evals/live-regressions.eval.ts`  the same turns with the real models
 *                                      (LIVE=1 only, never in CI).
 *
 * Not a `*-cases.ts` file, so the pack's registry does not read it as cases.
 */

/** One step of a chat: a message, or the card's Create. */
export type LiveStep = { readonly say: string } | { readonly create: true };

export interface LiveScenario {
  readonly id: string;
  readonly roster: readonly DirectoryRow[];
  readonly steps: readonly LiveStep[];
  /** The form field the scenario is about, recorded by the live script. */
  readonly field: string | null;
}

/** A directory row at West Dodge Rd (loc-264). */
export const at = (id: string, firstName: string, lastName: string, positionName = "Team Member Part Time"): DirectoryRow => ({
  id,
  firstName,
  lastName,
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName,
});

/* ---------------------------------------------------------------- people -- */

/*
 * The live chats' people are invented. QA's instruction was to leave them
 * OFF the directory, but this app makes no card for a name the Woven roster
 * does not have (a deliberate roster check: "I couldn't find … in the Woven
 * roster"), and the live chats did make a card — the tester's real people
 * were on the directory. So the opening names are on it, and the corrected
 * names (Quill-Hart, Laine) are NOT: the header name stays as it was, as QA
 * saw live.
 */
export const MARNIE_QUILL = at("r1-marnie-quill", "Marnie", "Quill");
export const TESSALY_LANE = at("r1-tessaly-lane", "Tessaly", "Lane");
export const LIVE_ROSTER: readonly DirectoryRow[] = [...STAFF, MARNIE_QUILL, TESSALY_LANE];
/** QA's invented name for the 20 wordings: on the directory only in the ON-roster runs. */
export const CORIN_BELLWEATHER = at("r1-corin-bellweather", "Corin", "Bellweather");
/** QA's coaching case: "On 10-20-26 Jane Doe was late" (on the directory). */
export const JANE_DOE = at("r1-jane-doe", "Jane", "Doe");

/* --------------------------------------------------- live Step B failures -- */

/** The tester's Corrective Action chat, exact turns, one each in order; Create after T1. */
export const CA_CHAIN = [
  "Create a Corrective Action for Marnie Quill, she was late to open on 10-20-26",
  "fix her last name, it is Quill-Hart",
  "redraft it and say she was also late on Tuesday",
  "set the daily stats to 3 of 4 shifts on time",
  "change her position to Team Member",
  "Add that she Must Practice the sanitizing checklist every shift.",
] as const;

/** The tester's coaching chat, the mechanism in this app's setting (invented person). */
export const COACHING_OPENING = "Create a coaching form for Tessaly Lane, she was late to open today";
export const COACHING_CHAIN = ["fix her last name, it is Laine", "make it sound more professional", "can you make it more professional"] as const;

export const LIVE_FAILURE_SCENARIOS: readonly LiveScenario[] = [
  { id: "ca-chain", roster: LIVE_ROSTER, field: "observation", steps: [{ say: CA_CHAIN[0] }, { create: true }, ...CA_CHAIN.slice(1).map((say) => ({ say }))] },
  { id: "coaching-chain", roster: LIVE_ROSTER, field: "coaching_details", steps: [{ say: COACHING_OPENING }, { create: true }, ...COACHING_CHAIN.map((say) => ({ say }))] },
  { id: "street-address", roster: LIVE_ROSTER, field: null, steps: [{ say: "Corrective action for 123 Main Street" }] },
  { id: "jane-doe", roster: [...LIVE_ROSTER, JANE_DOE], field: null, steps: [{ say: "I need a coaching form" }, { say: "On 10-20-26 Jane Doe was late" }] },
];

/* ------------------------------------------------- QA's 20 name wordings -- */

/*
 * QA'S EXACT MATRIX (4 Nov 2026): six templates × three casings, plus two of
 * Pau's sentences word for word. The casing applies to the whole sentence:
 * lower = toLowerCase(); sentence = as written, the name "Corin Bellweather";
 * caps = toUpperCase().
 *
 * TODO(QA): QA may send a further exact matrix. Add its wordings to
 * `NAME_TEMPLATES` (a template, cased three ways) or `NAME_EXACT` (a sentence
 * kept word for word), with the name as `{N}`, and give each a status in
 * `NAME_OPEN` in `nov4-live-regressions-cases.ts`.
 */
export const NAME = "Corin Bellweather";

export const NAME_TEMPLATES: readonly { readonly id: string; readonly text: string }[] = [
  { id: "first-nodate", text: "Corrective action: {N} was rude to a guest at the front desk on Monday" },
  { id: "first-date", text: "Corrective action: {N} was rude to a guest at the front desk on Monday 10/05/2026" },
  { id: "middle-nodate", text: "Corrective action: at the front desk {N} was rude to a guest on Monday" },
  { id: "middle-date", text: "Corrective action: on Monday 10/05/2026 at the front desk {N} was rude to a guest" },
  { id: "last-nodate", text: "Corrective action: a guest was treated rudely at the front desk on Monday by {N}" },
  { id: "last-date", text: "Corrective action: a guest was treated rudely at the front desk on Monday 10/05/2026 by {N}" },
];

/** Kept word for word: the manager's own sentences (the name in lower case as typed). */
export const NAME_EXACT: readonly { readonly id: string; readonly text: string; readonly typed: string }[] = [
  { id: "pau-1", text: "Corrective action: corin bellweather was rude to a guest at the front desk on Monday", typed: "corin bellweather" },
  {
    id: "pau-2",
    text: "Corrective action for the primary salon manager: on Monday 10/05/2026 corin bellweather was working a shift at the front desk and was rude to a guest",
    typed: "corin bellweather",
  },
];

const CASINGS = {
  lower: (text: string) => text.toLowerCase(),
  sentence: (text: string) => text,
  caps: (text: string) => text.toUpperCase(),
} as const;

export interface NameWording {
  /** e.g. "last-date-caps", "pau-2". */
  readonly id: string;
  readonly text: string;
  /** The name as it appears in the sentence. */
  readonly typed: string;
}

/** The 20 wordings, in QA's order: each template lower / sentence / caps, then Pau's two. */
export const NAME_WORDINGS: readonly NameWording[] = [
  ...NAME_TEMPLATES.flatMap((template) =>
    (Object.keys(CASINGS) as (keyof typeof CASINGS)[]).map((casing) => ({
      id: `${template.id}-${casing}`,
      text: CASINGS[casing](template.text.replace("{N}", NAME)),
      typed: CASINGS[casing](NAME),
    })),
  ),
  ...NAME_EXACT,
];

/** The name-matrix directory: Corin Bellweather on it (ON roster) or not (OFF roster). */
export function nameRoster(onRoster: boolean): readonly DirectoryRow[] {
  return onRoster ? [...STAFF, CORIN_BELLWEATHER] : [...STAFF];
}

export const NAME_SCENARIOS: readonly LiveScenario[] = NAME_WORDINGS.flatMap((wording) =>
  [true, false].map((onRoster) => ({
    id: `name-${wording.id}-${onRoster ? "on" : "off"}`,
    roster: nameRoster(onRoster),
    field: null,
    steps: [{ say: wording.text }],
  })),
);
