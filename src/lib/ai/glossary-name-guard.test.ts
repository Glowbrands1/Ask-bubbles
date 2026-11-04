import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { keepTypedPerson } from "@/lib/forms/typed-name";
import { managerContext, readEmployeeMentions, resolveEmployee } from "@/lib/forms/proposal";
import { correctiveActionIntakeRequest, readCorrectiveActionIntake } from "@/lib/forms/corrective-action-intake";

/**
 * CHAT_GLOSSARY_ENABLED: the code guard, on QA's sf-s12 wording, exactly:
 * "I need to make a corrective action for msb". With the flag on, "msb" is
 * never the employee, and the Corrective Action intake asks the one existing
 * question, "Who is this form for? Tell me the employee's full name.". Off,
 * main's reading: "msb" is the employee.
 */
const SAID = "I need to make a corrective action for msb";
const FLAGS = ["CHAT_GLOSSARY_ENABLED", "NAME_QUESTION_ONLY_ENABLED"] as const;
const saved = new Map<string, string | undefined>();
beforeEach(() => {
  for (const name of FLAGS) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
});
afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function context(text: string) {
  return managerContext([], { id: "m0", content: text });
}

describe(`"${SAID}"`, () => {
  it("flag off: read as main reads it — msb is the employee", () => {
    expect(readEmployeeMentions(SAID).names).toEqual(["msb"]);
    expect(resolveEmployee(context(SAID))).toEqual({ kind: "resolved", employeeName: "msb" });
  });

  it("flag on: msb is never a name candidate nor the employee", () => {
    process.env.CHAT_GLOSSARY_ENABLED = "true";
    expect(readEmployeeMentions(SAID).names).toEqual([]);
    expect(resolveEmployee(context(SAID))).toEqual({ kind: "missing" });
    // "MSB" and "Msb" fold to the same term.
    expect(readEmployeeMentions("I need to make a corrective action for MSB").names).toEqual([]);
    expect(keepTypedPerson({ kind: "resolved", employeeName: "Msb" })).toEqual({ kind: "missing" });
    expect(keepTypedPerson({ kind: "ambiguous", candidates: ["Msb", "Pat Rivera"] })).toEqual({ kind: "resolved", employeeName: "Pat Rivera" });
  });

  it("flag on: a real person beside MSB is still the employee", () => {
    process.env.CHAT_GLOSSARY_ENABLED = "true";
    expect(readEmployeeMentions("Create a Corrective Action for Pat Rivera for msb").names).toEqual(["Pat Rivera"]);
  });

  it("flag on: the intake asks the existing one question, once; off, the list as on main", () => {
    const ask = () =>
      correctiveActionIntakeRequest({
        formName: "Corrective Action Form",
        items: readCorrectiveActionIntake({ text: SAID, employeeKnown: false, salonSettled: true, today: "2026-10-26" }).missing,
        opening: true,
        today: "October 26, 2026",
      });
    expect(ask()).toMatch(/^Great, I can help you create a \*\*Corrective Action Form\*\*/);
    process.env.CHAT_GLOSSARY_ENABLED = "true";
    expect(ask()).toBe("Who is this form for? Tell me the employee's full name.");
  });
});
