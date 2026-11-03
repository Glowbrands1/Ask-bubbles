import { describe, expect, it } from "vitest";

import { MANUAL_VOCABULARY, retrievedSubset } from "@/test/policy-from-manual-fixture";

import { checkCitations, normaliseCitationText, verifyLabel, verifyQuote } from "./verify";

/**
 * Step A (POLICY_CITATION_CHECK_ENABLED): every quote must be a verbatim part
 * of a retrieved manual chunk, and every label's heading and page the
 * manual's. Run against the production JBA Policy Manual (151 rows), with
 * Attendance, Late Opening, Employee Parking and Lost and Found retrieved.
 */

const chunks = retrievedSubset();
const ATTENDANCE = "idx-41";
const PARKING = "idx-55";

/** The manual's own sentence (chunk 41), with the manual's curly apostrophe. */
const MANUAL_SENTENCE =
  "Lack of punctuality or absenteeism has a negative impact on everyone’s schedule and creates a lack of service for the client.";

describe("retrievedChunks", () => {
  it("names each chunk idx-<chunkIndex> when it has no chunkId, with the manual's headings and printed page", () => {
    const attendance = chunks.find((chunk) => chunk.id === ATTENDANCE)!;
    expect(attendance.headings).toEqual(["Attendance"]);
    expect(attendance.page).toBe(14);
    expect(chunks.map((chunk) => chunk.id)).toEqual(["idx-41", "idx-42", "idx-55", "idx-56"]);
  });
});

describe("verifyQuote", () => {
  it("keeps the manual's sentence as written", () => {
    const check = verifyQuote({ quote: MANUAL_SENTENCE, chunkId: ATTENDANCE }, chunks);
    expect(check.ok).toBe(true);
  });

  it("drops a quote that is not in the retrieved chunk it names (quote_not_in_manual)", () => {
    const parking = "Employees are not allowed to park directly in front of the location.";
    expect(verifyQuote({ quote: parking, chunkId: ATTENDANCE }, chunks)).toEqual({ ok: false, reason: "quote_not_in_manual" });
    // ...and the same sentence is kept against the chunk it is in.
    expect(verifyQuote({ quote: parking, chunkId: PARKING }, chunks).ok).toBe(true);
  });

  it("drops a quote from a chunk that was not retrieved (chunk_not_retrieved)", () => {
    expect(verifyQuote({ quote: MANUAL_SENTENCE, chunkId: "idx-10" }, chunks)).toEqual({ ok: false, reason: "chunk_not_retrieved" });
  });

  it("drops a quote joining two places of the same chunk", () => {
    const joined =
      "It is the responsibility of each employee to know his or her work schedule and to always be on time. Excessive absenteeism will result in termination.";
    expect(verifyQuote({ quote: joined, chunkId: ATTENDANCE }, chunks)).toEqual({ ok: false, reason: "quote_not_in_manual" });
  });

  it("KEEPS a quote that differs only in curly quotes and whitespace", () => {
    const straight = "Lack of punctuality  or absenteeism has a negative impact on\neveryone's schedule and creates a lack of service for the client.";
    const check = verifyQuote({ quote: straight, chunkId: ATTENDANCE }, chunks);
    expect(check.ok).toBe(true);
    // The manual's text breaks this sentence across two lines; that is whitespace too.
    expect(verifyQuote({ quote: "“Excessive absenteeism will result in termination. No call or no show for a scheduled shift may result in immediate termination.”", chunkId: ATTENDANCE }, chunks).ok).toBe(true);
  });

  it("DROPS a quote that changes ONE word", () => {
    const changed = MANUAL_SENTENCE.replace("client", "customer");
    expect(changed).not.toBe(MANUAL_SENTENCE);
    expect(verifyQuote({ quote: changed, chunkId: ATTENDANCE }, chunks)).toEqual({ ok: false, reason: "quote_not_in_manual" });
  });

  it("drops a quote under 8 words (too_short), and one cut off mid-sentence", () => {
    expect(verifyQuote({ quote: "Excessive absenteeism will result in termination.", chunkId: ATTENDANCE }, chunks)).toEqual({ ok: false, reason: "too_short" });
    expect(verifyQuote({ quote: "Lack of punctuality or absenteeism has a negative impact", chunkId: ATTENDANCE }, chunks)).toEqual({ ok: false, reason: "quote_not_in_manual" });
  });
});

describe("verifyLabel", () => {
  it("keeps a retrieved heading on the manual's page", () => {
    expect(verifyLabel({ heading: "Attendance", page: 14 }, chunks)).toEqual({ action: "keep", heading: "Attendance", page: 14 });
  });

  it("moves a label with the wrong page to the manual's page", () => {
    expect(verifyLabel({ heading: "Attendance", page: 15 }, chunks)).toEqual({ action: "move", heading: "Attendance", from: 15, page: 14 });
    expect(verifyLabel({ heading: "Late Opening", page: null }, chunks)).toEqual({ action: "move", heading: "Late Opening", from: null, page: 15 });
  });

  it("drops a label whose heading was not retrieved, even one the manual has", () => {
    expect(MANUAL_VOCABULARY).toContain("Disciplinary Action");
    expect(verifyLabel({ heading: "Disciplinary Action", page: 15 }, chunks)).toEqual({ action: "drop", reason: "heading_not_retrieved" });
    expect(verifyLabel({ heading: "Tardiness", page: 14 }, chunks)).toEqual({ action: "drop", reason: "heading_not_retrieved" });
  });
});

describe("checkCitations", () => {
  it("moves a card label with the wrong page to the manual's page", () => {
    const result = checkCitations("**Policy:** Attendance Policy, JBA Policy Manual p.15", chunks, { vocabulary: MANUAL_VOCABULARY });
    expect(result.text).toBe("**Policy:** Attendance Policy, JBA Policy Manual p.14");
    expect(result.moved).toEqual([{ heading: "Attendance", from: 15, to: 14 }]);
    expect(result.dropped).toEqual([]);
  });

  it("drops a label whose heading was not retrieved", () => {
    const result = checkCitations("This falls under Disciplinary Action, JBA Policy Manual p.15.", chunks, { vocabulary: MANUAL_VOCABULARY });
    expect(result.dropped).toEqual([{ kind: "label", reason: "heading_not_retrieved", text: "Disciplinary Action, JBA Policy Manual p.15" }]);
    expect(result.text).not.toContain("JBA Policy Manual");
  });

  it("keeps a verbatim quote (curly quotes and line breaks aside) and takes out the sentence of an invented one", () => {
    const answer = [
      "**Attendance**, JBA Policy Manual p.14: “Lack of punctuality or absenteeism has a negative impact on everyone's schedule and creates a lack of service for the client.”",
      "The manual says: \"Employees who are late three times in a month will receive a written warning.\" (JBA Policy Manual p.14) Talk to the employee about it.",
    ].join("\n");
    const result = checkCitations(answer, chunks, { vocabulary: MANUAL_VOCABULARY });
    expect(result.dropped).toEqual([
      { kind: "quote", reason: "quote_not_in_manual", text: "\"Employees who are late three times in a month will receive a written warning.\"" },
    ]);
    expect(result.text).toBe(
      [
        "**Attendance**, JBA Policy Manual p.14: “Lack of punctuality or absenteeism has a negative impact on everyone's schedule and creates a lack of service for the client.”",
        "Talk to the employee about it.",
      ].join("\n"),
    );
  });

  it("drops a quote that joins two places, and one that changes one word", () => {
    const joined = 'The rule: "It is the responsibility of each employee to know his or her work schedule and to always be on time. Excessive absenteeism will result in termination."';
    expect(checkCitations(joined, chunks).dropped.map((entry) => entry.reason)).toEqual(["quote_not_in_manual"]);
    const oneWord = `"${MANUAL_SENTENCE.replace("client", "customer")}"`;
    const result = checkCitations(oneWord, chunks);
    expect(result.dropped.map((entry) => entry.reason)).toEqual(["quote_not_in_manual"]);
    expect(result.text).toBe("");
  });

  /*
   * QA's decision on #413: a double-quoted span is checked only when it is in
   * the same sentence as a manual label, or has 8 or more words. A short,
   * unattributed quote (a manager's own words) is left exactly as written.
   */
  it("keeps a short manager quote unchanged", () => {
    const answer = 'She said "I\'m on my way" and arrived at 10:40.';
    expect(checkCitations(answer, chunks, { vocabulary: MANUAL_VOCABULARY })).toEqual({ text: answer, dropped: [], moved: [] });
  });

  it("drops a short quote attributed to the manual by a label in the same sentence", () => {
    const answer = 'Attendance, JBA Policy Manual p.14 says "Three lates means a write-up." Please review it.';
    const result = checkCitations(answer, chunks, { vocabulary: MANUAL_VOCABULARY });
    expect(result.dropped).toEqual([{ kind: "quote", reason: "too_short", text: '"Three lates means a write-up."' }]);
    expect(result.text).toBe("Please review it.");
  });

  it("drops an unattributed quote of 8 or more words that is in no retrieved chunk", () => {
    const answer = 'Remember: "Employees who are late three times in a month will receive a written warning." Thanks.';
    const result = checkCitations(answer, chunks, { vocabulary: MANUAL_VOCABULARY });
    expect(result.dropped.map((entry) => entry.reason)).toEqual(["quote_not_in_manual"]);
    expect(result.text).toBe("Thanks.");
  });

  it("keeps an unattributed quote of 8 or more words that is verbatim in a retrieved chunk", () => {
    const answer = 'Remember: "Employees are not allowed to park directly in front of the location." Thanks.';
    expect(checkCitations(answer, chunks, { vocabulary: MANUAL_VOCABULARY })).toEqual({ text: answer, dropped: [], moved: [] });
  });

  it("leaves a reply with nothing to check exactly as it was", () => {
    const answer = "Please speak with your district manager.  Thanks!";
    expect(checkCitations(answer, chunks)).toEqual({ text: answer, dropped: [], moved: [] });
  });

  it("the normalisation is whitespace and quotes only", () => {
    expect(normaliseCitationText("  “A  b’s”\n")).toBe("\"A b's\"");
    expect(normaliseCitationText("Case Stays")).toBe("Case Stays");
  });
});
