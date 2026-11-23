import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE MANAGER'S EXPLICIT JOB TITLE OVERRIDES WOVEN'S (Pau's ruling via QA, 23 Nov 2026)
 * ============================================================================
 *
 * The card uses Woven's title by default. When the manager explicitly tells the AI to use another title for this person
 * ("no, put her title as <title>"), the card and the saved form use theirs: written as the company's title list writes it
 * when it is one of its titles, else as typed. It rests on the model's job_title with job_title_evidence (the manager's
 * own words asking for it), checked like every evidence field. A title mentioned in passing does not override, and an
 * empty Woven title is still filled from the manager's words as before. Every person invented (`LOOP_STAFF`).
 */

const REPORT = "Pau's ruling via QA (23 Nov 2026): Woven's title by default; the manager's explicit title for this person wins";
const ACCOUNT = "Fenna was late to open on 11/21/26.";
/** Invented: no title in Woven. */
const NO_TITLE: DirectoryRow = { id: "e-corwin-ashby", firstName: "Corwin", lastName: "Ashby", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: null };

type Out = { card?: { job_title?: string | null }; facts?: Record<string, unknown> } | null;
const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").length;

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, NO_TITLE]);
  t.as("location_manager", WEST_DODGE);
}

/** T1: the card; T2 (when given): the model passes `title` quoting `quote` from T2, as the rules book has it. */
function model(person: { id: string; name: string }, account: string, title?: { title: string; quote: string }) {
  return loopStandIn((view): LoopDecision => {
    const result = lastResult(view, "propose_form") as Out;
    if (result) {
      const set = result.facts?.job_title_set as { say_exactly?: string } | undefined;
      return { text: [`Here's the Corrective Action Form for **${person.name.split(" ")[0]}**.`, set?.say_exactly ?? ""].filter(Boolean).join("\n") };
    }
    const base = { template_key: "dpoa", employee_id: person.id, person_evidence: evidenceFrom(view, person.name, users(view) - 1), what_happened: account, incident_date: "2026-11-21", policy: "Late Opening" };
    if (users(view) >= 2 && title) return { tool: "propose_form", input: { ...base, job_title: title.title, job_title_evidence: evidenceFrom(view, title.quote) } };
    return { tool: "propose_form", input: base };
  });
}

const titles = (standIn: ReturnType<typeof model>) => standIn.views.flatMap((view) => view.results.filter((result) => result.tool === "propose_form")).map((result) => (result.output as Out)?.card?.job_title ?? null);

async function override(t: ReplayContext, said: string, title: { title: string; quote: string }) {
  start(t);
  const standIn = model({ id: LOOP_FENNA.id, name: "Fenna Prewitt" }, ACCOUNT, title);
  t.loopModel!(standIn);
  const thread = t.thread();
  await thread.say("ca for Fenna Prewitt, late to open on 11/21");
  const reply = await thread.say(said);
  t.draftWrites({ observation: `Observed:\n${ACCOUNT}` });
  const id = await thread.create();
  return { standIn, reply, saved: t.values(id).job_title ?? null };
}

const fixed = (id: string, title: string, run: (t: ReplayContext) => Promise<void>): ReplayCase => ({ id, title, report: REPORT, status: "fixed", run });

export const NOV23_AGENT_LOOP_JOB_TITLE_MANAGER_OVERRIDE_CASES: ReplayCase[] = [
  fixed("nov23-job-title-override-company-title", "\"no, put her title as AGM\" (Woven: Team Member Part Time): the card and the saved form say Assistant General Manager, and the reply says \"Job title set to Assistant General Manager, as you asked.\"", async (t) => {
    const { standIn, reply, saved } = await override(t, "no, put her title as AGM", { title: "AGM", quote: "put her title as AGM" });
    expect(titles(standIn)[0], "the first card is not Woven's title (the case proves nothing)").toBe("Team Member Part Time");
    expect(titles(standIn).at(-1), "the card does not carry the manager's title").toBe("Assistant General Manager");
    expect(reply.content).toContain("Job title set to Assistant General Manager, as you asked.");
    expect(saved, "the saved form does not carry the manager's title").toBe("Assistant General Manager");
  }),
  fixed("nov23-job-title-override-title-not-on-list", "\"no, use Shift Lead\" (a title the company list does not have): the card and the saved form say Shift Lead, as typed", async (t) => {
    const { standIn, saved } = await override(t, "no, use Shift Lead", { title: "Shift Lead", quote: "use Shift Lead" });
    expect(titles(standIn).at(-1)).toBe("Shift Lead");
    expect(saved).toBe("Shift Lead");
  }),
  fixed("nov23-job-title-override-quote-without-title-refused", "Control: job_title quoting words that do not hold the title (\"no\") is not kept; Woven's title stands", async (t) => {
    const { standIn, saved } = await override(t, "no, she is great", { title: "Shift Lead", quote: "no, she is great" });
    expect(titles(standIn).at(-1)).toBe("Team Member Part Time");
    expect(saved).toBe("Team Member Part Time");
  }),
  fixed("nov23-job-title-in-passing-no-override", "Control: \"she's our assistant manager and was late\" (a title mentioned in passing; the model passes no job_title, as the rules book has it): Woven's title stands, and the card notes title_differs", async (t) => {
    start(t);
    const standIn = model({ id: LOOP_FENNA.id, name: "Fenna Prewitt" }, ACCOUNT);
    t.loopModel!(standIn);
    const thread = t.thread();
    await thread.say("ca for Fenna Prewitt, she's our assistant manager and was late to open on 11/21");
    const facts = (standIn.views.flatMap((view) => view.results.filter((result) => result.tool === "propose_form")).at(-1)?.output as Out)?.facts ?? {};
    expect(titles(standIn).at(-1)).toBe("Team Member Part Time");
    expect(facts.job_title_set ?? null).toBeNull();
    expect(facts.title_differs, JSON.stringify(facts)).toBeTruthy();
    t.draftWrites({ observation: `Observed:\n${ACCOUNT}` });
    expect(t.values(await thread.create()).job_title).toBe("Team Member Part Time");
  }),
  fixed("nov23-job-title-empty-woven-fill-unchanged", "Control: no Woven title; \"ca for corwin ashby, he is a general manager at west dodge, …\" fills it from the manager's words, as before (job_title_from_your_words), never job_title_set", async (t) => {
    start(t);
    const standIn = model({ id: NO_TITLE.id, name: "Corwin Ashby" }, "Corwin was late to open on 11/21/26.");
    t.loopModel!(standIn);
    const thread = t.thread();
    const reply = await thread.say("ca for corwin ashby, he is a general manager at west dodge, late to open on 11/21");
    const facts = (standIn.views.flatMap((view) => view.results.filter((result) => result.tool === "propose_form")).at(-1)?.output as Out)?.facts ?? {};
    expect(reply.formProposal?.employeeRole).toBe("General Manager");
    expect(facts.job_title_from_your_words).toBe("General Manager");
    expect(facts.job_title_set ?? null).toBeNull();
  }),
];
