import { describe, expect, it } from "vitest";

/**
 * ============================================================================
 * THE LIVE-CORPUS READINESS CHECK, ENVIRONMENT-GATED
 * ============================================================================
 *
 * Talks to a real Supabase project, so it is OFF unless explicitly switched on:
 *
 *   RUN_CORPUS_READINESS=1 npx vitest run src/lib/knowledge/framework-readiness.test.ts
 *
 * It checks every pinned document role configured in
 * `src/config/company/knowledge.ts`: exactly one current, complete, indexed
 * document per role. With no role configured it passes vacuously, which is the
 * truth for this deployment today. READ-ONLY.
 */

const ENABLED =
  process.env.RUN_CORPUS_READINESS === "1" &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);

const forEnvironment = ENABLED ? describe : describe.skip;

forEnvironment("the configured corpus has every pinned document it needs", () => {
  it("resolves exactly one healthy, complete, current document per role", async () => {
    const { checkPinnedRolesReadiness } = await import("./framework-readiness");
    const report = await checkPinnedRolesReadiness();
    console.log(JSON.stringify(report, null, 2));
    expect(report.problems).toEqual([]);
    expect(report.ready).toBe(true);
  });
});

describe("the pinned-role configuration", () => {
  it("gives every configured role at least one rule group and a sane ceiling", async () => {
    const { KNOWLEDGE_DOCUMENT_ROLES } = await import("./document-roles");
    for (const role of KNOWLEDGE_DOCUMENT_ROLES) {
      expect(role.ruleGroups.length, role.id).toBeGreaterThan(0);
      expect(role.maxMandatoryChunks, role.id).toBeGreaterThanOrEqual(role.ruleGroups.length);
      expect(role.maxMandatoryChunks, role.id).toBeLessThan(20);
    }
  });

  it("never configures two roles with the same tag", async () => {
    const { KNOWLEDGE_DOCUMENT_ROLES } = await import("./document-roles");
    const tags = KNOWLEDGE_DOCUMENT_ROLES.map((role) => role.tag);
    expect(new Set(tags).size).toBe(tags.length);
  });
});
