import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { askCaWhatHappened, withCaWhatHappened } = await import("./ca-what-happened");

/*
 * CA_ASKS_WHAT_HAPPENED_ENABLED — ported from the sibling app's #331 (13 Nov 2026). The people are invented; the
 * wordings are the sibling cases' and this app's replay probe's.
 */
const card = (issue: string | null = null) => ({
  content: issue
    ? `I can create a **Corrective Action Form** for **Rowan Kestrel**.\n\n**Issue:** ${issue} · **Store:** Omaha, NE (West Dodge Rd)\n\nCreate the draft here when you're ready.`
    : "I can create a **Corrective Action Form** for **Rowan Kestrel**.\n\nCreate the draft here when you're ready.",
  citations: [],
  coverage: "not_applicable",
  formProposal: { templateKey: "dpoa", templateName: "Corrective Action Form", employeeName: "Rowan Kestrel", employeeRole: "Team Member Part Time", locationName: "Omaha, NE (West Dodge Rd)", issue } as never,
});
const NOTE = /You haven't told me what happened yet/;

afterEach(() => vi.unstubAllEnvs());

describe("CA_ASKS_WHAT_HAPPENED_ENABLED", () => {
  it("off: the reply is as built", () => {
    vi.stubEnv("CA_ASKS_WHAT_HAPPENED_ENABLED", "");
    const built = card("Team Member Part Time");
    expect(withCaWhatHappened(built as never, { question: "create corrective action form for Rowan Kestrel, Team Member Part Time", history: [] } as never)).toBe(built);
  });

  it("who and where only: asks, and a job-title Issue goes from the card and its line", () => {
    for (const [say, issue] of [
      ["create corrective action form for Rowan Kestrel, Team Member Part Time", "Team Member Part Time"],
      ["create corrective action form for Rowan Kestrel, Assistant General Manager", "Assistant General Manager"],
      ["create a corrective action for Rowan Kestrel", null],
    ] as const) {
      const out = askCaWhatHappened(card(issue) as never, say, []);
      expect(out.content, say).toMatch(NOTE);
      expect(out.content, say).not.toMatch(/\*\*Issue:\*\*/);
      expect(out.content, say).toMatch(/\*\*Store:\*\* Omaha|Create the draft/);
      expect((out.formProposal as { issue?: string | null }).issue ?? null, say).toBeNull();
    }
  });

  it("a denied fault is no account: asks", () => {
    for (const say of ["ca for Rowan Kestrel not late", "create a corrective action for Rowan Kestrel, she didn't do anything wrong", "create a corrective action for Rowan Kestrel, she was never late"]) {
      expect(askCaWhatHappened(card() as never, say, []).content, say).toMatch(NOTE);
    }
  });

  it("an account, a duty not done or a shortfall: never asks, the card as built", () => {
    for (const [say, issue] of [
      ["ca for Rowan Kestrel she was late on 11/2", "she was late on 11/2"],
      ["I need a verbal corrective action made for Rowan Kestrel. Not meeting sales requirements for the month of October", "Not meeting sales requirements for the month of October"],
      ["create a corrective action for Rowan Kestrel, she did not clock in for her shift", "she did not clock in for her shift"],
      ["create a corrective action for Rowan Kestrel, not late but left the register open", "not late but left the register open"],
    ] as const) {
      const built = card(issue);
      expect(askCaWhatHappened(built as never, say, []), say).toBe(built);
    }
  });

  it("the account in an earlier turn counts; asked once per card", () => {
    const earlier = [{ role: "user", content: "can i give a ca for not signing off on the cleaning check list" }];
    expect(askCaWhatHappened(card() as never, "can you write me a ca for Rowan Kestrel", earlier as never).content).not.toMatch(NOTE);
    const asked = [
      { role: "user", content: "create a corrective action for Rowan Kestrel" },
      { role: "assistant", content: "**You haven't told me what happened yet**, so I can't cite the policy manual." },
    ];
    expect(askCaWhatHappened(card() as never, "Team Member Part Time", asked as never).content).not.toMatch(NOTE);
  });

  it("another form, the team card or no employee: untouched", () => {
    const coaching = { ...card(), formProposal: { templateKey: "coaching", employeeName: "Rowan Kestrel" } as never };
    expect(askCaWhatHappened(coaching as never, "create a coaching form for Rowan Kestrel", [])).toBe(coaching);
    const nobody = { ...card(), formProposal: { templateKey: "dpoa", employeeName: null } as never };
    expect(askCaWhatHappened(nobody as never, "write ca", [])).toBe(nobody);
  });
});
