import type { ClaudeTurn } from "@/lib/ai/call-claude";
import { classifyPerformanceManagementIntent } from "@/lib/ai/performance-management-gate";
import type { ManualBrandScope } from "@/lib/knowledge/brand-sections";
import type { KnowledgeDocumentRole } from "@/lib/knowledge/document-roles";
import type { NamedHandbookConfig } from "@/lib/knowledge/named-handbook";

/**
 * ============================================================================
 * BUFF CITY SOAP — KNOWLEDGE CONFIGURATION
 * ============================================================================
 *
 * WHERE KNOWLEDGE COMES FROM. Every source feeds the same ingestion pipeline
 * (extract → chunk → embed → pgvector) and the same retrieval, so a document
 * from Woven and one uploaded by hand are indistinguishable when an answer
 * cites them. The source list is descriptive: whether a source is LIVE is
 * decided by its own environment switches, and the Integrations screen reports
 * that honestly.
 */
export const KNOWLEDGE_SOURCES = [
  {
    id: "upload",
    label: "Uploaded documents",
    description: "PDF, DOCX, TXT and Markdown uploaded by a knowledge manager.",
  },
  {
    id: "woven",
    label: "Woven",
    description:
      "Published, company-wide Woven policies, handbooks, procedures, files and knowledge elements. Off until WOVEN_KNOWLEDGE_SYNC_ENABLED and the Woven Team credentials are set.",
  },
] as const;

/**
 * ============================================================================
 * PINNED DOCUMENTS — reasoning rules that must not be left to similarity
 * ============================================================================
 *
 * Some documents are RULES rather than evidence — an escalation policy, an
 * approved progression — and an answer that needs them must have them, not
 * merely whichever chunk ranked. A pinned role names the document (by tag,
 * with filename/title fallbacks), the sections that must all be present, and
 * the questions that need it:
 *
 *   triggers         questions that pin this document
 *   onUnavailable    "refuse": the turn is answered with `unavailableMessage`
 *                    and the model is never called; "degrade": the answer
 *                    proceeds without it
 *
 * EMPTY FOR BUFF CITY SOAP. No Buff document has been identified as a rule
 * document yet. Add one here when it is; nothing else needs to change.
 */
export interface PinnedKnowledgeRole {
  readonly role: KnowledgeDocumentRole;
  readonly triggers: readonly RegExp[];
  /**
   * A classifier that decides instead of `triggers`, for a role whose gate is
   * more than a word list (the Performance Management Framework's).
   */
  readonly isWanted?: (input: { question: string; history: readonly ClaudeTurn[] }) => boolean;
  readonly onUnavailable: "refuse" | "degrade";
  readonly unavailableMessage: string;
}

export const PINNED_KNOWLEDGE_ROLES: readonly PinnedKnowledgeRole[] = [
  {
    /*
     * THE CORRECTIVE-ACTION LADDER, AS THE REFERENCE PLATFORM PINS IT. A
     * question about progression ("what comes after coaching?", "what is
     * corrective action?") is answered from the Performance Management
     * Framework or not at all: the gate is the reference platform's own
     * classifier, and the answer FAILS CLOSED when the document is absent,
     * because a plausible general-HR progression is the wrong thing to act on.
     * A request to CREATE a form is answered from the forms library before
     * this runs.
     */
    get role() {
      return PERFORMANCE_MANAGEMENT_FRAMEWORK;
    },
    triggers: [],
    isWanted: (input) => classifyPerformanceManagementIntent(input).active,
    onUnavailable: "refuse",
    unavailableMessage:
      "The Performance Management Framework that defines our corrective-action progression is currently unavailable, so I won't set out the steps or tell you which one applies — a plausible-sounding sequence that is not our company's is the wrong thing to act on, and nothing was answered from memory. Ask an administrator to check that the framework document is present and indexed in the Knowledge Base. I can still tell you which forms exist and create one for you if you know which you need.",
  },
];

/**
 * ============================================================================
 * A HANDBOOK THE QUESTION NAMES — read whole by identity, not by similarity
 * ============================================================================
 *
 * When a question names the company's handbook ("what's in the Buff team
 * handbook?", "what does the handbook say about breaks?"), the platform pins
 * its table of contents or the sections whose printed headings match, instead
 * of hoping one of its many chunks ranks. See `lib/knowledge/named-handbook.ts`.
 *
 *   identity   how the document is recognised: a tag (preferred), then a
 *              file-name or title prefix
 *   namedBy    patterns that must ALL match for a question to name it
 *   notATopic  the company's own words that are never a section topic
 *
 * NULL FOR BUFF CITY SOAP. No Buff handbook has been supplied. When one is,
 * tag it (e.g. "team-handbook") and fill this in; nothing else needs to change.
 */
/**
 * THE JBA POLICY MANUAL, NAMED IN A QUESTION. "What does the JBA Policy
 * Manual say about attendance?" reads the manual by identity and pins its
 * table of contents or the matching sections, exactly as the reference
 * platform does: "JBA" or "JB & Associates", plus "manual" or "handbook".
 * Its text arrives as Buff City Soap reads it (`POLICY_MANUAL_BRAND_SCOPE`).
 * The identity matches the forms' official manual (`official-policy-manual.ts`).
 */
export const NAMED_HANDBOOK: NamedHandbookConfig | null = {
  identity: {
    tag: "official-policy-manual",
    fallbackFilenames: ["JBA-Policy-Manual", "2025-JBA-Policy-Manual"],
    fallbackTitles: ["JBA Policy Manual", "2025 JBA Policy Manual"],
  },
  namedBy: [/\b(?:jba|jb\s*(?:&|and)\s*associates)\b/i, /\b(?:manual|handbook)\b/i],
  notATopic: ["jba", "jb", "associates", "buff", "city", "soap", "bcs"],
};

/*
 * ============================================================================
 * THE PERFORMANCE MANAGEMENT FRAMEWORK — the corrective-action ladder
 * ============================================================================
 *
 * Ported unchanged (rule groups, headings, cap) from the reference platform.
 * Forms drafting fails closed without it: the Corrective Action Form, the
 * Policy Review, the EPPs and the Follow-Up Coaching Form are governed by it
 * (`lib/forms/pm-governance.ts`). Not pinned into ordinary chat answers here.
 * The document itself is company knowledge, uploaded and tagged
 * `performance-management-framework` by a knowledge manager.
 */
/**
 * ============================================================================
 * THE PERFORMANCE MANAGEMENT FRAMEWORK
 * ============================================================================
 *
 * THE THIRD ROLE, AND THE ONE THAT WAS MISSING WHILE ITS SUBJECT WAS THE WHOLE
 * COMPLAINT. Corrective action is the most consequential thing a manager asks
 * Ask Bubbles about, and until now the document that defines it was an ordinary
 * document: pinned by nothing, identified by nothing, present in an answer only
 * if one of its two thousand lines happened to rank in the top fourteen.
 *
 * WHY IT IS A DIFFERENT DOCUMENT FROM THE EMPLOYEE PERFORMANCE FRAMEWORK, and
 * why the two are not one role with two names. They answer different questions
 * and either can be needed without the other:
 *
 *   EMPLOYEE PERFORMANCE FRAMEWORK   how to read an individual's METRICS and
 *                                    turn them into a coaching priority. Its
 *                                    guard is "never escalate on a number
 *                                    alone".
 *
 *   PERFORMANCE MANAGEMENT FRAMEWORK what the PROGRESSION is and how each of
 *                                    its documents is completed. Its guard is
 *                                    the ladder itself — that coaching comes
 *                                    before a plan, a plan before a warning,
 *                                    and that termination, demotion,
 *                                    suspension and any sensitive matter go to
 *                                    leadership rather than to a manager and an
 *                                    assistant.
 *
 * "Who should I coach from this report?" needs the first. "What is our
 * corrective action process?" needs the second. "Sarah has not improved after
 * coaching — what now?" needs both, which is why the roles stack rather than
 * exclude.
 *
 * ============================================================================
 * IT FAILS CLOSED, AND THE RUNGS ARE WHY
 * ============================================================================
 *
 * An answer about corrective action assembled without this document is not a
 * worse answer, it is a differently dangerous one: it will describe a
 * progression, because progressions are the kind of thing a language model
 * knows about, and the progression it describes will be a plausible general-HR
 * one rather than the company's. A manager who skips a rung because Bubbles
 * omitted it has taken a step that the company's own sequence does not support.
 *
 * WHAT KEEPS THAT FROM BLOCKING ORDINARY WORK is the narrowness of the gate
 * rather than any softness here — see `performance-management-gate.ts`. A
 * documentary lookup ("what does the disciplinary policy say?") does not fire
 * it, and a request to CREATE a corrective action is answered from the Forms
 * library before retrieval runs at all.
 *
 * ============================================================================
 * THE RULE GROUPS ARE THE FRAMEWORK'S OWN SECTION HEADINGS
 * ============================================================================
 *
 * Verified against the supplied `.txt` through the same extractor the ingestion
 * pipeline uses: `extractFromString` splits on Markdown ATX headings and makes
 * the heading text the chunk's locator, so `## SECTION 2 – PERFORMANCE
 * MANAGEMENT LADDER` becomes that locator exactly and `headingKey` reduces it
 * to `performance management ladder` — the `SECTION n –` prefix and the en dash
 * both absorbed.
 *
 * The sub-section spellings are listed alongside each section heading as
 * ALTERNATIVES, because the framework's rungs and rules live under `### 2.3
 * Role Play`-style headings of their own, and which of them a re-export
 * preserves is not something this file should depend on. Any one satisfies its
 * group; the round-robin cap then spreads the pinned chunks across groups so a
 * long section cannot crowd out a short one.
 */
export const PERFORMANCE_MANAGEMENT_FRAMEWORK: KnowledgeDocumentRole = {
  id: "performance_management_framework",
  tag: "performance-management-framework",
  fallbackFilenames: [
    "PERFORMANCE_MANAGEMENT_FRAMEWORK_KB_TEXT.txt",
    "PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT.txt",
  ],
  fallbackTitles: [
    "PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
    "PERFORMANCE MANAGEMENT FRAMEWORK",
    "Performance Management Framework",
  ],
  /*
   * ==========================================================================
   * TWELVE REQUIRED GROUPS, EVERY HEADING READ OFF THE REAL EXTRACTED CORPUS
   * ==========================================================================
   *
   * NOT GUESSED. The uploaded framework was run through `extractFromString` —
   * the same extractor the ingestion pipeline uses — and it produces 92
   * segments whose locators are the heading texts below, verbatim.
   *
   * THAT EXERCISE FOUND A TRAP WORTH RECORDING. Six of the ten `## SECTION n`
   * headings produce NO CHUNK AT ALL: where a section heading is followed
   * immediately by its first `### n.1` sub-heading, the extractor flushes an
   * empty buffer and emits nothing. So "SECTION 3 – COACHING FRAMEWORK",
   * "SECTION 5 – EPP FRAMEWORK", "SECTION 6 – DPOA FRAMEWORK" and
   * "SECTION 8 – FOLLOW-UP DOCUMENTATION FRAMEWORK" are locators that do not
   * exist in the index, while SECTION 2, 7 and 9 do, because those three carry
   * introductory prose before their first sub-heading.
   *
   * An earlier version of this role listed the four absent ones first in their
   * groups. Every group still resolved — through the sub-section alternatives
   * listed beside them — so the role reported healthy and the omission was
   * invisible. That is precisely the failure mode the group mechanism exists to
   * catch, and it survived only by luck. Each group below now leads with a
   * locator that the extractor genuinely produces.
   *
   * WHY THESE TWELVE. Each is a rule the system RELIES ON somewhere else, so
   * losing one silently would make another part of the product unsafe rather
   * than merely less good:
   *
   *   the classification and the lowest-rung rule    the Follow-Up Coaching
   *                                                  Next Step guard reasons
   *                                                  with them
   *   the leadership escalation rule                 the DPOA sensitive-action
   *                                                  guard depends on it
   *   the exact-policy rule                          the policy-grounded fields
   *                                                  fail closed against it
   *   the ladder                                     every rung answer
   *   the final operating rule                       the reasoning ORDER, which
   *                                                  §10.7 states explicitly
   */
  ruleGroups: [
    {
      /*
       * The preamble, whose locator is the document's own title heading — one
       * of the locators that DOES exist, because the framework opens with
       * prose. It carries the LEADERSHIP ESCALATION RULE: that any termination,
       * demotion, suspension or sensitive employee matter goes to the company
       * leadership process and that Ask Bubbles never replaces DM, HR or LP
       * approval. §2.8 restates it as a rung.
       */
      id: "escalation_authority",
      label: "the leadership escalation rule and the framework's own terms",
      headings: [
        "PERFORMANCE MANAGEMENT FRAMEWORK",
        "ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK",
        "2.8 Further Leadership Review",
      ],
    },
    {
      /*
       * SECTION 2's own heading exists, and its intro is where the
       * lowest-appropriate-level rule and the "the ladder is not automatic"
       * exception both live.
       */
      id: "escalation_ladder",
      label: "the performance management ladder — the order the steps come in",
      headings: [
        "SECTION 2 – PERFORMANCE MANAGEMENT LADDER",
        "2.1 Observation",
        "2.2 Coaching",
        "2.3 Role Play",
        "2.4 Follow-Up Coaching",
        "2.5 Employee Performance Plan (EPP)",
        "2.6 Follow-Up Review",
        "2.7 Disciplinary Plan of Action (DPOA)",
      ],
    },
    {
      /*
       * The lowest-appropriate-rung rule, required as a group of its own rather
       * than left to the ladder group. The ladder group is satisfied by any one
       * of eight rungs, so a re-upload could keep "2.3 Role Play" and lose the
       * section intro that says to solve the issue at the lowest appropriate
       * level — and the ladder would still report present.
       */
      id: "lowest_appropriate_rung",
      label: "the rule that an issue is solved at the lowest appropriate level",
      headings: [
        "SECTION 2 – PERFORMANCE MANAGEMENT LADDER",
        "10.7 Final operating rule for Ask Bubbles",
      ],
    },
    {
      /*
       * §4.3 is the classification with its signs and its responses; §1.4
       * carries the same six categories mapped to first responses. Either
       * satisfies the group, and the guard that chooses a Next Step reasons
       * with whichever arrives.
       */
      id: "issue_classification",
      label: "root-cause classification — skill, knowledge, confidence, effort, policy, leadership",
      headings: [
        "4.3 Root cause identification",
        "1.4 Difference between performance issues and behavior issues",
        "4.2 How to prepare for difficult conversations",
      ],
    },
    {
      id: "management_diamond",
      label: "the Management Diamond and difficult-conversation reasoning",
      headings: [
        "4.1 Purpose of the Management Diamond",
        "4.2 How to prepare for difficult conversations",
      ],
    },
    {
      id: "coaching_framework",
      label: "how a coaching form is completed and how observations are documented",
      headings: [
        "3.1 How coaching forms should be completed",
        "3.2 Coaching conversation structure",
        "3.3 How observations should be documented",
      ],
    },
    {
      id: "epp_routing",
      label: "when an Employee Performance Plan is created and how it is structured",
      headings: [
        "5.1 When an EPP should be created",
        "5.3 How EPPs should be structured",
        "9.7 Template: Should this employee be on an EPP?",
      ],
    },
    {
      id: "dpoa_routing",
      /*
       * THE HEADINGS BELOW ARE THE CORPUS'S OWN and are never renamed here:
       * they are matched against the locators the extractor produces from the
       * approved framework, so "6.2 When a DPOA should be used" has to say
       * exactly that for as long as the document does. The LABEL is ours, and
       * it follows the business's current terminology.
       */
      label: "when accountability escalates to a Corrective Action Form",
      headings: [
        "6.2 When a DPOA should be used",
        "6.1 When accountability should escalate",
        "9.8 Template: Should this employee be on a DPOA?",
      ],
    },
    {
      /*
       * §6.4 is where the framework says Ask Bubbles must not invent a policy
       * title or manual page and must ask for the exact reference instead. The
       * policy-grounded fields on the Corrective Action Form and the Policy
       * Review fail closed against exactly this rule, so its absence would
       * leave that behaviour
       * unexplained by any source in the prompt.
       */
      id: "exact_policy_verification",
      label: "the rule that an exact policy reference is verified, never invented",
      headings: ["6.4 DPOA documentation expectations"],
    },
    {
      id: "follow_up_documentation",
      label: "the follow-up documentation rules",
      headings: [
        "8.1 Purpose of follow-up documentation",
        "8.2 Follow-up coaching note template",
      ],
    },
    {
      id: "manager_self_check",
      label: "the manager self-check before anything is said or sent",
      headings: ["10.6 Manager self-check before sending or saying anything"],
    },
    {
      /*
       * The REASONING ORDER, and the one group whose heading is unique in the
       * document: identify, classify, lowest appropriate rung, observable
       * behaviour, impact, exact language, role-play where the issue is skill or
       * confidence, follow up every time, escalate only where supported.
       */
      id: "final_operating_rule",
      label: "the final operating rule — the order the reasoning happens in",
      headings: ["10.7 Final operating rule for Ask Bubbles"],
    },
  ],
  /*
   * Sixteen, against twelve groups. Enough for every group to contribute one
   * chunk and for the ladder to contribute several, and a ceiling that keeps
   * the prompt a property of THIS FILE rather than of whatever was last
   * uploaded. Applied round-robin, so a long section cannot crowd out a short
   * one and leave the set looking complete.
   */
  maxMandatoryChunks: 16,
};

/*
 * ============================================================================
 * THE JBA POLICY MANUAL, READ AS BUFF CITY SOAP
 * ============================================================================
 *
 * The manual covers every brand JB & Associates operates. Ask Bubbles reads
 * the company-wide sections and the Buff City Soap ones; another brand's
 * sections, labelled blocks and bullets are left out of retrieval, of the
 * named-handbook coverage and of every policy citation on a form
 * (`lib/knowledge/brand-sections.ts`). What is kept is verbatim.
 *
 * Every heading below is the manual's own (JBA Policy Manual, revised May
 * 2025). The brand names are regular-expression sources.
 */

/** Documents this scope applies to: the multi-brand JBA manual, by title. */
export const MULTI_BRAND_MANUAL_TITLES: readonly RegExp[] = [/\bJBA\s+Policy\s+Manual\b/i];

export const POLICY_MANUAL_BRAND_SCOPE: ManualBrandScope = {
  otherBrands: [String.raw`Sun\s+Tan\s+City`, String.raw`STC`, String.raw`Crunch(?:\s+Fitness)?`],
  keptLabels: [
    String.raw`Buff\s+City\s+Soap`,
    String.raw`BCS`,
    String.raw`Corporate\s+Office`,
    String.raw`JB\s+&\s+Associates\s+Office`,
    String.raw`All\s+Locations(?:\s+Dress\s+Code)?`,
  ],
  excludedSections: [
    // "Buddy Passes (<tanning brand> Employees ONLY)", p.44.
    /^Buddy Passes \(.*\bONLY\)$/i,
    // "Client Tanning Policies and Regulations (STC & Crunch ONLY)", p.48–50, and its sub-sections.
    /^Client Tanning Policies and Regulations \(.*\bONLY\)$/i,
    /^Protecting the Client from Overexposing$/i,
    /^Consent Forms \(New Client Release Forms\)$/i,
    /^Eye Protection$/i,
    /^VersaSpa® Recommendations$/i,
    /^Tanning While Pregnant$/i,
    /^Tanning with Skin Cancer$/i,
    /^Minors$/i,
    /^Children Left Unattended$/i,
    /^One Tanner per Room$/i,
  ],
  // The tanning brand's dress-code sub-heading, inside that brand's block.
  subHeadings: [/^Tanning$/i],
  otherBrandPassages: [
    // Under "Employee Discounts": the employee tanning-privilege rules.
    /^Please keep in mind that The Company preaches tanning in moderation/i,
  ],
};
