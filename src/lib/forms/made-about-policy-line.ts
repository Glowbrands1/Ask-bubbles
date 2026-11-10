import "server-only";

import { madeAbout } from "@/lib/ai/make-it-about";
import { flaggedCitationWrite } from "@/lib/ai/policy-citation-fields";
import type { AskResponse } from "@/lib/ai/types";
import { ACTIVE_BRAND } from "@/lib/brand";
import { formEditSingleWriterEnabled, madeAboutPolicyLineReplacesEnabled } from "@/lib/config/chat-quality-flags";
import { SupabaseKnowledgeProvider } from "@/lib/knowledge/providers/supabase";

import { splitAppCitationLine } from "./app-citation-line";
import { draftFromRows } from "./form-reducer";
import { authorizeInstance } from "./instance-scope";
import { applyAssistantRevision, loadInstance } from "./instances";

/**
 * MADE_ABOUT_POLICY_LINE_ENABLED (ported from the sibling app: QA's live round-11 test there, 9 Nov 2026; QA's live Bubbles
 * report, 10 Nov 2026): on a saved Coaching draft whose Details ended "Policy reference: Attendance Policy, JBA Policy Manual
 * p.14", a made-about turn rewrote Details and the reference no longer matched the new account (the sibling app: the line
 * went with the old account and none was written; this app: the old line was kept on the new one). The account rewritten,
 * its policy reference is written again from the new account: the manual's section and the page it prints, as the card
 * cites it (`ai/policy-citation-fields.ts`), as the app's own line. No section found: none, rather than the old account's.
 * Never over a line the new account already carries. Returns the field written, or null.
 */
export async function rewriteMadeAboutPolicyLine(input: {
  readonly instanceId: string;
  readonly actorId: string;
  readonly question: string;
  readonly accountKey: string;
  /**
   * MADE_ABOUT_REWRITE_FINISHES_ENABLED: the old account's line. Kept by the revision on the new account, it is not the new
   * account's reference: it is taken off and the reference is read again.
   */
  readonly oldLine?: string | null;
  /** MADE_ABOUT_POLICY_LINE_REPLACES_ENABLED: every policy line the rewritten account carries is taken off, wherever it sits. */
  readonly replaceAnywhere?: boolean;
}): Promise<string | null> {
  try {
    const loaded = await loadInstance(input.instanceId);
    if (!loaded || loaded.instance.status !== "draft") return null;
    const before = draftFromRows(loaded.values);
    const saved = typeof before[input.accountKey]?.value === "string" ? (before[input.accountKey]!.value as string) : "";
    const split = splitAppCitationLine(saved);
    /*
     * MADE_ABOUT_POLICY_LINE_REPLACES_ENABLED (ported from the sibling app's live round 15; QA's live Bubbles report, 10 Nov
     * 2026): the revision kept the old account's line in a shape the splitter does not read as the app's own (a trailing
     * period: both references saved; not the last paragraph: the old one kept and none for the new account). Every
     * "Policy reference: …" line the rewritten account carries is the old account's: all are taken off, wherever they sit,
     * and the reference is read again from the new account's own words alone.
     */
    const stripped = input.replaceAnywhere ? withoutPolicyLines(saved) : null;
    const anywhere = stripped !== null && stripped !== saved.trim();
    const keptOld = anywhere || (input.oldLine != null && split.line !== null && split.line === input.oldLine);
    const account = anywhere ? stripped : keptOld ? split.body : saved;
    if (!account.trim() || (!keptOld && split.line !== null)) return null;
    const manual = await new SupabaseKnowledgeProvider().fetchOfficialPolicyManual(ACTIVE_BRAND.knowledgeScopeId);
    if (!manual.ok) return null;
    const cited = flaggedCitationWrite({
      enabled: true,
      templateKey: loaded.instance.templateKey,
      values: { [input.accountKey]: account },
      notes: `${account}\n${input.question}`,
      chunks: manual.chunks,
    });
    const citedAccount = cited.values[input.accountKey];
    // The old account's line taken off and no section found: the account without it, rather than the old reference.
    const next = citedAccount && citedAccount !== account ? citedAccount : keptOld ? account : null;
    if (!next || next === saved) return null;
    if (formEditSingleWriterEnabled()) {
      // The one writer, as code's own line (the manual's citation), the way the policy path writes one.
      const result = await (await import("./form-write")).writeFormEdits(
        input.instanceId,
        [{ op: "set", field: input.accountKey, value: next, derived: true }],
        { path: "policy", actorId: input.actorId, latest: input.question, loaded },
      );
      return result.handoff === "refused" ? null : input.accountKey;
    } else {
      const result = await applyAssistantRevision(input.instanceId, { values: { [input.accountKey]: next }, checked: {} }, [], input.actorId);
      return input.accountKey in result.accepted.values ? input.accountKey : null;
    }
  } catch {
    return null;
  }
}

/**
 * MADE_ABOUT_POLICY_LINE_OLD_PATH_ENABLED (QA's live Bubbles report, 10 Nov 2026, exact wording): on a saved Coaching draft
 * whose Details carried "Policy reference: Attendance Policy, JBA Policy Manual p.14" (written by an earlier make-about turn
 * that asked for the policy), "make it about not following the dress code" kept the stale line and wrote no dress-code
 * reference. An undated made-about turn is not the patch path's to rewrite here (it hands it off), so the old path's
 * revision (`chat-revision.ts`, unchanged) rewrote Details and kept the line. Around that revision: each field that carried
 * the app's line before it and was rewritten by it has its reference read again from the new account
 * (`rewriteMadeAboutPolicyLine`, the old line always replaced; any shape of it with MADE_ABOUT_POLICY_LINE_REPLACES). Only
 * on a turn that says what the form is about. The revision's reply is returned as it is.
 */
export async function withMadeAboutPolicyLine(
  request: Request,
  instanceId: string,
  question: string,
  revise: () => Promise<AskResponse | null>,
): Promise<AskResponse | null> {
  if (madeAbout(question) === null) return revise();
  let actorId: string;
  // Each field carrying the app's line before the revision: its text then, and the line.
  const lines = new Map<string, { readonly text: string; readonly line: string }>();
  try {
    const { actor, loaded } = await authorizeInstance(request, instanceId, "edit");
    if (loaded.instance.status !== "draft") return revise();
    actorId = actor.id;
    for (const [key, field] of Object.entries(draftFromRows(loaded.values))) {
      const line = typeof field.value === "string" ? splitAppCitationLine(field.value).line : null;
      if (line !== null) lines.set(key, { text: (field.value as string).trim(), line });
    }
  } catch {
    return revise();
  }
  const response = await revise();
  if (!response || lines.size === 0) return response;
  try {
    const revised = await loadInstance(instanceId);
    if (!revised) return response;
    const after = draftFromRows(revised.values);
    for (const [key, { text, line }] of lines) {
      const value = after[key]?.value;
      // Only an account the revision rewrote.
      if (typeof value !== "string" || value.trim() === "" || value.trim() === text) continue;
      await rewriteMadeAboutPolicyLine({
        instanceId,
        actorId,
        question,
        accountKey: key,
        oldLine: line,
        ...(madeAboutPolicyLineReplacesEnabled() ? { replaceAnywhere: true } : {}),
      });
    }
  } catch {
    // The revision's write stands; the line is left as the revision wrote it.
  }
  return response;
}

/** MADE_ABOUT_POLICY_LINE_REPLACES_ENABLED: the text without any "Policy reference: …" line, wherever it sits. */
export function withoutPolicyLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*Policy reference:/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
