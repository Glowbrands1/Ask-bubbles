import "server-only";

import type { AskResponse } from "@/lib/ai/types";
import { ACTIVE_BRAND } from "@/lib/brand";
import {
  SupabaseKnowledgeProvider,
  type OfficialPolicyManualResult,
} from "@/lib/knowledge/providers/supabase";
import type { ChatMessage } from "@/types";

import { syncCorrectiveActionPlan } from "./ca-action-plan-sync";
import { fieldsForVariant, parseFormDocument } from "./document";
import { authorizeInstance } from "./instance-scope";
import { applyAssistantDraft, applyAssistantRevision } from "./instances";
import {
  COMPANY_POLICIES_OFFENSE,
  findManualSection,
  headingKey,
  manualDisplayTitle,
  manualSectionHeadings,
  offenseKeyForManualHeading,
  officialManualProvenance,
  type ManualChunk,
  type ManualSection,
} from "./official-policy-manual";
import { manualGroundedPolicies, policyFieldValue } from "./policy-citation";
import { policyPhrase } from "./ca-action-plan";
import { employeeFirstName } from "./employee-reference";
import {
  nextPolicySections,
  readPolicyChange,
  sectionsNamedIn,
  similarHeadings,
  unresolvedPolicyName,
} from "./policy-change";
import { formDerivedProvenance, offenseCategoryValue } from "./policy-fields";
import { extractEmployeeNames, samePerson } from "./proposal";
import { asksForAnotherForm } from "./revision";

/** The line on a Corrective Action Form and a Policy Review that quotes the manual. */
const POLICY_KEY = "policy_language";

/** The line that names the offense box — and, under Violation of Company Policies, the section. */
const VIOLATED_KEY = "policy_violated";

/** "Create a CA for …", "I need a new corrective action" — a new form, not this one. */
const NEW_FORM = /\b(?:create|start|pull up|new|another|need an?|draft an?)\b/i;

/** "Add THAT policy", "the one you quoted" — the policy is in an earlier turn. */
const REFERS_BACK =
  /\b(?:that|this|the same|those|above|it|you (?:just\s+)?(?:quoted|found|mentioned|showed|cited|shared|pulled))\b/i;

/** How far back "that policy" may reach. */
const LOOKBACK_TURNS = 6;

/**
 * ============================================================================
 * "ADD THE ATTENDANCE POLICY" ON THE FORM THAT IS OPEN
 * ============================================================================
 *
 * Ported from the reference platform. Tried by the chat route after
 * `correctActiveForm` and before a redraft, a revision or an ordinary answer,
 * only where the browser named a form this conversation created. Null for
 * anything that is not a policy change to a form with a Direct policy line —
 * the turn is then answered exactly as before.
 *
 * THE MANUAL'S WORDS, NEVER THE MODEL'S. No model is called. The section is
 * found by the heading the pinned manual prints, or by the manager's own name
 * for it read the way a first draft reads it (`policy-change.ts`); its wording
 * is copied out of the manual's rows, and it is written with the same
 * `officialManualProvenance` the first draft gives a section it resolved — so
 * the form card's verification notice and the finalize acknowledgement behave
 * exactly as they do for a first draft that found the section itself.
 *
 * THE MANUAL IS THE ONE THE DRAFT ROUTE READS: `fetchOfficialPolicyManual`
 * for this company's corpus, settled by identity. Two documents claiming to
 * be it, or none, changes nothing and says so.
 *
 * EVERYTHING IS RE-CHECKED: the instance is loaded and `authorizeInstance`
 * runs with "edit", the template's own permission and the store scope.
 */
export async function changeActiveFormPolicy(input: {
  request: Request;
  instanceId: string;
  question: string;
  history: Pick<ChatMessage, "role" | "content" | "error">[];
}): Promise<AskResponse | null> {
  const mode = readPolicyChange(input.question);
  if (!mode) return null;
  if (asksForAnotherForm(input.question) || NEW_FORM.test(input.question)) return null;

  let authorized: Awaited<ReturnType<typeof authorizeInstance>>;
  try {
    authorized = await authorizeInstance(input.request, input.instanceId, "edit");
  } catch {
    return null;
  }
  const { actor, loaded } = authorized;
  const instance = loaded.instance;
  const document = parseFormDocument(loaded.version.document);
  const field = fieldsForVariant(document, instance.variantKey).find(
    (candidate) => candidate.key === POLICY_KEY && candidate.policyGrounded,
  );
  if (!field) return null;

  const manual = await readManual();
  const chunks = manual.ok ? manual.chunks : [];

  /*
   * A TURN ABOUT SOMEBODY ELSE IS NOT A CHANGE TO THIS FORM. A policy's own
   * heading in capitals ("the Cell Phone Usage policy") is not a person.
   */
  const headingKeys = manualSectionHeadings(chunks).map(headingKey);
  const named = extractEmployeeNames(input.question).filter(
    (name) => !headingKeys.some((key) => ` ${key} `.includes(` ${headingKey(name)} `)),
  );
  if (named.length > 0 && !named.some((name) => samePerson(name, instance.employeeName))) return null;

  const who = `**${instance.templateName}** for **${instance.employeeName}**`;
  if (instance.status !== "draft") {
    return reply(
      `The ${who} is finalized, so I haven't changed it. Open it from Forms → Forms Register and create a revision to make a change.`,
    );
  }

  if (!manual.ok) {
    return reply(
      manual.problem === "ambiguous"
        ? `More than one document in the knowledge base claims to be the official policy manual, so I haven't changed ${field.label} on the ${who} — I won't quote from one of them on a guess. An administrator can tag the right one; until then, type the policy into that line on the form yourself.`
        : `I couldn't read the official policy manual just now, so I haven't changed ${field.label} on the ${who}. Try again in a moment, or type the policy into that line on the form yourself.`,
    );
  }

  const jobTitle = instance.employeeRole;
  const manualTitle = manual.documentTitle;
  let wanted = sectionsNamedIn({ text: input.question, chunks, jobTitle, manualTitle });
  /*
   * "ADD THAT POLICY TO THE FORM" — the policy was named a turn or two ago,
   * most often in Ask Bubbles' own answer quoting it. The nearest turn that
   * names a manual heading answers, and nothing older.
   */
  if (wanted.length === 0 && REFERS_BACK.test(input.question)) {
    const recent = input.history
      .filter((turn) => !turn.error && typeof turn.content === "string")
      .slice(-LOOKBACK_TURNS);
    for (const turn of [...recent].reverse()) {
      wanted = sectionsNamedIn({ text: turn.content, chunks, jobTitle, manualTitle });
      if (wanted.length > 0) break;
    }
  }

  if (wanted.length === 0) {
    const asked = unresolvedPolicyName(input.question, manualTitle);
    // "The policy is correct" names no policy: not a change, an ordinary turn.
    if (!asked) return null;
    const similar = similarHeadings(asked, chunks);
    return reply(
      [
        `I couldn't find a section called "${asked}" in the ${manualDisplayTitle(manualTitle)}, so I haven't changed ${field.label} on the ${who}.`,
        similar.length > 0
          ? `The manual does have ${similar.map((heading) => `**${heading}**`).join(", ")} — tell me which one you mean.`
          : "Tell me the section's name as the manual prints it, and I'll add it.",
      ].join(" "),
    );
  }

  const row = loaded.values.find((value) => value.fieldKey === POLICY_KEY);
  const before = (row?.value ?? "").trim();
  const current = currentSections(row?.provenance, chunks);
  const next = nextPolicySections({ mode, current, named: wanted });
  const names = (sections: readonly ManualSection[]) =>
    sections.map((section) => `**${section.heading}** (page ${section.page})`).join(" and ");

  if (mode === "remove") {
    if (next.length === current.length) {
      return reply(`${names(wanted)} isn't cited on the ${who}, so I haven't changed anything.`);
    }
    if (next.length === 0) {
      await applyAssistantRevision(input.instanceId, {}, [POLICY_KEY], actor.id);
      const violated = await followOffense(input.instanceId, actor.id, loaded, document, []);
      const plan = await syncCorrectiveActionPlan(input.instanceId, actor.id);
      return {
        ...reply(
          `Removed ${names(wanted)} from ${field.label} on the ${who}. That line is now blank — tell me which policy applies and I'll add it from the manual.${plan.length > 0 ? " The Action Plan no longer names it." : ""} Everything else on the form is as it was.`,
        ),
        formUpdate: { instanceId: input.instanceId, updated: [POLICY_KEY, ...violated, ...plan] },
      };
    }
  }

  if (
    mode !== "remove" &&
    next.length === current.length &&
    next.every((section, i) => headingKey(section.heading) === headingKey(current[i]!.heading))
  ) {
    return reply(`${field.label} on the ${who} already cites ${names(wanted)}, word for word from the manual. Nothing needed changing.`);
  }

  const policies = manualGroundedPolicies(manual, next);
  const value = policyFieldValue(policies);
  if (!value) return null;

  const saved = await applyAssistantDraft(
    input.instanceId,
    { values: { [POLICY_KEY]: value }, checked: {} },
    actor.id,
    {
      [POLICY_KEY]: {
        ...officialManualProvenance({
          documentId: manual.documentId,
          documentTitle: manual.documentTitle,
          matchedBy: manual.matchedBy,
          sections: next,
        }),
        citation: policies,
        via: "chat_policy_change",
      },
    },
  );
  if (!(POLICY_KEY in saved.accepted.values)) {
    return reply(`I couldn't save ${field.label} on the ${who}, so it is as it was. Type the policy into that line on the form instead.`);
  }
  const violated = await followOffense(input.instanceId, actor.id, loaded, document, next);
  /* The Action Plan names the policy Direct policy cites — so it follows the line. See `ca-action-plan.ts`. */
  const plan = await syncCorrectiveActionPlan(input.instanceId, actor.id);

  const added = mode === "remove" ? [] : wanted;
  const lines: string[] = [];
  if (mode === "remove") {
    lines.push(`Removed ${names(wanted)} from ${field.label} on the ${who}. It now cites ${names(next)}.`);
  } else {
    lines.push(
      `Updated ${field.label} on the ${who}: it now cites ${names(next)} from the ${manualDisplayTitle(manualTitle)}, in the manual's own words.`,
    );
    for (const policy of policies.filter((p) => added.some((section) => section.heading === p.sectionTitle))) {
      if (policy.policyText.trim() === "") continue;
      lines.push("", `**${policy.sectionTitle}:**`, ...policy.policyText.trim().split("\n").map((line) => `> ${line}`));
    }
  }
  /*
   * WHAT IT REPLACED IS SAID, so nothing a person typed disappears silently —
   * the old text is quoted back and can be put back on the form.
   */
  const replacedTyped = before !== "" && current.length === 0 && row?.filledBy !== "ai";
  if (replacedTyped) {
    lines.push("", `This replaces what had been typed into that line by hand: "${before}".`);
  } else if (
    mode === "replace" &&
    current.length > 0 &&
    current.some((section) => !next.some((kept) => headingKey(kept.heading) === headingKey(section.heading)))
  ) {
    lines.push(
      "",
      `It no longer cites ${names(current.filter((section) => !next.some((kept) => headingKey(kept.heading) === headingKey(section.heading))))}.`,
    );
  }
  if (violated.length > 0) {
    lines.push("", "Policy Violated now names the same section, so the two lines agree.");
  }
  if (plan.length > 0) {
    lines.push("", `The Action Plan now says management will review ${policyPhrase(next.map((section) => section.heading))} with ${employeeFirstName(instance.employeeName) ?? "the employee"}.`);
  }
  lines.push(
    "",
    "The policy line is now checked against the manual, so the form won't ask you to verify it at Finalize. Everything else on the form is as it was — give it a read below.",
  );
  return {
    ...reply(lines.join("\n")),
    formUpdate: { instanceId: input.instanceId, updated: [POLICY_KEY, ...violated, ...plan] },
  };
}

/**
 * The sections the line cites now — only where Ask Bubbles put them there from
 * the manual. Re-found by heading in the manual as it reads today, so a
 * re-indexed manual is quoted as it is, not as a stale chunk number said.
 */
function currentSections(
  provenance: Record<string, unknown> | undefined,
  chunks: readonly ManualChunk[],
): ManualSection[] {
  if (!provenance || provenance.verified !== true || provenance.source !== "official_policy_manual") return [];
  const listed = Array.isArray(provenance.sections) ? provenance.sections : [];
  const found: ManualSection[] = [];
  for (const entry of listed) {
    const heading = typeof (entry as { locator?: unknown })?.locator === "string" ? (entry as { locator: string }).locator : "";
    const section = heading ? findManualSection(chunks, [heading]) : null;
    if (section && !found.some((seen) => headingKey(seen.heading) === headingKey(section.heading))) found.push(section);
  }
  return found;
}

/**
 * ============================================================================
 * POLICY VIOLATED NAMES THE SECTION DIRECT POLICY CITES — UNDER ONE BOX ONLY
 * ============================================================================
 *
 * On a first draft, a section the manager named that no other offense box
 * covers is ticked under Violation of Company Policies, and Policy Violated
 * reads "Violation of Company Policies — Visitors in the Workplace"
 * (`named-policy-section.ts`). When the open form is ticked that way and its
 * Direct policy line changes, Policy Violated is re-derived from the box and
 * the section now cited, so the two lines never name different sections.
 *
 * NOTHING ELSE MOVES. The offense box is the manager's (or the draft's) and
 * is not ticked or unticked here; a form not ticked under that box, or whose
 * Policy Violated a person wrote by hand, is left exactly as it is. Returns
 * the keys it wrote.
 */
async function followOffense(
  instanceId: string,
  actorId: string,
  loaded: Awaited<ReturnType<typeof authorizeInstance>>["loaded"],
  document: ReturnType<typeof parseFormDocument>,
  cited: readonly ManualSection[],
): Promise<string[]> {
  const variantKey = loaded.instance.variantKey;
  if (!fieldsForVariant(document, variantKey).some((entry) => entry.key === VIOLATED_KEY)) return [];
  const ticked = loaded.values.find((value) => value.fieldKey === "offense_type")?.checked ?? [];
  if (!ticked.includes(COMPANY_POLICIES_OFFENSE)) return [];
  const violated = loaded.values.find((value) => value.fieldKey === VIOLATED_KEY);
  if (violated && violated.filledBy === "manager" && (violated.value ?? "").trim() !== "") return [];

  const companyPolicy =
    cited.find((section) => offenseKeyForManualHeading(section.heading) === COMPANY_POLICIES_OFFENSE)?.heading ?? null;
  const derived = offenseCategoryValue({
    document,
    variantKey,
    checked: { offense_type: ticked },
    values: Object.fromEntries(loaded.values.map((value) => [value.fieldKey, value.value ?? ""])),
    companyPolicyName: companyPolicy,
  });
  if (!derived || derived === (violated?.value ?? "").trim()) return [];
  const saved = await applyAssistantDraft(
    instanceId,
    { values: { [VIOLATED_KEY]: derived }, checked: {} },
    actorId,
    formDerivedProvenance([VIOLATED_KEY]),
  );
  return VIOLATED_KEY in saved.accepted.values ? [VIOLATED_KEY] : [];
}

/** The pinned manual, or a reason — a knowledge-base outage never fails the turn. */
async function readManual(): Promise<OfficialPolicyManualResult> {
  try {
    return await new SupabaseKnowledgeProvider().fetchOfficialPolicyManual(ACTIVE_BRAND.knowledgeScopeId);
  } catch {
    return { ok: false, reason: "The official policy manual could not be read." };
  }
}

function reply(content: string): AskResponse {
  return { content, citations: [], coverage: "not_applicable" };
}
