/**
 * ============================================================================
 * WHAT THE MANAGER KNOWS, AND HOW THEY KNOW IT
 * ============================================================================
 *
 * An HR record is read later by people who were not there, and the first
 * thing they need from it is the STANDING of each statement:
 *
 *   reported allegation   somebody told the manager ("a client said she was
 *                         rude") — true that it was reported, not yet that
 *                         it happened;
 *   manager observation   the manager saw or heard it themselves;
 *   documented evidence   a recording, a receipt, a written statement, a
 *                         witness — only the evidence the manager names;
 *   confirmed incident    the manager says it was confirmed, verified, or
 *                         admitted;
 *   prior actions         earlier coaching or discipline, as the manager
 *                         gave it (held separately by `prior-actions.ts`).
 *
 * A draft that turns "a client complained that" into "she was rude to a
 * client", or adds "as shown on the camera footage", or "she admitted", has
 * changed what the record proves. So:
 *
 *   1. THE RULES (`EVIDENCE_BASIS_RULES`) ask for each statement to keep the
 *      standing the manager gave it, in every drafting and revision prompt.
 *   2. THE GUARD (`guardEvidenceBasis`) runs on what came back, because a
 *      prompt is a request and not a boundary. A sentence that names a kind
 *      of evidence, or a confirmation, admission or finding, that the
 *      manager's own words never mention is removed — never reworded. The
 *      rest of the field stands.
 *   3. THE CHECK (`reportedOnly` / `carriesAttribution`) says out loud when
 *      the manager relayed only what they were told, and nothing in the draft
 *      says it was reported. That is a notice to the manager, not a block:
 *      they decide how the record reads.
 *
 * Pure and browser-safe.
 */

/** Rules every drafting and revision prompt carries. */
export const EVIDENCE_BASIS_RULES: readonly string[] = [
  "Keep the standing of every statement exactly as the manager gave it.",
  'Something the manager was told by someone else — a client complaint, a coworker\'s report — is written as a report ("A client reported that …"), never as something that is established to have happened.',
  "Something the manager saw or heard themselves is written as what they observed.",
  "Mention a recording, camera footage, a photo, a receipt, a written statement, a witness or any other evidence only if the manager mentioned it. Never add evidence.",
  "Say that something was confirmed, verified, admitted, acknowledged or found by an investigation only if the manager said so.",
];

/**
 * KINDS OF EVIDENCE. A sentence naming one survives only where the manager's
 * words name the same kind (`family`).
 *
 * Two sorts. Some phrases are evidence wherever they appear — footage, a
 * witness, a written statement. Others are ordinary words in a coaching
 * sentence ("reply to guest emails within a day", "give every guest a
 * receipt") and count as evidence only beside wording that presents them as
 * proof (`EVIDENTIARY`): "the receipts show", "caught on", "according to the
 * time clock".
 */
const EVIDENTIARY =
  /\b(?:show(?:s|ed|n)?|captur\w*|caught|reveal\w*|indicat\w*|prov\w*|evidence[ds]?|document(?:s|ed|ation)|according\s+to|per\s+the|reviewed|records?\s+show|on\s+(?:camera|video|tape))\b/i;

const EVIDENCE: readonly { pattern: RegExp; family: RegExp; contextual?: true }[] = [
  {
    pattern: /\b(?:video|camera|cameras|footage|surveillance|cctv|recording|recorded on)\b/i,
    family: /\b(?:video|camera|cameras|footage|surveillance|cctv|record(?:ing|ed))\b/i,
  },
  { pattern: /\bscreenshots?\b/i, family: /\bscreenshots?\b/i },
  {
    pattern: /\b(?:written|signed)\s+statements?\b|\bstatements?\s+from\b/i,
    family: /\bstatements?\b/i,
  },
  { pattern: /\bwitness(?:es|ed)?\b|\beye-?witness\b/i, family: /\bwitness\w*\b|\bsaw it\b/i },
  { pattern: /\b(?:photos?|photographs?|pictures?)\b/i, family: /\b(?:photos?|photographs?|pictures?|pics?)\b/i, contextual: true },
  { pattern: /\breceipts?\b/i, family: /\breceipts?\b/i, contextual: true },
  {
    pattern: /\b(?:time\s?cards?|time\s?clock|punch(?:es)?\s+records?|clock-?in\s+records?)\b/i,
    family: /\b(?:time\s?cards?|time\s?clock|punch\w*|clock(?:ed)?[- ]?(?:in|out))\b/i,
    contextual: true,
  },
  { pattern: /\b(?:POS|register)\s+(?:reports?|records?|data|logs?)\b/i, family: /\b(?:POS|register)\b/i, contextual: true },
  { pattern: /\btext\s+messages?\b|\btexts\b/i, family: /\btext(?:s|ed| messages?)?\b/i, contextual: true },
  { pattern: /\bemails?\b/i, family: /\be-?mail(?:s|ed)?\b/i, contextual: true },
  { pattern: /\bsocial\s+media\s+posts?\b/i, family: /\bsocial\s+media|\bpost(?:s|ed)?\b/i, contextual: true },
  { pattern: /\b(?:audit|cash\s+count|drawer\s+count)\b/i, family: /\baudit\w*|\bcount\w*\b/i, contextual: true },
];

/**
 * CERTAINTY AND FINDINGS. A sentence saying the matter was confirmed,
 * admitted or found survives only where the manager's words say the same kind
 * of thing.
 */
const CERTAINTY: readonly { pattern: RegExp; family: RegExp }[] = [
  { pattern: /\b(?:confirmed|confirms|confirmation)\b/i, family: /\bconfirm\w*/i },
  { pattern: /\b(?:verified|verifies)\b/i, family: /\bverif\w*/i },
  { pattern: /\b(?:proven|proved|proves)\b/i, family: /\bprov(?:en|ed|es|e)\b/i },
  { pattern: /\bsubstantiated\b/i, family: /\bsubstantiat\w*/i },
  { pattern: /\b(?:admitted|admits|admission)\b/i, family: /\badmi(?:t|tted|ts|ssion)\b|\bowned up\b|\bsaid (?:she|he|they) did\b/i },
  { pattern: /\b(?:confessed|confesses|confession)\b/i, family: /\bconfess\w*/i },
  { pattern: /\backnowledged\b|\backnowledges\b/i, family: /\backnowledg\w*|\bagreed\b|\bowned up\b/i },
  {
    pattern: /\binvestigation\s+(?:found|determined|showed|confirmed|concluded|revealed)\b/i,
    family: /\binvestigat\w*/i,
  },
  {
    pattern: /\b(?:it\s+was|has\s+been|was)\s+(?:found|determined|established)\s+that\b/i,
    family: /\b(?:found|determined|established)\b/i,
  },
  { pattern: /\b(?:conclusively|undeniabl[ey]|beyond\s+(?:any\s+)?doubt)\b/i, family: /\b(?:conclusive\w*|undeniabl\w*|no doubt)\b/i },
];

/** Somebody else told the manager. */
const REPORTED = [
  // Third parties only: the employee's own explanation ("she said her car
  // broke down") is not an allegation about them.
  /\b(?:client|customer|guest|co-?worker|team\s?member|employee|staff(?:\s+member)?|associate|manager|someone|somebody|people|another|witness)s?\s+(?:said|says|told|tells|reported|reports|complained|complains|claimed|claims|alleged|alleges|mentioned|stated|accused)\b/i,
  /\b(?:complaint|complaints|allegation|allegations|reportedly|allegedly|accused|rumou?rs?)\b/i,
  /\b(?:i|we)\s+(?:was|were|have\s+been|got)\s+told\b/i,
  /\b(?:i|we)(?:'ve|\s+have)?\s+heard\s+(?:that|from|about)\b/i,
  /\baccording\s+to\b/i,
];

/** The manager saw it, or established it, themselves. */
const FIRST_HAND = [
  /\b(?:i|we)\s+(?:saw|see|observed|watched|witnessed|noticed|caught|found|checked|confirmed|verified|reviewed)\b/i,
  /\b(?:i|we)\s+heard\s+(?:her|him|them|it)\b/i,
  /\bin\s+front\s+of\s+me\b/i,
];

/** Wording that says a statement is a report. */
const ATTRIBUTION =
  /\b(?:report(?:ed|s)?|complain(?:ed|t|ts)?|alleg(?:ed|ation|ations|es|edly)|according\s+to|said|stated|told|claim(?:ed|s)?|raised\s+(?:a\s+)?concerns?|concerns?\s+(?:was|were)\s+raised|accus(?:ed|ation))\b/i;

/** True when the manager relayed what somebody told them, and nothing they saw themselves. */
export function reportedOnly(notes: string): boolean {
  return REPORTED.some((pattern) => pattern.test(notes)) && !FIRST_HAND.some((pattern) => pattern.test(notes));
}

/** True when a drafted text says, anywhere, that what it describes was reported. */
export function carriesAttribution(text: string): boolean {
  return ATTRIBUTION.test(text);
}

/** The claims in one sentence that the manager's words do not support. */
export function unsupportedEvidence(sentence: string, source: string): string[] {
  const missing: string[] = [];
  for (const entry of EVIDENCE) {
    const match = entry.pattern.exec(sentence);
    if (!match || entry.family.test(source)) continue;
    if (entry.contextual && !EVIDENTIARY.test(sentence)) continue;
    missing.push(match[0]);
  }
  for (const entry of CERTAINTY) {
    const match = entry.pattern.exec(sentence);
    if (match && !entry.family.test(source)) missing.push(match[0]);
  }
  return missing;
}

/** Sentence-ish spans, line breaks kept, so a labelled section survives intact. */
function guardText(text: string, source: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  const lines = text.split("\n").map((line) => {
    const kept = line
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => {
        if (unsupportedEvidence(sentence, source).length === 0) return true;
        removed.push(sentence.trim());
        return false;
      });
    return kept.join(" ");
  });
  // A labelled section that lost its only sentence leaves its label behind:
  // drop a line that is now nothing but a label.
  const cleaned = lines.filter((line, index) => {
    if (!/^[A-Z][A-Za-z -]{0,30}:\s*$/.test(line.trim())) return true;
    const next = lines.slice(index + 1).find((candidate) => candidate.trim() !== "");
    return next !== undefined && !/^[A-Z][A-Za-z -]{0,30}:/.test(next.trim());
  });
  const joined = cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: removed.length > 0 ? joined : text, removed };
}

export interface EvidenceBasisResult {
  values: Record<string, string>;
  /** Fields a sentence was removed from. */
  adjusted: string[];
  /** Fields left with nothing once unsupported sentences were removed. */
  emptied: string[];
  /** The sentences removed, for the record of what the guard did. */
  removed: string[];
  /**
   * True when the manager relayed only what they were told and no drafted
   * field says so. A notice, never a block.
   */
  unattributed: boolean;
}

/**
 * Holds every drafted text field to the standing the manager's words give it.
 * `source` is what the manager said — plus, for a revision, the form as it
 * already stands, whose text the manager has already seen and kept.
 */
export function guardEvidenceBasis(values: Record<string, string>, source: string, notes = source): EvidenceBasisResult {
  const next: Record<string, string> = {};
  const adjusted: string[] = [];
  const emptied: string[] = [];
  const removed: string[] = [];

  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== "string" || value.trim() === "") {
      next[key] = value;
      continue;
    }
    const guarded = guardText(value, source);
    if (guarded.removed.length === 0) {
      next[key] = value;
      continue;
    }
    removed.push(...guarded.removed);
    adjusted.push(key);
    if (guarded.text === "") {
      emptied.push(key);
      continue;
    }
    next[key] = guarded.text;
  }

  const drafted = Object.values(next).filter((value) => typeof value === "string" && value.trim() !== "");
  const unattributed = drafted.length > 0 && reportedOnly(notes) && !drafted.some(carriesAttribution);

  return { values: next, adjusted, emptied, removed, unattributed };
}

/** Said when a sentence naming unmentioned evidence or a confirmation was removed. */
export const EVIDENCE_REMOVED_NOTICE =
  "Wording that named evidence, a confirmation or an admission your notes did not mention was removed. Add it back only if it is true and documented.";

/** Said when the notes relay only a report and the draft does not say it was reported. */
export const UNATTRIBUTED_REPORT_NOTICE =
  "Your notes describe something reported to you, not something you saw. Check that the draft says it was reported, and does not state it as established.";
