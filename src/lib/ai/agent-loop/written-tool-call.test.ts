import { describe, expect, it } from "vitest";

import { withoutWrittenToolCalls, writtenToolCall } from "./written-tool-call";

/* QA's Bubbles live round 3 (22 Nov 2026): the reply was a tool call written as text. The live replies, verbatim. */
const NAMES = ["find_staff", "propose_form", "read_form"];
const EXEC = '_exec:find_staff\n{"person_evidence": "Thaddea Kroll, she is at Dodge, makery associate"}';
const FENCED = 'find_staff\n```\n{"person_evidence": "Her name is Thaddea Kroll and she is at Dodge. [m3]"}\n```';

describe("a tool call written as text", () => {
  it("is found in both live shapes", () => {
    expect(writtenToolCall(EXEC, NAMES)).toBe("find_staff");
    expect(writtenToolCall(FENCED, NAMES)).toBe("find_staff");
    expect(writtenToolCall('```json\npropose_form {"template_key": "dpoa"}\n```', NAMES)).toBe("propose_form");
  });

  it("is never a reply that only names a tool word or holds no JSON", () => {
    expect(writtenToolCall("I looked her up with find_staff and she is at West Dodge.", NAMES)).toBeNull();
    expect(writtenToolCall("find_staff\n\nShe is at Dodge.", NAMES)).toBeNull();
    expect(writtenToolCall('coach_team {"x": 1}', NAMES)).toBeNull();
  });

  it("is left out, with its JSON and fences, keeping the rest of the reply", () => {
    expect(withoutWrittenToolCalls(EXEC, NAMES)).toBe("");
    expect(withoutWrittenToolCalls(`Got it.\n\n${FENCED}\n\nPress Create when ready.`, NAMES)).toBe("Got it.\n\nPress Create when ready.");
    expect(withoutWrittenToolCalls('Here it is:\n```\nfind_staff {"person_evidence": {"quote": "Thaddea"}}\n```\nDone.', NAMES)).toBe("Here it is:\nDone.");
  });
});
