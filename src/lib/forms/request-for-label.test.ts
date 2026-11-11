import { afterEach, describe, expect, it } from "vitest";

import { detectTemplateIntent, leadingFormRequest } from "./template-intent";

/**
 * REQUEST_FOR_LABEL_ENABLED (B-C2, QA's open-case list, 11 Nov 2026). Pau's wording from QA's name matrix (4 Nov 2026),
 * the person invented there: "Corrective action for the primary salon manager: …" was answered as a policy question.
 */
const FLAG = "REQUEST_FOR_LABEL_ENABLED";
const PAU_2 =
  "Corrective action for the primary salon manager: on Monday 10/05/2026 corin bellweather was working a shift at the front desk and was rude to a guest";

afterEach(() => {
  delete process.env[FLAG];
});

describe("REQUEST_FOR_LABEL", () => {
  it("flag off (as production today): not read as a request", () => {
    expect(detectTemplateIntent(PAU_2)).toEqual({ kind: "corrective_action", requestedCreation: false });
  });

  it("flag on: the request for the Corrective Action Form, with the account after the colon", () => {
    process.env[FLAG] = "true";
    expect(detectTemplateIntent(PAU_2)).toEqual({ kind: "explicit", templateKey: "dpoa" });
    expect(leadingFormRequest(PAU_2)?.templateKey).toBe("dpoa");
  });

  it("flag on, NEVER-BREAK: a 'for …' with no colon is read as before", () => {
    process.env[FLAG] = "true";
    const on = detectTemplateIntent("coaching for the new hires on the register");
    delete process.env[FLAG];
    expect(on).toEqual(detectTemplateIntent("coaching for the new hires on the register"));
  });
});
