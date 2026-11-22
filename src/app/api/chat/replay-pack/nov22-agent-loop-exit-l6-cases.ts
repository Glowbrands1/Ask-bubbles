import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * AN EXIT CARD'S REASON IS THE MANAGER'S OWN WORDS (port of the sibling app's QA live L6, 22 Nov 2026)
 * ============================================================================
 *
 * "exit form for <First> <Last>, terminated for job abandonment, not eligible for rehire": the model wrote what_happened
 * "job abandonment", so the card's What happened and the saved reason lost the manager's "terminated for". Same code in
 * this app. Invented person: Dashiell Varnum (on no fixture).
 */

const REPORT = "Sibling app's QA live L6 (22 Nov 2026)";
const DASHIELL: DirectoryRow = { id: "e-dashiell-varnum", firstName: "Dashiell", lastName: "Varnum", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const SAID = "exit form for Dashiell Varnum, terminated for job abandonment, not eligible for rehire";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, DASHIELL]);
  t.as("location_manager", WEST_DODGE);
}

function exitCard(account: string) {
  return {
    tool: "propose_form" as const,
    input: { template_key: "resignation-exit", employee_id: DASHIELL.id, exit_type: "termination", what_happened: account },
  };
}

export const NOV22_AGENT_LOOP_EXIT_L6_CASES: ReplayCase[] = [
  {
    id: "nov22-l6-exit-reason-manager-words",
    title: `L6: "${SAID}" with the model's what_happened "job abandonment": the card and the saved reason read "terminated for job abandonment"`,
    report: `${REPORT}: the exit card and saved reason read "job abandonment"`,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Here's the Employee Exit Form for **Dashiell Varnum**." };
        const call = exitCard("job abandonment");
        return { ...call, input: { ...call.input, exit_evidence: { ...evidenceFrom(view, "exit form for Dashiell Varnum"), kind: "asks_for_exit_form" } } };
      }));
      const thread = t.thread();
      await thread.say(SAID);
      expect((thread.proposal as { fromAgentLoop?: boolean } | null)?.fromAgentLoop, "no loop card was made (the case proves nothing)").toBe(true);
      const issue = String((thread.proposal as { issue?: string } | undefined)?.issue ?? "");
      expect(issue, "the card's What happened").toMatch(/terminated for job abandonment/i);
      const id = await thread.create();
      const values = t.values(id);
      const checked = t.checked(id);
      const saved = JSON.stringify({ values, checked });
      expect(checked.resignation_type ?? [], `not a termination (the case proves nothing):\n${saved}`).toContain("immediate_involuntary_separation");
      expect(values.resignation_reason ?? "", saved).toMatch(/^terminated for job abandonment\.?$/i);
      expect(checked.eligible_for_rehire ?? [], saved).toEqual(["no"]);
    },
  },
  {
    id: "nov22-l6-exit-termination-filed-as-once",
    title: `L6: "${SAID}": the card's facts give the termination's tick once (exit_termination), so a reply that says "Filed as" for each fact says it once`,
    report: `${REPORT}: the reply said "Filed as" twice`,
    status: "fixed",
    async run(t) {
      start(t);
      type Facts = { exit_ticks?: string[]; exit_termination?: { form_label?: string } };
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as { facts?: Facts } | null;
        if (result) {
          /* The live model follows the rules book's two lines: exit_termination's "Filed as an …", and exit_ticks' "Filed as: …". */
          const facts = result.facts ?? {};
          const lines = [
            ...(facts.exit_termination ? [`Filed as an **${facts.exit_termination.form_label}** (a termination), as you said.`] : []),
            ...((facts.exit_ticks ?? []).length > 0 ? [`Filed as: ${facts.exit_ticks!.join(", ")}.`] : []),
          ];
          return { text: `Here's the Employee Exit Form for **Dashiell**. ${lines.join(" ")}` };
        }
        const call = exitCard("terminated for job abandonment");
        return { ...call, input: { ...call.input, exit_evidence: { ...evidenceFrom(view, "exit form for Dashiell Varnum"), kind: "asks_for_exit_form" } } };
      }));
      const reply = await t.thread().say(SAID);
      expect(reply.content, "the termination is not said at all (the case proves nothing)").toMatch(/Immediate involuntary separation/);
      expect(reply.content.match(/Filed as/g) ?? [], reply.content).toHaveLength(1);
    },
  },
  {
    id: "nov22-l6-exit-termination-details-are-card-account",
    title: `L6: "${SAID}": Additional Details are the card's account (the manager's words), never the drafter's "The departure was recorded effective …"`,
    report: `${REPORT}: Additional Details held only "The departure was recorded effective 2026-11-21."`,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Here's the Employee Exit Form for **Dashiell Varnum**." };
        const call = exitCard("terminated for job abandonment");
        return { ...call, input: { ...call.input, exit_evidence: { ...evidenceFrom(view, "exit form for Dashiell Varnum"), kind: "asks_for_exit_form" } } };
      }));
      t.draftWrites({ details: "The departure was recorded effective 2026-11-22." });
      const thread = t.thread();
      await thread.say(SAID);
      expect((thread.proposal as { fromAgentLoop?: boolean } | null)?.fromAgentLoop, "no loop card was made (the case proves nothing)").toBe(true);
      const issue = String((thread.proposal as { issue?: string } | undefined)?.issue ?? "").trim();
      const id = await thread.create();
      const values = t.values(id);
      expect(values.details ?? "", JSON.stringify(values)).not.toMatch(/departure was recorded/i);
      expect(values.details ?? "", JSON.stringify(values)).toBe(issue);
    },
  },
  {
    id: "nov22-l6-termination-reason-no-account",
    title: `L6 (coder 5's live triage on 1c71e11): "${SAID}" with NO what_happened, the model passing exit_reason "terminated for job abandonment": the card's account and the saved reason read it, asked once`,
    report: "Coder 5's live triage (1c71e11, 22 Nov 2026), l6: \"terminated for job abandonment\" never reached What happened or the saved reason, in both runs; the reply offered to add it",
    status: "fixed",
    async run(t) {
      start(t);
      t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as { card?: { reads_back?: string[] } } | null;
        if (result) return { text: ["Here's the Employee Exit Form for **Dashiell**.", ...(result.card?.reads_back ?? [])].join("\n") };
        return {
          tool: "propose_form",
          input: {
            template_key: "resignation-exit", employee_id: DASHIELL.id, exit_type: "termination",
            exit_evidence: { ...evidenceFrom(view, "exit form for Dashiell Varnum"), kind: "asks_for_exit_form" },
            exit_reason: "terminated for job abandonment", exit_reason_evidence: evidenceFrom(view, "terminated for job abandonment"),
          },
        };
      }));
      const thread = t.thread();
      const reply = await thread.say(SAID);
      expect((thread.proposal as { fromAgentLoop?: boolean } | null)?.fromAgentLoop, "no loop card was made (the case proves nothing)").toBe(true);
      expect(String((thread.proposal as { issue?: string } | undefined)?.issue ?? ""), "the card's account").toMatch(/^terminated for job abandonment\.?$/i);
      expect(reply.content, "reads_back lists the reason").toMatch(/Terminated for job abandonment/);
      expect(reply.content).not.toMatch(/isn't on the card|want it added|like it added/i);
      const id = await thread.create();
      const values = t.values(id);
      const checked = t.checked(id);
      const saved = JSON.stringify({ values, checked });
      expect(checked.resignation_type ?? [], `not a termination (the case proves nothing):\n${saved}`).toContain("immediate_involuntary_separation");
      expect(values.resignation_reason ?? "", saved).toMatch(/^terminated for job abandonment\.?$/i);
    },
  },
  {
    id: "nov22-l6-termination-no-reason-stays-blank",
    title: "L6 control: \"exit form for Dashiell Varnum, he was terminated, not eligible for rehire\" with no reason given: no account is made up and the saved reason stays blank",
    report: "Coder 5's live triage (1c71e11, 22 Nov 2026), l6",
    status: "fixed",
    async run(t) {
      start(t);
      t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Here's the Employee Exit Form for **Dashiell**." };
        /* A model that passes the bare word as a reason: it is no reason, and its quote does not hold "termination". */
        return {
          tool: "propose_form",
          input: {
            template_key: "resignation-exit", employee_id: DASHIELL.id, exit_type: "termination",
            exit_evidence: { ...evidenceFrom(view, "exit form for Dashiell Varnum"), kind: "asks_for_exit_form" },
            exit_reason: "Termination", exit_reason_evidence: evidenceFrom(view, "he was terminated"),
          },
        };
      }));
      const thread = t.thread();
      await thread.say("exit form for Dashiell Varnum, he was terminated, not eligible for rehire");
      expect((thread.proposal as { fromAgentLoop?: boolean } | null)?.fromAgentLoop, "no loop card was made (the case proves nothing)").toBe(true);
      expect(String((thread.proposal as { issue?: string } | undefined)?.issue ?? "")).toBe("");
      const id = await thread.create();
      expect(t.values(id).resignation_reason ?? "").toBe("");
    },
  },
];
