import { afterEach, describe, expect, it, vi } from "vitest";

import { withNoCreateWhileAsking } from "./what-happened-no-create";

// Ported from the sibling app (its QA live r19, 10 Nov 2026): a card asked what happened beside an active Create draft.
const ASKING = {
  content:
    "I can create a **Corrective Action Form** for **Rowan Kestrel**.\n\n**You haven't told me what happened yet**, so I can't cite the policy manual — the draft will come back without the policy section and page. You can create it now and fill it in yourself, or tell me here what happened and I'll draft it (or redraft the form you created) with the manual's section and page cited.\n\nCreate the draft here when you're ready, and edit it below.",
  formProposal: { supportsInlineDraft: true, templateKey: "dpoa", employeeName: "Rowan Kestrel" },
};

describe("WHAT_HAPPENED_NO_CREATE_ENABLED", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("off: the card still offers Create", () => {
    vi.stubEnv("WHAT_HAPPENED_NO_CREATE_ENABLED", "");
    expect(withNoCreateWhileAsking(ASKING)).toEqual(ASKING);
  });

  it("on: while the reply asks what happened, the card offers no Create and says nothing of it", () => {
    vi.stubEnv("WHAT_HAPPENED_NO_CREATE_ENABLED", "true");
    const out = withNoCreateWhileAsking(ASKING);
    expect(out.formProposal.supportsInlineDraft).toBe(false);
    expect(out.content).not.toMatch(/Create the draft here/);
    expect(out.content).toMatch(/You haven't told me what happened yet/);
    // Gate-Bubbles on #857: no button, so no "create it now".
    expect(out.content).not.toMatch(/create it now/i);
    expect(out.content).toMatch(/Tell me here what happened and I'll draft it/);
  });

  it("on: the manager already said what happened (the reader asked anyway): Create stays", () => {
    vi.stubEnv("WHAT_HAPPENED_NO_CREATE_ENABLED", "true");
    for (const [question, history] of [
      ["I need a CA for Rowan Kestrel. Didn't show up for her opening shift.", []],
      ["Rowan Kestrel", [{ role: "user", content: "create a CA for Lee's Summit Plaza, she was late on 10-20-26" }]],
      ["Rowan Kestrel 131 tans verbal", [{ role: "user", content: "create a corrective action" }]],
    ] as const) {
      expect(withNoCreateWhileAsking(ASKING, { question, history }), question).toEqual(ASKING);
    }
    expect(withNoCreateWhileAsking(ASKING, { question: "create a corrective action for Rowan Kestrel", history: [] }).formProposal.supportsInlineDraft).toBe(false);
  });

  it("on: a reply that does not ask is left as it is", () => {
    vi.stubEnv("WHAT_HAPPENED_NO_CREATE_ENABLED", "true");
    const ready = { content: "I'll draft a **Corrective Action Form** for **Rowan Kestrel** from what you've described.", formProposal: { supportsInlineDraft: true } };
    expect(withNoCreateWhileAsking(ready)).toEqual(ready);
  });
});
