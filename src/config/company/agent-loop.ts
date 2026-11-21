import type { AgentLoopContent, AppConfig, LoopWords, PolicyGuards } from "@/lib/ai/agent-loop/app-config";
import { COMPANY_METRIC_PHRASES } from "@/config/company/metric-words";

/**
 * ============================================================================
 * THIS COMPANY'S CONTENT FOR THE AGENT LOOP (the loop port, QA 21 Nov 2026)
 * ============================================================================
 *
 * The loop (`src/lib/ai/agent-loop/`) is mechanism, shared with the sibling app; what belongs to this company is here:
 * its rulings on JBA Policy Manual headings, its metrics, the page forms are listed on, who approves a termination, its
 * time zone and the example phrases the rules teach with. Written for this company from its own manual, metrics and
 * pages, never copied from the sibling app (CLAUDE.md: port the mechanism, never the content).
 *
 * PENDING PAU (QA2, 21 Nov 2026): which manual rulings apply here. Until then only the rules every Corrective Action
 * needs are given; the rest is empty or null, which leaves those rules out of the rules book (`rules-book.ts`).
 */

const metricList = COMPANY_METRIC_PHRASES.join(", ");

export function bubblesLoopContent({ place }: LoopWords): AgentLoopContent {
  return {
    notPeopleExamples: `${COMPANY_METRIC_PHRASES.slice(0, 3).map((phrase) => `"${phrase}"`).join(", ")} and other metrics`,
    // PENDING PAU: this company's own "Other" topics. A duty left undone that no section names is the general case.
    otherTopics: "a " + place + " duty left undone that no section names",
    // Pau's decision 1 (21 Nov 2026): no read_stats for now.
    statsReports: null,
    // PENDING PAU: who approves a termination here.
    terminationApproval: "DM/HR approval",
    timeZone: { label: "US Central time", short: "Central", abbrev: "CT" },
    whoRules: [],
    // PENDING PAU: which manual rulings apply to this company.
    policyRulings: [],
    sectionRulings: [],
    attendanceRules: [
      "Attendance: a Corrective Action citing Attendance always takes attendance (absence: a shift missed, as \"did not come in\", a no-show, a call-out; lateness: late, or left early; both: each) with attendance_evidence, the manager's words from this request that describe it, exactly as typed. A missed shift is an absence, never lateness. attendance_not_given or attendance_evidence_not_found means propose the card again with it.",
    ],
    underPerformanceReplies: [],
    metricsRule: `Metrics are kept exactly as the manager wrote them: ${metricList}, every number and the month. They are never people.`,
    volumeRule: null,
    statsGuideRule: null,
    examples: {
      addedTopic: "weekly coaching on add-on sales",
      addedTopicQuestion: "Who is this weekly add-on sales coaching for?",
      namedPolicy: "cite the dress code policy",
      misspelledPolicy: "ca for the dres code policy",
      formAbout: "the 10/31 one about restocking the shelves",
      spellingFixes: "\"restokcing\" → \"restocking\", \"custmer\" → \"customer\"",
      becausePlace: "late because of traffic on the highway",
      ruleInOtherSection: "insubordination is in the Standards of Conduct",
      approvedTermination: "my DM approved her termination",
      rewordNoLink: "\"didnt restock the shelves and left boxes in the back room\" is \"She did not restock the shelves. She left boxes in the back room.\"",
      policyLine: "Attendance Policy, JBA Policy Manual p.<page>",
      position: "who are my shift leads",
      howTo: "\"how do I close the register\", \"what's the opening checklist\"",
      businessDocs: "the " + place + " guides in the knowledge base",
    },
    toolExamples: {
      formAbout: "restocking the shelves",
      position: "shift leads",
      placesNamed: "\"<" + place + " name>\", \"<" + place + " code>\"",
    },
  };
}

/**
 * The manual headings this company's policy guards check (`tools.ts`, `policy-fit.ts`), as this app's own retrieval
 * names them (`lib/knowledge/ca-policy-retrieval.ts`). No said-only "Other" topic.
 */
export const BUBBLES_POLICY_GUARDS: PolicyGuards = {
  headings: { attendance: "Attendance", lateOpening: "Late Opening", conduct: "Standards of Conduct" },
  saidOnlyOther: null,
};

const escaped = (phrase: string): string => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

/** This company's metrics as managers write them (`config/company/metric-words.ts`), longest first. */
export const BUBBLES_METRICS: AppConfig["metrics"] = {
  account: new RegExp(
    String.raw`\b(?:${[...COMPANY_METRIC_PHRASES].sort((a, b) => b.length - a.length).map(escaped).join("|")})(?=\W|$)`,
    "gi",
  ),
  spelledOut: [],
};
