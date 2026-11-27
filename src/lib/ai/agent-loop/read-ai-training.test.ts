import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AccessScope, Role } from "@/types";

import { DEFAULT_DATA_TOOL_DEPS, dataToolHandlers, readAiTraining } from "./data-tools";

/** read_ai_training (port from the sibling app; CLAUDE.md §5): AI Training's published lessons, scoped as the page is. */
const STORE = { level: "location", primaryAreaId: "loc-1", alsoCoversAreaIds: [] } as unknown as AccessScope;
const ctx = (role: Role, question: string) => ({ actor: { role, scope: STORE }, question, scopeId: "s", today: "2026-11-26" });
const lesson = (id: string, title: string, moduleId: string | null, status: "draft" | "published", sortOrder: number) =>
  ({ id, trackId: "t1", moduleId, slug: id, title, summary: `${title} in one page.`, weekNumber: null, sortOrder, status, publishedAt: "2026-11-20T10:00:00Z" });
const CATALOG = {
  tracks: [{ id: "t1", slug: "basics", title: "AI Basics", sortOrder: 1 }],
  modules: [
    { id: "m1", trackId: "t1", slug: "prompts", title: "Prompting", sortOrder: 1, adminOnly: false },
    { id: "m2", trackId: "t1", slug: "archive", title: "Archive", sortOrder: 2, adminOnly: true },
  ],
  lessons: [lesson("l1", "Writing a clear prompt", "m1", "published", 1), lesson("l2", "Checking an answer", "m1", "published", 2), lesson("l3", "Unfinished draft", "m1", "draft", 3), lesson("l4", "Old archived lesson", "m2", "published", 1)],
};
const deps = { ...DEFAULT_DATA_TOOL_DEPS, loadTrainingCatalog: async () => CATALOG };
type Out = { lessons?: { title: { untrusted_text: string }; module?: string; track: string }[]; refused?: string };

describe("read_ai_training", () => {
  it("lists the published lessons only: never a draft or an admin-only module's lesson, even if the read returned them", async () => {
    const out = (await readAiTraining(ctx("location_manager", "what's in AI Training?"), {}, deps)) as Out;
    expect(out.lessons?.map((entry) => entry.title.untrusted_text)).toEqual(["Writing a clear prompt", "Checking an answer"]);
    expect(out.lessons?.[0]).toMatchObject({ track: "AI Basics", module: "Prompting" });
  });

  it("a topic keeps the matching lessons; a role without View AI training is refused", async () => {
    const topic = (await readAiTraining(ctx("location_manager", "is there a lesson on writing clearly?"), { topic: "writing clearly" }, deps)) as Out;
    expect(topic.lessons?.map((entry) => entry.title.untrusted_text)).toEqual(["Writing a clear prompt"]);
    const refused = (await readAiTraining(ctx("nobody" as Role, "lessons?"), {}, deps)) as Out;
    expect(refused.refused).toBeTruthy();
    expect(refused.lessons).toBeUndefined();
  });

  it("is one of the loop's handlers", () => {
    expect(Object.keys(dataToolHandlers(ctx("admin", "")))).toContain("read_ai_training");
  });
});
