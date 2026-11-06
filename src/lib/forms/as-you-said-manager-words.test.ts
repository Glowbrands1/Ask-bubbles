import { afterEach, describe, expect, it, vi } from "vitest";

import { caPolicyProposalLine, readCaPolicy } from "./ca-policy";

/*
 * AS_YOU_SAID_MANAGER_WORDS_ENABLED (the sibling app's live chat, 4 Nov 2026, sf-s24, in the twin replay case's wording; the employee
 * is invented). The intent reader's heading went onto the turn as the app's own line (`ai/form-state.ts`
 * stateSentences), and the policy reader took it as the manager naming the Standards of Conduct.
 */
const SAID =
  "it should be must see behaviors and she also had coaching on file for open ended questions coahing done one 10/22 and bundle coachings done 10/15";
const WITH_APP_LINE = `The employee is Rowan Kestrel. Policy reference: Standards of Conduct, JBA Policy Manual p.12.\n${SAID}`;

afterEach(() => vi.unstubAllEnvs());

describe("AS_YOU_SAID_MANAGER_WORDS_ENABLED", () => {
  it("off: the app's \"Policy reference\" line reads as the manager naming the Standards of Conduct", () => {
    const reading = readCaPolicy(WITH_APP_LINE);
    expect(reading.stated).toBe("standards_of_conduct");
    expect(caPolicyProposalLine(reading)).toMatch(/^\*\*Policy:\*\* Standards of Conduct, as you said\./);
  });

  it("on: the app's line names nothing; the card does not say \"as you said\"", () => {
    vi.stubEnv("AS_YOU_SAID_MANAGER_WORDS_ENABLED", "true");
    const reading = readCaPolicy(WITH_APP_LINE);
    expect(reading.stated).toBeNull();
    expect(caPolicyProposalLine(reading) ?? "").not.toMatch(/as you said/);
  });

  it("on: a policy the manager typed is still theirs", () => {
    vi.stubEnv("AS_YOU_SAID_MANAGER_WORDS_ENABLED", "true");
    const reading = readCaPolicy(`Policy reference: Standards of Conduct, JBA Policy Manual p.12.\nthe policy violated is the standards of conduct`);
    expect(reading.stated).toBe("standards_of_conduct");
    expect(caPolicyProposalLine(reading)).toMatch(/Standards of Conduct, as you said/);
  });
});
