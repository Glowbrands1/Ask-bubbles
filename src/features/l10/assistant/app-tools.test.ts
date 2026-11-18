import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const calls = vi.hoisted(() => ({ reviews: [] as unknown[], forms: [] as unknown[], formsBlock: "FORMS ON FILE (FORMS REGISTER)\n- Wren Halvorsen: Separation Notice (terminated), 11/10/2026" as string | null }));
vi.mock("@/lib/ai/google-reviews-chat-read", () => ({
  loadGoogleReviewsChatBlock: async (input: { question: string }) => {
    calls.reviews.push(input);
    return { text: "GOOGLE REVIEWS — MONTH TO DATE\nBellevue: 7 of 10, behind pace", figures: true };
  },
}));
vi.mock("@/lib/forms/chat-form-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/forms/chat-form-records")>()),
  loadFormRecords: async (input: unknown) => {
    calls.forms.push(input);
    return calls.formsBlock === null ? null : { block: calls.formsBlock };
  },
}));

import type { AccessScope } from "@/types";

import { APP_TOOLS_NOTE, appTools } from "./app-tools.server";

/*
 * The owner, 18 Nov 2026: "also do that for bubbles DM L10 meeting and BCS ai too (right now bubbles dont have
 * reports) atleast able to see google reviews", and "previous forms ... can know who people got coaching and ca who
 * was terminated etc". Invented people only.
 */

const SCOPE: AccessScope = { level: "district", primaryAreaId: "dist-1", alsoCoversAreaIds: [] } as AccessScope;
const viewer = { userId: "user-dm", role: "district_manager" as const, scope: SCOPE };
const run = async (name: string, args: Record<string, unknown>, question = "q") =>
  (appTools(viewer, question)[name]!.execute as (a: Record<string, unknown>, o: unknown) => Promise<Record<string, unknown>>)(args, { toolCallId: "t", messages: [] });

afterEach(() => {
  calls.reviews.length = 0;
  calls.forms.length = 0;
  calls.formsBlock = "x";
});

describe("the DM / GM L10 assistant reads Ask Bubbles' Google reviews and forms on file", () => {
  it("has read_reviews and read_forms_on_file (no report tool: Ask Bubbles has no reports yet), and the prompt says so", () => {
    expect(Object.keys(appTools(viewer, "q")).sort()).toEqual(["read_forms_on_file", "read_reviews"]);
    expect(APP_TOOLS_NOTE).toMatch(/no sales or labor reports yet/);
    expect(APP_TOOLS_NOTE).toMatch(/Never use web search for this company's own figures/);
  });

  it("reads the Google Reviews page as this person, for the store named", async () => {
    const result = await run("read_reviews", { store: "Bellevue" }, "how is bellevue doing");
    expect(calls.reviews[0]).toMatchObject({ role: "district_manager", scope: SCOPE });
    // Always read as a Google review question, so the page's figures come back whatever the person's words were.
    expect((calls.reviews[0] as { question: string }).question).toBe("Google reviews month to date Bellevue");
    expect(JSON.stringify(result)).toContain("Bellevue: 7 of 10, behind pace");
  });

  it("reads the Forms Register as this person (coaching, CAs, terminations), and says so when their role cannot", async () => {
    calls.formsBlock = "FORMS ON FILE (FORMS REGISTER)\n- Wren Halvorsen: Separation Notice (terminated), 11/10/2026";
    const result = await run("read_forms_on_file", { form: "termination" }, "who was terminated this month?");
    expect(calls.forms[0]).toMatchObject({ actor: { subject: "user-dm", verified: true, role: "district_manager", scope: SCOPE } });
    expect(JSON.stringify(result)).toContain("Wren Halvorsen: Separation Notice (terminated)");
    calls.formsBlock = null;
    expect(await run("read_forms_on_file", {})).toMatchObject({ refused: expect.stringMatching(/cannot view the Forms Register/) });
  });

  /* The owner, 18 Nov 2026: "who got a CA this month?" read "the 20 most recent forms"; "why capped at 20". */
  it("reads a period by form date and kind, not the newest 20 forms", async () => {
    await run("read_forms_on_file", { form: "CA", date_from: "2026-11-01", date_to: "2026-11-18" }, "who got a CA this month?");
    expect(calls.forms[0]).toMatchObject({
      narrowFromQuestion: true,
      range: { from: "2026-11-01", to: "2026-11-18" },
      kind: { templateNameWords: ["corrective"] },
    });
  });
});
