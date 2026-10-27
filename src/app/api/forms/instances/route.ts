import { NextResponse } from "next/server";

import { typoReadingText, typoReadingTurns } from "@/lib/ai/typo-reading-copy";
import { protectedNameWords } from "@/lib/ai/typo-name-words";
import { isHiddenTemplate } from "@/config/company/forms/hidden";
import { locationById as salonById } from "@/lib/locations";

import { errorResponse } from "@/lib/api/respond";
import { parseHistory } from "@/lib/api/validation";
import { authorizeForms } from "@/lib/forms/access";
import { isIsoCalendarDate } from "@/lib/forms/form-date-answer";
import {
  applyStatedFacts,
  createInstance,
  findRecentAssistantDraft,
  deleteDemoInstances,
  findDemoInstances,
  InstanceProtectedError,
  listInstances,
  loadInstance,
  type InstanceView,
} from "@/lib/forms/instances";
import { instanceListFilterFor, visibleInstances } from "@/lib/forms/instance-scope";
import { authorizeLocation } from "@/lib/forms/location-scope";
import { isProposalId } from "@/lib/forms/proposal-id";
import { checkProposalIsCurrent } from "@/lib/forms/proposal-currency";
import { allowsTeamSubject, isTeamSubject } from "@/lib/forms/team-subject";
import { isDemoMode } from "@/lib/config/runtime";
import { getTemplateByKey } from "@/lib/forms/repository";
import {
  isPayrollDeductAnswer,
  PAYROLL_DEDUCT_STATED_KEYS,
  payrollDeductAmount,
  payrollDeductChecked,
} from "@/lib/forms/payroll-deduct";
import {
  PAYROLL_DEDUCT_AMOUNT_KEY,
  PAYROLL_DEDUCT_AMOUNT_STATED_KEYS,
} from "@/lib/forms/payroll-deduct-amount";
import {
  WARNING_LEVEL_STATED_KEYS,
  WARNING_TYPE_KEY,
  isWarningLevel,
  warningLevelChecked,
} from "@/lib/forms/warning-level";
import { warningLevelFromConversation } from "@/lib/forms/warning-level-conversation";
import { checkboxGroupsForVariant, parseFormDocument } from "@/lib/forms/document";
import { businessToday } from "@/lib/business-date";
import {
  conversationDraftReuseEnabled,
  draftReuseSameChatOnlyEnabled,
  crossChatDraftDedupeEnabled,
  draftActionsEnabled,
  draftDedupeEnabled,
  payrollDeductAmountFieldEnabled,
  typoReadingRoutesEnabled,
} from "@/lib/config/chat-quality-flags";
import { incidentFingerprint } from "@/lib/forms/incident-key";
import {
  findAccountResentDraft,
  findCrossChatOpenDraft,
  findResentDraft,
  rememberDraftIncident,
} from "@/lib/forms/draft-reopen";
import type { SameChat } from "@/lib/forms/draft-same-chat";
import { historyWantsSeparateDocument } from "@/lib/ai/second-form";
import {
  applyTurnsSinceDraft,
  conversationKeyOf,
  findConversationDraft,
  lastManagerTurnId,
  noteConversationDraft,
} from "@/lib/forms/conversation-draft";
import { historySaysDifferentIncident } from "@/lib/forms/draft-actions";
import type { Permission } from "@/types";
import { privateAwareLimit, privateCreatorsActive } from "@/lib/forms/private-creators";

/**
 * GET    /api/forms/instances   Form Monitoring's history, and what a demo
 *                               sweep would remove
 * POST   /api/forms/instances   starts a form from a template's current version
 * DELETE /api/forms/instances   removes every DEMO DRAFT, by provenance
 *
 * The permission is the TEMPLATE's, not a blanket "forms" one: a Salon Director
 * may create a coaching form and not a disciplinary plan of action, and that
 * distinction is data on the template rather than a rule written here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await authorizeForms(request, "view_form_monitoring");
    const { searchParams } = new URL(request.url);

    const requested = searchParams.get("view");
    const view: InstanceView =
      requested === "archived" || requested === "all" ? requested : "active";

    /*
     * ==========================================================================
     * FORM MONITORING IS SCOPE-FILTERED ON THE SERVER
     * ==========================================================================
     *
     * This listed EVERY form in the company to anybody holding
     * `view_form_monitoring` — which is every manager role. A Salon Director at
     * one salon read the employee names, coaching topics and disciplinary
     * history of every other salon.
     *
     * Filtered HERE rather than in the screen, because a client-side filter is
     * a presentation choice and this is an access boundary: the rows would
     * still have crossed the wire, and `GET /api/forms/instances` is callable
     * without the screen.
     *
     * ==========================================================================
     * NARROWED IN THE QUERY, THEN RE-CHECKED IN MEMORY
     * ==========================================================================
     *
     * This read the whole company ordered by recency, took 200, and filtered
     * that page. Confidential — no foreign row reached the browser — and wrong
     * as a history: across 22 salons, an authorized record older than 200
     * foreign ones never entered the page, so the filter could not return it
     * and a manager's own history silently lost rows.
     *
     * `instanceListFilterFor` moves the narrowing into the query so the limit
     * applies to the VISIBLE set. `visibleInstances` still runs afterwards, and
     * that redundancy is the point: the query decides what is read, the
     * predicate re-checks what is returned, and the predicate is the one that
     * fails closed if they ever drift.
     */
    // PRIVATE_CREATOR_FORMS: over-read, then trim to the default page of 200; off, as before.
    const instances = visibleInstances(
      actor,
      await listInstances(view, privateCreatorsActive() ? privateAwareLimit(200) : undefined, instanceListFilterFor(actor)),
    ).slice(0, 200);

    // The sweep's shape is returned alongside so the screen can say "Delete 5
    // demo forms" with a real number rather than counting what it happens to
    // be showing — the active list is filtered, and a count taken from it
    // would be wrong the moment somebody switches to Archived.
    //
    // Scoped by the same rule: a count of forms the caller may not see would
    // offer a "Delete 5" that removed nothing, and would leak how many exist.
    const sweep = await findDemoInstances();
    return NextResponse.json({
      instances,
      view,
      demo: {
        deletable: visibleInstances(actor, sweep.deletable).length,
        protected: visibleInstances(actor, sweep.protected).length,
      },
    });
  } catch (error) {
    return errorResponse(error, "forms/instances");
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      templateKey?: string;
      variantKey?: string | null;
      employeeName?: string;
      employeeRole?: string | null;
      locationId?: string | null;
      locationName?: string | null;
      source?: "manual" | "assistant";
      formDate?: string;
      payrollDeduct?: unknown;
      warningLevel?: unknown;
      /** The chat the proposal came from, for `checkProposalIsCurrent`. Ask Bubbles only. */
      conversation?: unknown;
      /** Optional stable id for this chat. The first message id is used when this is absent. */
      conversationId?: unknown;
      /** The card's id: a repeated press of the same card returns its draft. */
      proposalId?: unknown;
    } | null;

    if (!body?.templateKey || !body.employeeName?.trim()) {
      return NextResponse.json(
        { error: "A form type and an employee are required." },
        { status: 400 },
      );
    }

    /*
     * THE TEMPLATE MUST EXIST AND BE ACTIVE, CHECKED HERE AND AGAIN BELOW.
     *
     * `createInstance` refuses an inactive template too, and that stays: it is
     * the layer every future caller goes through, and a rule that only lives in
     * a route is a rule the next route forgets.
     *
     * The check is repeated here because of WHAT HAPPENS IN BETWEEN. Without it
     * an inactive template's `required_permission` is applied to the caller,
     * and the eventual refusal arrives as a generic 500 rather than a 404 that
     * says which form is unavailable — which matters now that a proposal
     * carried in browser-local storage can name a template that was retired
     * after the conversation started.
     */
    const template = await getTemplateByKey(body.templateKey);
    // A hidden template (`config/company/forms/hidden.ts`) is answered exactly as a retired one.
    if (!template || !template.active || isHiddenTemplate(template.key)) {
      return NextResponse.json({ error: "No such form template." }, { status: 404 });
    }

    const actor = await authorizeForms(request, template.requiredPermission as Permission);

    /*
     * A TEAM-WIDE SUBJECT ONLY WHERE THE TEMPLATE ALLOWS ONE. "All team
     * members" on a Corrective Action Form or an EPP would file a disciplinary
     * document against nobody in particular. See `lib/forms/team-subject.ts`.
     */
    if (isTeamSubject(body.employeeName) && !allowsTeamSubject(body.templateKey)) {
      return NextResponse.json(
        { error: "This form is about one employee. Tell Bubbles who it is for." },
        { status: 400 },
      );
    }

    /*
     * A PROPOSAL CARD IS ONLY AS CURRENT AS THE CONVERSATION BEHIND IT.
     *
     * After the permission check, so a caller who may not create this form
     * learns nothing about the conversation. A chat card that the manager has
     * since corrected — a different employee, "not Jordan", another form —
     * is refused here even if the browser still offered it. See
     * `lib/forms/proposal-currency.ts`.
     */
    if (body.source === "assistant" && Array.isArray(body.conversation)) {
      const currency = checkProposalIsCurrent({
        conversation: parseHistory(body.conversation),
        templateKey: body.templateKey,
        employeeName: body.employeeName,
      });
      if (!currency.current) {
        return NextResponse.json({ error: currency.reason, code: "proposal_superseded" }, { status: 409 });
      }
    }

    /*
     * ==========================================================================
     * THE SALON IS THE SERVER'S DECISION, NOT THE CALLER'S
     * ==========================================================================
     *
     * This route accepted `locationId` and `locationName` and stored them
     * unchecked. The authenticated identity has carried an `AccessScope` all
     * along — `authorizeForms` was discarding it — so nothing compared the salon
     * on a disciplinary record against the salons the person filing it covers.
     *
     * ENFORCED HERE, AT THE ROUTE EVERY CALLER GOES THROUGH, rather than in the
     * chat orchestration that will use it next. A check that lives in one
     * caller is a check the next caller does not have.
     *
     * A REFUSAL IS A 403 WITH A REASON, not a silently dropped field. Quietly
     * storing the form without its salon would file an HR document against
     * nobody's location and tell the manager it worked.
     */
    const location = authorizeLocation(actor.scope, body.locationId ?? null);
    if (location.kind === "refused") {
      return NextResponse.json({ error: location.reason }, { status: 403 });
    }
    const locationId = location.kind === "authorized" ? location.locationId : null;

    /* See `resolveLocationName`. */
    const locationName = resolveLocationName(locationId, body.locationName ?? null);

    /*
     * DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED. Every lookup below that hands back
     * an existing draft keeps only a draft this chat made (`sameChat`), the
     * chat's own draft is not reused for a card dated differently, every new
     * chat draft records its chat, and a reuse tells the card the draft's
     * date (`reused`). See `draft-same-chat.ts`.
     */
    const sameChatOnly = body.source === "assistant" && draftReuseSameChatOnlyEnabled();
    const chatKey = sameChatOnly
      ? conversationKeyOf({ conversationId: body.conversationId, conversation: body.conversation })
      : null;
    const sameChat: SameChat | undefined = sameChatOnly ? { conversationKey: chatKey } : undefined;
    const cardDate = isIsoCalendarDate(body.formDate) ? body.formDate : null;
    const reused = (instance: { formDate?: string | null }) =>
      NextResponse.json({
        instance,
        reused: true,
        ...(sameChatOnly && instance.formDate ? { reusedFrom: instance.formDate } : {}),
      });

    /*
     * ONE DRAFT PER CARD. A press of a card whose create already succeeded —
     * the response was lost, or the card was pressed in another tab — returns
     * that draft instead of filing a second record. A new card (a new request,
     * a second incident for the same person) always creates. See
     * `findRecentAssistantDraft`.
     */
    const proposalId = body.source === "assistant" && isProposalId(body.proposalId) ? body.proposalId : undefined;
    if (proposalId) {
      const existing = await findRecentAssistantDraft({
        templateKey: body.templateKey,
        employeeName: body.employeeName.trim().slice(0, 120),
        createdBy: actor.id,
        locationId,
        proposalId,
      });
      if (existing) return reused(existing);
    }

    /*
     * THE ANSWERS THIS CARD CARRIES, as the manager's own statements. On a new
     * draft they fill it; on a reused one (`applyStatedFacts` fills only what
     * is blank) they never replace a value already there.
     */
    const card = body;
    async function applyCardFacts(instanceId: string): Promise<void> {
      /*
       * "IS PAYROLL DEDUCT APPLICABLE?", AS THE MANAGER ANSWERED IT IN CHAT.
       *
       * Written as the manager's own statement — the path the employment change
       * forms use for their stated facts — and only where the pinned version
       * has the group: `applyStatedFacts` validates the key and the option
       * against it, and a version without the question (or any other template)
       * gets nothing. No answer sent means nothing written; it is never
       * defaulted. See `lib/forms/payroll-deduct.ts`.
       */
      if (isPayrollDeductAnswer(card.payrollDeduct)) {
        await applyStatedFacts(
          instanceId,
          { values: {}, checked: payrollDeductChecked(card.payrollDeduct) },
          actor.id,
          PAYROLL_DEDUCT_STATED_KEYS,
        );
      }

      /*
       * THE AMOUNT, ONLY WHERE THE MANAGER STATED ONE. A "$25.00" in the cited
       * policy is not an amount. Written on the same path as the Yes/No, and
       * only when that answer is Yes. The flag off writes nothing.
       */
      if (
        payrollDeductAmountFieldEnabled() &&
        card.payrollDeduct === "yes" &&
        Array.isArray(card.conversation)
      ) {
        const said = card.conversation
          .flatMap((turn) => {
            if (!turn || typeof turn !== "object") return [];
            const row = turn as { role?: unknown; content?: unknown };
            return row.role === "user" && typeof row.content === "string" ? [row.content] : [];
          })
          .join("\n");
        // TYPO_READING_ROUTES_ENABLED: the reader sees "dedcut" as deduct; the stored conversation stays as typed.
        const amount = payrollDeductAmount(await readingText(said));
        if (amount) {
          await applyStatedFacts(
            instanceId,
            { values: { [PAYROLL_DEDUCT_AMOUNT_KEY]: amount }, checked: {} },
            actor.id,
            PAYROLL_DEDUCT_AMOUNT_STATED_KEYS,
          );
        }
      }

      /*
       * THE TYPE OF WARNING, AS THE MANAGER STATED IT FOR THIS FORM IN CHAT.
       *
       * The same path as the payroll answer: the manager's own statement, only
       * where the pinned version offers that level, never a default. It is
       * written only when the conversation the card was built from is sent and,
       * re-read here, states the same level — a level the client asserts
       * without that conversation is dropped, and the box starts empty. See
       * `lib/forms/warning-level.ts`.
       */
      const warningLevel =
        isWarningLevel(card.warningLevel) &&
        card.source === "assistant" &&
        Array.isArray(card.conversation) &&
        warningLevelFromConversation(await readingTurns(parseHistory(card.conversation)), businessToday()) === card.warningLevel
          ? card.warningLevel
          : null;
      if (warningLevel) {
        const loaded = await loadInstance(instanceId);
        const offered = loaded
          ? (checkboxGroupsForVariant(parseFormDocument(loaded.version.document), loaded.instance.variantKey)
              .find((group) => group.key === WARNING_TYPE_KEY)
              ?.options.map((option) => option.key) ?? [])
          : [];
        await applyStatedFacts(
          instanceId,
          { values: {}, checked: warningLevelChecked(warningLevel, offered) },
          actor.id,
          WARNING_LEVEL_STATED_KEYS,
        );
      }
    }

    /*
     * ONE DRAFT PER FORM IN THIS CHAT (CONVERSATION_DRAFT_REUSE_ENABLED). A new
     * card for the same form and employee opens the draft this chat already
     * made, unless the manager asked for another document since. Before the
     * incident checks below, which one earlier "another" switches off for the
     * rest of the chat. See `conversation-draft.ts`.
     */
    /*
     * "DIFFERENT INCIDENT", answering whether this is the same incident as the
     * form on file (ported from the sibling app, QA F8): a new form, so no open
     * draft is reopened in its place. DRAFT_ACTIONS_ENABLED only. Read before
     * the chat's own draft too, so "different incident" is not folded into the
     * draft this chat already made when both flags are on.
     */
    const newIncident = draftActionsEnabled() && historySaysDifferentIncident(body.conversation);
    const draftChat =
      body.source === "assistant" && conversationDraftReuseEnabled() && !newIncident
        ? conversationKeyOf({ conversationId: body.conversationId, conversation: body.conversation })
        : null;
    const chatTurns = draftChat ? parseHistory(body.conversation) : [];
    if (draftChat) {
      // A guard that cannot read is no guard: the create goes ahead as before.
      const same = await findConversationDraft({
        createdBy: actor.id,
        templateKey: body.templateKey,
        employeeName: body.employeeName.trim().slice(0, 120),
        conversationKey: draftChat,
        turns: chatTurns,
        ...(sameChatOnly && cardDate ? { formDate: cardDate } : {}),
      }).catch(() => null);
      if (same) {
        /*
         * The facts said since that draft was made, then this card's own
         * stated answers where the draft is still blank — never over a value.
         */
        await applyTurnsSinceDraft({
          request,
          instanceId: String(same.instance.id),
          turns: chatTurns,
          lastTurnId: same.lastTurnId,
          today: businessToday(),
        }).catch(() => undefined);
        await applyCardFacts(String(same.instance.id)).catch(() => undefined);
        const updated = await loadInstance(String(same.instance.id)).catch(() => null);
        return reused(updated?.instance ?? same.instance);
      }
    }

    /*
     * SAME INCIDENT, NOT THE SAME PERSON. The card-id match above is unchanged.
     * This runs only when DRAFT_DEDUPE_ENABLED is on, and a different date or
     * a different account of what happened still creates a new draft.
     */
    const incidentKey =
      draftDedupeEnabled() && body.source === "assistant" && !newIncident
        ? incidentFingerprint({
            employeeName: body.employeeName,
            formDate: isIsoCalendarDate(body.formDate) ? body.formDate : null,
            text: incidentText(body.conversation, body.employeeName),
          })
        : null;
    if (incidentKey) {
      const resent = await findResentDraft({
        templateKey: body.templateKey,
        employeeName: body.employeeName.trim().slice(0, 120),
        createdBy: actor.id,
        incidentKey,
        ...(sameChat ? { sameChat } : {}),
      });
      if (resent) return reused(resent);
    }

    /*
     * The same incident, read from the draft's own narrative, after the
     * card-id match and the fingerprint miss. A different account, or a
     * request for a separate document, still creates.
     */
    const account =
      draftDedupeEnabled() && body.source === "assistant" && !newIncident && !historyWantsSeparateDocument(body.conversation)
        ? userIncidentAccount(body.conversation)
        : null;
    if (account) {
      const narrative = await findAccountResentDraft({
        templateKey: body.templateKey,
        employeeName: body.employeeName.trim().slice(0, 120),
        createdBy: actor.id,
        locationId,
        incident: account,
        formDate: isIsoCalendarDate(body.formDate) ? body.formDate : null,
        ...(sameChat ? { sameChat } : {}),
      });
      if (narrative) return reused(narrative);
    }

    /*
     * SAME EMPLOYEE, TEMPLATE, AND INCIDENT DATE, ACROSS CHATS. The card-id
     * match above stays first. This does not widen DRAFT_DEDUPE_ENABLED: a
     * different date, or a request for a separate document, still creates.
     * Off, this block does not run.
     */
    const crossChatDate = isIsoCalendarDate(body.formDate) ? body.formDate : null;
    if (
      crossChatDraftDedupeEnabled() &&
      body.source === "assistant" &&
      crossChatDate &&
      !newIncident &&
      !historyWantsSeparateDocument(body.conversation)
    ) {
      const open = await findCrossChatOpenDraft({
        templateKey: body.templateKey,
        employeeName: body.employeeName.trim().slice(0, 120),
        formDate: crossChatDate,
        ...(sameChat ? { sameChat } : {}),
      });
      if (open) return reused(open);
    }

    const instance = await createInstance({
      templateKey: body.templateKey,
      variantKey: body.variantKey ?? null,
      employeeName: body.employeeName.trim().slice(0, 120),
      employeeRole: body.employeeRole ?? null,
      locationId,
      locationName,
      createdBy: actor.id,
      createdByRole: actor.role,
      source: body.source === "assistant" ? "assistant" : "manual",
      // A real calendar day or nothing, in which case the form is dated today.
      formDate: isIsoCalendarDate(body.formDate) ? body.formDate : undefined,
      proposalId,
    });
    /* A concurrent press of the same card: its row, as it already is. See `cardInstanceId`. */
    if (instance.reused) return reused(instance);
    if (draftChat) {
      await noteConversationDraft(String(instance.id), draftChat, lastManagerTurnId(chatTurns)).catch(() => undefined);
    } else if (chatKey) {
      // Same chat only: the draft records its chat even with CONVERSATION_DRAFT_REUSE_ENABLED off.
      const turns = Array.isArray(body.conversation) ? parseHistory(body.conversation) : [];
      await noteConversationDraft(String(instance.id), chatKey, lastManagerTurnId(turns)).catch(() => undefined);
    }

    if (incidentKey) {
      await rememberDraftIncident({
        instanceId: String(instance.id),
        userId: actor.id,
        templateKey: body.templateKey,
        employeeName: body.employeeName.trim().slice(0, 120),
        incidentKey,
      });
    }

    await applyCardFacts(String(instance.id));

    return NextResponse.json({ instance });
  } catch (error) {
    return errorResponse(error, "forms/instances/create");
  }
}

function userIncidentAccount(conversation: unknown): string | null {
  if (!Array.isArray(conversation)) return null;
  const lines = conversation.flatMap((turn) => {
    if (!turn || typeof turn !== "object") return [];
    const row = turn as { role?: unknown; content?: unknown };
    return row.role === "user" && typeof row.content === "string" ? [row.content] : [];
  });
  const text = lines.join("\n").trim();
  return text || null;
}

function incidentText(conversation: unknown, employeeName: string): string {
  if (!Array.isArray(conversation)) return employeeName;
  const lines = conversation.flatMap((turn) => {
    if (!turn || typeof turn !== "object") return [];
    const row = turn as { role?: unknown; content?: unknown };
    return row.role === "user" && typeof row.content === "string" ? [row.content] : [];
  });
  return lines.join("\n") || employeeName;
}

/**
 * THE DEMO SWEEP — the one destructive action that runs without naming a row.
 *
 * It is therefore the most carefully bounded. `deleteDemoInstances` selects on
 * the `demo:` PROVENANCE PREFIX and on draft status, so a real record cannot be
 * in the set; and the caller sends the count it showed the person, so a list
 * that changed underneath aborts instead of deleting a different set than was
 * agreed to.
 *
 * A finalized demo form is not swept. The rule about signed documents does not
 * bend because the document happens to be synthetic — those are reported and
 * left for archiving.
 */
export async function DELETE(request: Request) {
  try {
    await authorizeForms(request, "manage_form_records");
    const { searchParams } = new URL(request.url);

    // Explicit and narrow: there is no "delete everything" shape of this call.
    if (searchParams.get("scope") !== "demo") {
      return NextResponse.json(
        { error: "This endpoint only removes demo records. Pass scope=demo." },
        { status: 400 },
      );
    }

    const expected = Number(searchParams.get("expected"));
    if (!Number.isInteger(expected) || expected < 0) {
      return NextResponse.json(
        { error: "Say how many forms you expect to remove." },
        { status: 400 },
      );
    }

    const result = await deleteDemoInstances(expected);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InstanceProtectedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return errorResponse(error, "forms/instances/demo-sweep");
  }
}


/**
 * ============================================================================
 * A SALON NAME NOBODY VERIFIED DOES NOT GO ON A LIVE HR RECORD
 * ============================================================================
 *
 * THE NAME FOLLOWS THE ID, AND IS DROPPED WHEN THE ID IS. A location id and a
 * display name must not become two independent authorities: a caller that sent
 * an unauthorized id with a plausible name would otherwise leave the name on
 * the record after the id was refused.
 *
 * AND IN LIVE MODE THE REQUEST'S NAME IS NEVER USED, even when the id beside
 * it survives. A `locationName` arriving here is either demo data or the id
 * again, and neither is bound to the validated location by anything
 * trustworthy. The name printed on the form is looked up from the production
 * roster by the VALIDATED ID, server-side; an id the roster does not know gets
 * no name. A wrong salon NAME on a disciplinary record is worse than no name.
 *
 * DEMO MODE KEEPS THE CALLER'S NAME, EXPLICITLY AS SYNTHETIC. Preview carries
 * the standing notice that only synthetic data belongs there, and nothing in
 * preview is an HR record.
 */
function resolveLocationName(
  locationId: string | null,
  requested: string | null,
): string | null {
  if (!locationId) return null;
  /*
   * THE ROSTER EXISTS NOW, so the name is what the paragraph above said it
   * would become: resolved SERVER-SIDE from the validated id, never read from
   * the request. `PRODUCTION_SALONS` is the production roster, validated
   * against reporting (`salonRosterMatches`). An id the roster does not know
   * gets no name rather than a guess, and a name the caller typed is still
   * ignored in live mode.
   */
  const rostered = salonById(locationId)?.name ?? null;
  if (!isDemoMode()) return rostered;
  return requested ?? rostered;
}

/**
 * TYPO_READING_ROUTES_ENABLED: the manager's words as the payroll-amount and
 * warning-level readers above see them, each typo read as the one known word
 * it can only be (`ai/typo-reading-copy.ts`). Only those readers get it; the
 * conversation stored and compared elsewhere in this route is the raw one.
 * Off, as given.
 */
async function readingText(text: string): Promise<string> {
  if (!typoReadingRoutesEnabled()) return text;
  return typoReadingText(text, await protectedNameWords());
}

async function readingTurns<T extends { role: string; content: string }>(turns: T[]): Promise<T[]> {
  if (!typoReadingRoutesEnabled()) return turns;
  return typoReadingTurns(turns, await protectedNameWords());
}
