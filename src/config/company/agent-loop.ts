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
 * Pau's rulings (via QA2, 21 Nov 2026): the general rulings on the shared JBA Policy Manual apply here; the sibling app's
 * tanning-specific ones (its "Other" topics, its metrics, "Under Performance") do not. A null rule is left out of the
 * rules book (`rules-book.ts`).
 */

const metricList = COMPANY_METRIC_PHRASES.join(", ");

export function bubblesLoopContent({ place, staff }: LoopWords): AgentLoopContent {
  return {
    notPeopleExamples: `${COMPANY_METRIC_PHRASES.slice(0, 3).map((phrase) => `"${phrase}"`).join(", ")} and other metrics`,
    // Pau via QA2 (21 Nov 2026): no "Other" topics of this company's own; "Other" only when no section covers it.
    otherTopics: null,
    // Pau's decision 1 (21 Nov 2026): no read_stats for now.
    statsReports: null,
    // Pau via QA2 (21 Nov 2026): the same approval as the sibling app.
    terminationApproval: "DM/HR approval",
    timeZone: { label: "US Central time", short: "Central", abbrev: "CT" },
    whoRules: [],
    // Pau via QA2 (21 Nov 2026): the general rulings on the shared JBA Policy Manual apply here; tanning-specific ones do not.
    policyRulings: [
      "The policy fits WHAT HAPPENED, not the words around it: a coat or the wrong top during a shift is dress code; failing to open on time is late opening; a missed shift or lateness is attendance.",
      "Clocking out early or leaving before the end of the scheduled shift is Attendance (knowing the work schedule and being on time). The " + place + " closed early or closing duties done before close are part of that same offense, so it is still Attendance alone, with the closing detail kept in the account.",
      "Staying after hours, or clocking out more than fifteen minutes after the end of the scheduled shift without a manager's approval, is the manual's Time Records section (Timekeeping & Payroll), never Attendance.",
      "Late FOR a shift (\"late for her opening shift\", the employee arrived late) is Attendance; \"late to open\", the " + place + " opening late (doors opened late, failure to open) is Late Opening.",
      "A guest or customer complaint about the employee's conduct is the Standards of Conduct.",
      "Underperformance against sales or performance targets is the Standards of Conduct.",
    ],
    sectionRulings: [
      "An animal anywhere in an at-work sentence (a pet, a dog in the " + place + ", an animal brought to work) is Animals in the Workplace.",
      "Each of these has its own section; read it and cite it: a wet floor with no wet floor sign, a long or extra break, social media posts about work, harassment, pets and animals, theft, cash handling, insubordination.",
      "The Standards of Conduct: assigned work or training not finished by its deadline (" + staff + " training, acknowledgements, assigned courses); leaving the register or work area unattended during the shift (never Attendance); a sale rung up wrong (wrong items or prices); a short drawer or register (never Handling Theft unless the manager says theft).",
    ],
    attendanceRules: [
      "Attendance: a Corrective Action citing Attendance always takes attendance (absence: a shift missed, as \"did not come in\", a no-show, a call-out; lateness: arrived late; left_early: left before the shift ended, as \"left early\", \"left before close\", \"walked out mid-shift\"; both: an absence and lateness) with attendance_evidence, the manager's words from this request that describe it, exactly as typed. A missed shift is an absence, and leaving early is left_early: neither is ever lateness. attendance_not_given or attendance_evidence_not_found means propose the card again with it. When the manager's words say no kind (\"violating attendance policy\" alone), never pass one and never hold the card for it: the card is made, and its attendance_not_said fact gives the one question to ask beside the card, once (asked_before: do not ask again).",
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
/*
 * THE LOOP'S JOB TITLES: Buff City Soap's own Woven positions (QA2 for Pau, 21 Nov 2026, read from
 * employee_access_directory + woven_position_map), with the short forms managers type for them ("GM", "AGM", "DM",
 * "store manager" for the General Manager). The loop reads a title only from this list, so a position this company
 * does not have is never read as one, never spelled out and never written on a card. Most specific first, so "assistant
 * general manager" is not read as "general manager" and "team member part time" not as "team member". The older chat
 * path still reads `config/company/job-titles.ts` (changed separately, per Pau).
 */
export const BUBBLES_LOOP_JOB_TITLES: AppConfig["jobTitleList"] = [
  { pattern: /\b(?:seasonal team members?(?: part[- ]time)?|part[- ]time seasonal team members?)\b/i, title: "Seasonal Team Member Part Time" },
  { pattern: /\b(?:team members? part[- ]time|part[- ]time team members?)\b/i, title: "Team Member Part Time" },
  { pattern: /\b(?:team members? full[- ]time|full[- ]time team members?)\b/i, title: "Team Member Full Time" },
  { pattern: /\b(?:agms?|assistant general managers?|assistant (?:store )?managers?|asms?)\b/i, title: "Assistant General Manager" },
  { pattern: /\b(?:gms?|general managers?|store managers?)\b/i, title: "General Manager" },
  { pattern: /\b(?:dms?|district managers?)\b/i, title: "District Manager" },
  { pattern: /\b(?:hr generalists?|human resources generalists?)\b/i, title: "Human Resources Generalist" },
  { pattern: /\bpayroll administrators?\b/i, title: "Payroll Administrator" },
  { pattern: /\bmaintenance team\b/i, title: "Maintenance Team" },
  { pattern: /\boperators?\b/i, title: "Operator" },
  { pattern: /\bowners?\b/i, title: "Owner" },
];

/*
 * THE FRONTLINE ROLE'S EVERYDAY WORDS (Pau via QA2, 21 Nov 2026): "team member", "staff" and "employee" all mean the
 * frontline role (Woven: Team Member Part Time / Full Time / Seasonal Team Member Part Time). They are never read as a
 * title of their own (so never "a different title" from Woven's, and never written as someone's Position) and never as
 * a person; typed beside a name ("team member Remy", "my staff, Remy") they are taken off it like a title.
 */
export const BUBBLES_LOOP_ROLE_WORDS = /\b(?:team members?|staff(?: members?)?|employees?)\b/i;

export const BUBBLES_POLICY_GUARDS: PolicyGuards = {
  headings: { attendance: "Attendance", lateOpening: "Late Opening", conduct: "Standards of Conduct" },
  saidOnlyOther: null,
  // Pau via QA2 (21 Nov 2026): no "Other" topics here; a cleaning duty is read under the heading that fits it.
  cleaningDutyIsOther: false,
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
