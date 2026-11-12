import { afterEach, describe, expect, it, vi } from "vitest";

import { nameCorrectionQuestion, nameNotCorrectedReply } from "./name-correction-words";

// QA's live CA chat (4 Nov 2026): "fix her last name, it is Doe-Smith" (invented name).
const TYPED = "fix her last name, it is Doe-Smith";

describe("NAME_LINE_COMMA_ENABLED", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("off: the comma keeps the turn from reading as a name correction", () => {
    // QA, 11 Nov 2026: an off pin sets its flag off, so it holds in a flags-on run.
    vi.stubEnv("NAME_LINE_COMMA_ENABLED", "");
    vi.stubEnv("NAME_CORRECTION_WORDS_ENABLED", "true");
    expect(nameCorrectionQuestion(TYPED, "Jane Doe")).not.toBe("change her name to Jane Doe-Smith");
    expect(nameNotCorrectedReply({ templateName: "Corrective Action Form", employeeName: "Jane Doe" }, "change her name to Jane Doe-Smith").content).not.toContain("?");
  });

  it("on: it reads as \"change her name to Jane Doe-Smith\", and the reply asks to confirm it", () => {
    vi.stubEnv("NAME_CORRECTION_WORDS_ENABLED", "true");
    vi.stubEnv("NAME_LINE_COMMA_ENABLED", "true");
    const question = nameCorrectionQuestion(TYPED, "Jane Doe");
    expect(question).toBe("change her name to Jane Doe-Smith");
    expect(nameCorrectionQuestion("fix her last name: Doe-Smith", "Jane Doe")).toBe("change her name to Jane Doe-Smith");
    const reply = nameNotCorrectedReply({ templateName: "Corrective Action Form", employeeName: "Jane Doe" }, question!);
    expect(reply.content).toContain("Should it read **Jane Doe-Smith**?");
  });
});

/* NAME_LINE_COMMA_ENABLED (QA's ruling, 11 Nov 2026): the drafted account follows a corrected surname. Invented names. */
describe("renamedInAccount", () => {
  it("the old full name and the old surname become the new ones; other words stay", async () => {
    const { renamedInAccount } = await import("./name-correction-words");
    expect(renamedInAccount("Observed:\nIsolde Pembrook was late to open. Pembrook said the alarm failed.", "Isolde Pembrook", "Isolde Pembrooke")).toBe(
      "Observed:\nIsolde Pembrooke was late to open. Pembrooke said the alarm failed.",
    );
    expect(renamedInAccount("Marnie Quill was late to open on October 20.", "Marnie Quill", "Marnie Quill-Hart")).toBe("Marnie Quill-Hart was late to open on October 20.");
  });

  it("nothing to change: null (the new surname already there, another word holding the old one, the same surname)", async () => {
    const { renamedInAccount } = await import("./name-correction-words");
    expect(renamedInAccount("Isolde Pembrooke was late.", "Isolde Pembrook", "Isolde Pembrooke")).toBeNull();
    expect(renamedInAccount("Isolde was late at Pembrookfield.", "Isolde Pembrook", "Isolde Pembrooke")).toBeNull();
    expect(renamedInAccount("Isolde Pembrook was late.", "Isolde Pembrook", "isolde pembrook")).toBeNull();
  });
});
