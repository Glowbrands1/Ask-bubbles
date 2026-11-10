import { afterEach, describe, expect, it, vi } from "vitest";

import { afterTurn, beforeTurn, peopleRequest, withCardNamingEmployee } from "./one-form-each";
import { installPersonRoster } from "./person-guard";

/** Ported from the sibling app: QA's P7 there (10 Nov 2026), in the managers' words; the people invented. */
const T1 = "Make me a coaching form for Tamsin, Corwin, and Ione for not closing duties correctly";
const NEXT = "**Next:** a Coaching Form each for **Corwin Halsey** and **Ione Marchetti**, for not closing duties correctly. Say **yes** when this one is done and I'll start the next.";

afterEach(() => {
  vi.unstubAllEnvs();
  installPersonRoster(() => undefined);
});

describe("peopleRequest", () => {
  it("QA's request: the first person's request, the other two queued with the reason", () => {
    expect(peopleRequest(T1)).toEqual({
      first: "Make me a coaching form for Tamsin for not closing duties correctly",
      queue: { form: "Coaching Form", people: ["Corwin", "Ione"], reason: "not closing duties correctly" },
    });
    expect(peopleRequest("Make me a coaching form for Tamsin for not closing duties correctly")).toBeNull();
  });
});

describe("beforeTurn / afterTurn (ONE_FORM_EACH_PERSON_ENABLED)", () => {
  it("off: nothing", () => {
    expect(beforeTurn({ question: T1, history: [] })).toBeNull();
  });

  it("on: the chain — the first request, the queue by roster names, \"yes\" after a card starts the next", () => {
    vi.stubEnv("ONE_FORM_EACH_PERSON_ENABLED", "true");
    installPersonRoster(() => ["Tamsin Rookwood", "Tamsin Ashby", "Corwin Halsey", "Ione Marchetti"]);
    const first = beforeTurn({ question: T1, history: [] })!;
    expect(first.question).toBe("Make me a coaching form for Tamsin for not closing duties correctly");
    const asked = afterTurn({ content: "Did you mean **Tamsin Ashby** or **Tamsin Rookwood**?" }, first.queue);
    expect(asked.content.endsWith(NEXT)).toBe(true);
    const afterCard = [{ role: "assistant", content: `I have **Tamsin Ashby** and the store.\n\n${NEXT}` }];
    const yes = beforeTurn({ question: "yes", history: afterCard })!;
    expect(yes).toMatchObject({ question: "Create a Coaching Form for Corwin Halsey for not closing duties correctly.", fresh: true });
    expect(yes.queue.people).toEqual(["Ione Marchetti"]);
    const afterQuestion = [{ role: "assistant", content: `Is this for **Corwin Halsey**?\n\n${NEXT}` }];
    expect(beforeTurn({ question: "yes", history: afterQuestion })).toMatchObject({ question: "yes", fresh: false });
  });
});

describe("withCardNamingEmployee (CARD_NAMES_EMPLOYEE_ENABLED)", () => {
  const card = { content: "I have the employee and the store (**Omaha, NE (West Dodge Rd)**).", formProposal: { templateKey: "coaching", employeeName: "Tamsin Ashby" } };
  it("off as before; on, named", () => {
    expect(withCardNamingEmployee(card).content).toBe(card.content);
    vi.stubEnv("CARD_NAMES_EMPLOYEE_ENABLED", "true");
    expect(withCardNamingEmployee(card).content).toBe("I have **Tamsin Ashby** and the store (**Omaha, NE (West Dodge Rd)**).");
  });
});

describe("peopleRequest: one form, several people — never several forms (QA's round-16B gate)", () => {
  it("a turn naming a different form for each person is not a one-form-each request", () => {
    expect(peopleRequest("coaching form for Avery Testperson, CA for Jordan Testperson")).toBeNull();
    expect(peopleRequest("coaching form for Avery Testperson, CA for Jordan Testperson, and a policy review for Sam Rivera")).toBeNull();
  });

  it("one form for two people still is", () => {
    expect(peopleRequest("CA for Wilhelmina Corvina and Peregrine Varnholt for being late")?.queue.people).toEqual(["Peregrine Varnholt"]);
  });
});
