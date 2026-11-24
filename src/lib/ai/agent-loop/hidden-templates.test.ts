import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/*
 * Coding-E for Pau (21 Nov 2026, #990): the six EPP forms are hidden in this app. The loop offers and proposes a form
 * only from `creatableTemplates`, which leaves out every hidden key, even when the list it reads still carries one.
 */
const row = (key: string) => ({
  key,
  name: `Form ${key}`,
  active: true,
  requiredPermission: "create_coaching_form",
  currentVersion: { variants: [] },
});

vi.mock("@/lib/forms/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/forms/repository")>()),
  listTemplateSummaries: async () => [row("coaching"), row("sdit-epp"), row("dmit-epp-tsd")],
}));
vi.mock("@/config/company/forms/hidden", () => ({
  HIDDEN_TEMPLATE_KEYS: ["sdit-epp", "dmit-epp-tsd"],
  isHiddenTemplate: (key: string) => ["sdit-epp", "dmit-epp-tsd"].includes(key),
}));

const { templateChoices } = await import("./tools");

describe("a hidden form is never offered by the loop", () => {
  it("the template choices leave out every hidden key", async () => {
    expect((await templateChoices("admin")).map((choice) => choice.key)).toEqual(["coaching"]);
  });
});
