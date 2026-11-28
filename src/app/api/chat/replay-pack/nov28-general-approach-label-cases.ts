import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";

/**
 * ============================================================================
 * THE OLDER CHAT'S UNLABELLED "AS A GENERAL APPROACH…" LINES (GENERAL_ADVICE_ENABLED; the owner, 28 Nov 2026)
 * ============================================================================
 *
 * The owner said "ok good" to giving the older chat's unlabelled "as a general approach…" lines the same rule as the
 * labelled general advice (port from the sibling app): the exact label, never inside an answer that cites a policy,
 * never on pay, discipline or legal topics. The chat's statement taxonomy said "A phrase like 'as a general approach' is
 * enough", so a cited policy answer could end on general practice with no label.
 *
 * The chat's own path (no agent loop). The coaching prep paragraph is this app's production reply (conv_mvmvo5wf2p0o2b7);
 * the policy passage is invented test text.
 */

const FLAG = "GENERAL_ADVICE_ENABLED";
const REPORT = "The owner, 28 Nov 2026: \"ok good\" — the older chat's unlabelled \"as a general approach…\" lines get the same rule as labelled general advice (the exact label; never inside an answer that cites a policy; never on pay, discipline or legal)";
const LABEL = "General advice (not from Buff City Soap documents):";

const GENERAL_APPROACH = "As a general approach, if you're rolling this out to a team, it lands better to walk the standard at a shift huddle and let people ask about the grey areas before you start sending anyone home.";
const FORM_OFFER = "If you do need to document a conversation with someone on appearance, ask me to create a coaching form for them.";
const PREP_APPROACH = "As a general approach, hold it privately, early in the shift when there's still time to practice and watch it play out, and keep it to one focus so the person leaves knowing exactly what to do with the next guest.";

const NAME_TAG_POLICY = {
  chunk_id: "kb-name-tags",
  document_id: "doc-appearance-test",
  document_title: "APPEARANCE STANDARDS TEST DOCUMENT",
  category: "operations",
  locator: "Name tags",
  page: 2,
  section: "Name tags",
  content: "Name tags are worn and visible at all times while working. Each employee receives one name tag.",
  similarity: 0.83,
};

function start(t: ReplayContext, rows: readonly Record<string, unknown>[] = []) {
  vi.setSystemTime(new Date("2026-11-28T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
  t.knowledgeHas!(rows);
}

export const NOV28_GENERAL_APPROACH_LABEL_CASES: ReplayCase[] = [
  {
    id: "nov28-general-approach-cited-dropped",
    title: "The chat's path: a cited policy answer with an unlabelled \"As a general approach…\" paragraph reaches the manager without it; the cited text and the closing form offer stay",
    report: REPORT,
    status: { open: "the unlabelled \"As a general approach…\" paragraph reaches the manager inside the cited policy answer" },
    fixFlags: [FLAG],
    async run(t) {
      start(t, [NAME_TAG_POLICY]);
      const cited = "Name tags are worn and visible at all times while working, and each employee receives one [S1].";
      t.modelSays(`${cited}\n\n${GENERAL_APPROACH} ${FORM_OFFER}`);
      const reply = await t.thread().say("whats the policy on name tags");
      expect(reply.content, reply.content).not.toMatch(/as a general approach/i);
      expect(reply.content, reply.content).not.toMatch(/shift huddle/);
      expect(reply.content, reply.content).not.toContain(LABEL);
      expect(reply.content, reply.content).toMatch(/Name tags are worn and visible at all times while working/);
      expect(reply.content, reply.content).toContain(FORM_OFFER);
      expect((reply.citations ?? []).map((citation) => citation.documentTitle), reply.content).toContain(NAME_TAG_POLICY.document_title);
      expect(t.lastSystem!(), "the prompt still says a phrase like \"as a general approach\" is enough").not.toContain('A phrase like "as a general approach" is enough.');
    },
  },
  {
    id: "nov28-general-approach-uncited-labelled",
    title: "The chat's path: \"help me prepare a coaching conversation\" answered with this app's production \"As a general approach, hold it privately…\" and nothing cited: it gets the exact label",
    report: REPORT,
    status: { open: "the uncited \"As a general approach…\" paragraph reaches the manager with no label" },
    fixFlags: [FLAG],
    async run(t) {
      start(t);
      t.modelSays(`I couldn't find anything on preparing a coaching conversation in the Buff City Soap documents.\n\n${PREP_APPROACH}`);
      const reply = await t.thread().say("help me prepare a coaching conversation");
      expect(reply.content, reply.content).toContain(`${LABEL}\n${PREP_APPROACH}`);
    },
  },
  {
    id: "nov28-general-approach-pay-dropped",
    title: "The chat's path: \"what should I pay a new hire starting next week?\" answered with an unlabelled \"In general…\" line: it never reaches the manager, and is never labelled",
    report: REPORT,
    status: { open: "the unlabelled pay advice (\"most stores start a little above minimum wage\") reaches the manager" },
    fixFlags: [FLAG],
    async run(t) {
      start(t);
      t.modelSays("That isn't in the Buff City Soap documents, so please check with HR or your manager.\n\nIn general, most stores start a little above minimum wage.");
      const reply = await t.thread().say("what should I pay a new hire starting next week?");
      expect(reply.content, reply.content).not.toMatch(/minimum wage/i);
      expect(reply.content, reply.content).not.toContain(LABEL);
      expect(reply.content, reply.content).toMatch(/HR or your manager/);
    },
  },
];
