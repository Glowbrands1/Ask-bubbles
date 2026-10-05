import { NextResponse } from "next/server";

import { getAnthropicClient } from "@/lib/ai/anthropic";
import { AiError } from "@/lib/ai/errors";
import {
  assertLiveMode,
  assertNoConfigurationProblems,
  assertWithinRateLimit,
  errorResponse,
} from "@/lib/api/respond";
import { ACTIVE_BRAND } from "@/lib/brand";
import { CLAUDE_MAX_TOKENS, CLAUDE_MODEL } from "@/lib/config/models";
import { interpolate, parseFormVariants, type FormField } from "@/lib/forms/document";
import { stripPlaceholdersFromDraft } from "@/lib/forms/drafted-text";
import { applyEmployeeName, employeeNameRules } from "@/lib/forms/employee-reference";
import {
  correctDraftedDates,
  formDateBrief,
  groundedSourceWithFormDate,
  resolveFormDate,
} from "@/lib/forms/form-date-grounding";
import { authorizeInstance, InstanceNotVisibleError } from "@/lib/forms/instance-scope";
import { applyAssistantDraft } from "@/lib/forms/instances";
import {
  EXPECTATION_LABEL,
  GOING_FORWARD_LABEL,
  OBSERVED_EXPECTATION,
  OBSERVED_LABEL,
  PLAN_OF_ACTION,
  guardNarrativeDraft,
} from "@/lib/forms/narrative-draft";
import {
  POLICY_CLAIM_REMOVED_NOTICE,
  POLICY_SEPARATION_RULES,
  stripUnsupportedPolicyClaims,
} from "@/lib/forms/policy-claim-guard";
import {
  dropUngroundedPolicy,
  groundPolicy,
  groundingNotice,
  provenanceFor,
} from "@/lib/forms/policy-grounding";
import {
  draftableCheckboxGroups,
  draftableFields,
  draftableNumberedLists,
  enforceResponsibilities,
} from "@/lib/forms/responsibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * ============================================================================
 * POST /api/forms/instances/[id]/draft — the assistant drafts a form
 * ============================================================================
 *
 * The model drafts ONLY the fields the template marks `ai`, through a forced
 * tool call, and every value it returns goes through the same guards before
 * anything is stored:
 *
 *   placeholders       "[Employee Name]" and friends are removed, never stored
 *   form date          a drafted date that is not the form's or the manager's
 *                      is corrected
 *   narrative          sentences carrying specifics the manager never gave are
 *                      dropped from narrative fields
 *   policy             a `policyGrounded` field is filled only from approved
 *                      policy retrieved from the knowledge base, verbatim; with
 *                      none found, the field stays the manager's to complete.
 *                      Policy CLAIMS ("this violates policy X") are stripped
 *                      from every other field
 *   employee name      pronouns become the employee's first name on their own
 *                      record
 *   responsibilities   `enforceResponsibilities` drops anything written to a
 *                      field the assistant may not fill — a signature, a
 *                      manager's field — whatever the model returned
 *
 * Which forms exist, and what their fields are, is company configuration. This
 * route knows only the engine.
 */

interface DraftBody {
  notes?: string;
  topic?: string;
}

function fieldBrief(field: FormField, variantLabel: string | null): string {
  const label = interpolate(field.label, null).replace(/\{\{\w+\}\}/g, variantLabel ?? "the employee");
  const help = field.help && !field.narrative ? ` (${field.help})` : "";
  const grounded = field.policyGrounded ? " [quote approved policy only]" : "";
  const narrative = field.narrative ? ` [${field.narrative}]` : "";
  return `- ${field.key}: ${label}${help}${grounded}${narrative}`;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertLiveMode();
    assertNoConfigurationProblems();
    const { id } = await context.params;
    const { actor, loaded } = await authorizeInstance(request, id, "edit");
    assertWithinRateLimit(request, "chat");

    if (loaded.instance.status !== "draft") {
      return NextResponse.json(
        { error: "This form is finalized. Create a revision to change it." },
        { status: 409 },
      );
    }

    const body = ((await request.json().catch(() => null)) ?? {}) as DraftBody;
    const notes = String(body.notes ?? "").trim().slice(0, 4000);
    if (notes.length < 10) {
      throw new AiError(
        "bad_request",
        `Tell ${ACTIVE_BRAND.assistantName} what happened before asking for a draft.`,
        400,
      );
    }

    const document = loaded.version.document;
    const variantKey = loaded.instance.variantKey;
    const variant =
      parseFormVariants(loaded.version.variants).find((entry) => entry.key === variantKey) ?? null;

    const fields = draftableFields(document, variantKey);
    const groups = draftableCheckboxGroups(document, variantKey);
    const lists = draftableNumberedLists(document, variantKey);
    if (fields.length === 0 && groups.length === 0 && lists.length === 0) {
      return NextResponse.json({ values: {}, checked: {}, withheld: [], notice: null });
    }

    const needsPolicy = fields.some((field) => field.policyGrounded);
    const grounding = needsPolicy
      ? await groundPolicy(`${body.topic ?? ""} ${notes}`.trim())
      : { passages: [], sources: [], unverified: false, reason: null };

    const policyBlock = grounding.passages.length
      ? `\nAPPROVED POLICY (quote only from this, verbatim):\n${grounding.passages
          .map((passage) => `[${passage.source.documentTitle} ${passage.source.locator}]\n${passage.text}`)
          .join("\n\n")}`
      : needsPolicy
        ? "\nAPPROVED POLICY: none found. Leave every policy field empty."
        : "";

    const resolvedFormDate = resolveFormDate(loaded.instance.formDate);
    const narrativeKeys = new Set(
      fields.filter((field) => field.narrative !== undefined).map((field) => field.key),
    );
    const groundingSource = groundedSourceWithFormDate(notes, resolvedFormDate);
    const hasObservedExpectation = fields.some((field) => field.narrative === OBSERVED_EXPECTATION);
    const hasPlanOfAction = fields.some((field) => field.narrative === PLAN_OF_ACTION);

    const system = [
      `You prepare drafts of ${ACTIVE_BRAND.brandName} forms for a manager to review.`,
      "You are drafting, not deciding. A manager edits everything you write and signs it.",
      "FACTS come only from what the manager described: what happened, to whom, when, how many, where.",
      "Complete the form. Do not leave a field you can reasonably fill empty, and do not ask the manager for wording you can write yourself.",
      "Never invent dates, figures, policy names or policy wording.",
      "Never write a placeholder such as [Follow-Up Date] or [Employee Name]. If you do not have a value, leave the field empty.",
      "Do not mention follow-up dates or scheduling at all: the follow-up date is recorded separately by the manager, not in these fields.",
      "If you cannot support a field from what you were given, return it empty.",
      "Return only the fields you were asked for.",
      "Never add a disciplinary step, a warning level, a suspension, a termination, an amount, a count of prior incidents, or a date the manager did not give you.",
      ...(hasObservedExpectation
        ? [
            `A field marked [${OBSERVED_EXPECTATION}] is written as labelled sections, each label on its own line, separated by blank lines: "${OBSERVED_LABEL}" then what happened, from the manager's account only; "${EXPECTATION_LABEL}" then the standard expected, stated neutrally; "${GOING_FORWARD_LABEL}" then what should happen differently, as practical behaviour.`,
            "The expectation is general workplace practice, NOT a quotation of any written rule. Never write that company policy, a handbook or a manual requires something.",
          ]
        : []),
      ...(hasPlanOfAction
        ? [
            `A field marked [${PLAN_OF_ACTION}] is one short paragraph — no labels, no bullets — describing the agreed way forward in general terms. No dates, no disciplinary level, and no quoted or paraphrased policy wording.`,
          ]
        : []),
      ...(needsPolicy ? POLICY_SEPARATION_RULES : []),
      ...(resolvedFormDate ? [formDateBrief(resolvedFormDate)] : []),
      ...employeeNameRules(loaded.instance.employeeName),
    ].join(" ");

    const prompt = [
      `FORM: ${loaded.instance.templateName}`,
      variant ? `REVIEWER: ${variant.role}. SUBJECT: ${variant.roleAbbr}.` : "",
      `EMPLOYEE: ${loaded.instance.employeeName}`,
      loaded.instance.locationName ? `LOCATION: ${loaded.instance.locationName}` : "",
      "",
      "WHAT THE MANAGER DESCRIBED:",
      notes,
      policyBlock,
      "",
      "FIELDS YOU MAY WRITE:",
      ...fields.map((field) => fieldBrief(field, variant?.roleAbbr ?? null)),
      ...lists.map(
        (list) =>
          `- ${list.key}: ${interpolate(list.label, variant)} (up to ${list.count} items, one per line)`,
      ),
      "",
      groups.length
        ? `CHECKBOXES TO TICK (use the option keys). Tick the options that match what the manager described; leave a group empty only when nothing in it fits:\n${groups
            .map(
              (group) =>
                `- ${group.key}: ${group.options.map((option) => `${option.key} = ${option.label}`).join("; ")}`,
            )
            .join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: CLAUDE_MAX_TOKENS.detailed,
      system,
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: "write_form_fields",
          description: "Write the drafted values for the fields you were given.",
          input_schema: {
            type: "object",
            properties: {
              values: {
                type: "object",
                additionalProperties: { type: "string" },
                description: "Field key to drafted text. Omit a field you cannot support.",
              },
              checked: {
                type: "object",
                additionalProperties: { type: "array", items: { type: "string" } },
                description: "Checkbox group key to the option keys that apply.",
              },
            },
            required: ["values"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "write_form_fields" },
    });

    const call = response.content.find(
      (block): block is Extract<typeof block, { type: "tool_use" }> => block.type === "tool_use",
    );
    const drafted = (call?.input ?? {}) as {
      values?: Record<string, string>;
      checked?: Record<string, string[]>;
    };

    const cleaned = stripPlaceholdersFromDraft(drafted.values ?? {});
    const dated = correctDraftedDates(cleaned.values, narrativeKeys, notes, resolvedFormDate);
    const narrated = guardNarrativeDraft(dated.values, fields, groundingSource);

    const groundedKeys = new Set(fields.filter((field) => field.policyGrounded).map((field) => field.key));
    const claims = stripUnsupportedPolicyClaims(narrated.values, groundedKeys);
    const policyChecked = dropUngroundedPolicy(fields, claims.values, grounding);
    const provenance = provenanceFor(fields, policyChecked.values, grounding);

    const named = applyEmployeeName({
      values: policyChecked.values,
      fields,
      employeeName: loaded.instance.employeeName,
      skipKeys: groundedKeys,
      knownWords: [
        ACTIVE_BRAND.brandName,
        ...(loaded.instance.locationName ? [loaded.instance.locationName] : []),
      ],
    });

    const enforced = enforceResponsibilities(document, variantKey, {
      values: named.values,
      checked: drafted.checked ?? {},
    });

    const guarded = await applyAssistantDraft(
      id,
      { values: enforced.values, checked: enforced.checked },
      actor.id,
      provenance,
    );

    return NextResponse.json({
      values: guarded.accepted.values,
      checked: guarded.accepted.checked,
      withheld: [...new Set([...policyChecked.withheld, ...guarded.policyRefused])],
      rejected: guarded.rejected,
      placeholders: { cleaned: cleaned.cleaned, emptied: cleaned.emptied },
      narrative: { adjusted: narrated.adjusted, emptied: narrated.emptied },
      policyClaims: { adjusted: claims.adjusted, emptied: claims.emptied },
      datesCorrected: dated.corrected,
      employeeNamed: named.adjusted,
      notice:
        [
          groundingNotice(grounding),
          claims.adjusted.length + claims.emptied.length > 0 ? POLICY_CLAIM_REMOVED_NOTICE : null,
        ]
          .filter((line): line is string => Boolean(line))
          .join(" ") || null,
      sources: grounding.sources,
    });
  } catch (error) {
    if (error instanceof InstanceNotVisibleError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return errorResponse(error, "forms/instance/draft");
  }
}
