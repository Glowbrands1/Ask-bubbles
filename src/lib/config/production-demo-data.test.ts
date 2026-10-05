import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ============================================================================
 * NO SEEDED CONTENT REACHES A LIVE DEPLOYMENT — RENDERED OR DOWNLOADED
 * ============================================================================
 *
 * The product rule, in one line: if it did not come from a real data source or
 * a real user action, it does not appear as real data.
 *
 * THIS SUITE ENFORCES THE STRONGER READING. A first pass added runtime gates,
 * which fixed what a live deployment SHOWS. It did not change what a live
 * deployment DOWNLOADS: `Jane Kowalski`, `conv-seed-1`, `example.com/policies`
 * and a fabricated `$214.62` were all still in production JavaScript, shipped
 * to managers and discarded on arrival. An ES import is all-or-nothing and
 * does not care which branch runs.
 *
 * DYNAMIC IMPORTS WERE NOT ENOUGH EITHER, which is the second lesson. They
 * kept the seeds out of every page's download and still EMITTED them: eleven
 * chunks sat in `.next/static`, fetched by nobody. So the rule asserted here
 * is stronger than "not statically imported" — it is that exactly one module,
 * the demo side of the build-time boundary, may name seeded content at all, in
 * either import form. `next.config.ts` substitutes that module in only for an
 * explicit demo build, so a production build never names it and the bundler
 * never emits what it names.
 *
 * FOUR SUITES, FOUR QUESTIONS.
 *   this one                            what the production graph CONTAINS
 *   demo-boundary.test.ts               what each implementation RETURNS
 *   production-empty-state.dom.test     what a live account SEES
 *   scripts/verify-no-demo-in-bundle    what the build actually EMITS
 */

const SRC = join(process.cwd(), "src");

function read(path: string): string {
  return readFileSync(join(SRC, path), "utf8");
}

/** Comments stripped, so prose about demo mode cannot satisfy a code check. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** Every `.ts`/`.tsx` under `src`, excluding the seed data and the tests. */
function productionModules(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .map((entry) => entry.split(/[\\/]/).join("/"))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => !file.startsWith("data/demo/"))
    .filter((file) => !file.includes(".test."));
}

/**
 * ============================================================================
 * THE ONE MODULE ALLOWED TO IMPORT `data/demo/*`
 * ============================================================================
 *
 * `lib/demo/runtime.demo.ts`, the demo side of the build-time boundary.
 * `next.config.ts` substitutes it for `lib/demo/runtime.ts` when a build
 * explicitly asks for the demo, so in a production build nothing imports it
 * and the bundler never emits what it names.
 *
 * WHY NOT DYNAMIC IMPORTS. A dynamic import EMITS its module, so the seeded
 * chunks would sit in `.next/static`, fetched by nobody. A module nothing
 * imports is a module nothing emits.
 *
 * There are no demo-only SCREENS: a screen that needs seeded content asks the
 * boundary for it. Adding one means adding it here and proving below that only
 * the boundary names it.
 */
const BOUNDARY = "lib/demo/runtime.demo.ts";
const DEMO_ONLY_MODULES = new Set([BOUNDARY]);

/* ====================================================== the module graph == */

describe("only the demo side of the boundary touches seeded content", () => {
  it("has no other importer of data/demo", () => {
    const offenders: string[] = [];

    for (const file of productionModules()) {
      if (DEMO_ONLY_MODULES.has(file)) continue;
      // Comments stripped: `runtime.ts` legitimately DISCUSSES the dynamic
      // import it replaced, and prose must not read as a dependency.
      const source = code(read(file));
      if (/^import\s+(?!type\b)[\s\S]*?from\s+"@\/data\/demo[^"]*";/m.test(source)) {
        offenders.push(`${file} (static)`);
      }
      if (/import\("@\/data\/demo/.test(source)) {
        offenders.push(`${file} (dynamic)`);
      }
    }

    /*
     * A FAILURE HERE IS A DECISION REQUEST. Add what the module needs to the
     * `DemoRuntime` interface and serve it from both implementations — never
     * reach around the boundary, in either import form.
     */
    expect(offenders).toEqual([]);
  });

  /**
   * AND THE DEMO-ONLY MODULES ARE NAMED BY THE BOUNDARY AND NOTHING ELSE. One
   * import of a demo screen from a production module pulls its seeded payload
   * back into the graph, and the test above would not notice.
   */
  it("reaches every demo-only screen from the boundary alone", () => {
    const reached: string[] = [];

    for (const demoModule of DEMO_ONLY_MODULES) {
      if (demoModule === BOUNDARY) continue;
      const base = demoModule.replace(/\.tsx?$/, "").split("/").pop() as string;
      const named = new RegExp(`from\\s+"[^"]*${base}"|import\\("[^"]*${base}"\\)`);

      for (const file of productionModules()) {
        if (file === BOUNDARY || file === demoModule) continue;
        if (named.test(read(file))) reached.push(`${file} -> ${demoModule}`);
      }
    }

    expect(reached).toEqual([]);
  });

  it("has a boundary that does import the seeds, so the rule above is not vacuous", () => {
    expect(code(read(BOUNDARY))).toMatch(/from "@\/data\/demo"/);
    expect(code(read("lib/demo/runtime.ts"))).not.toMatch(/@\/data\/demo/);
  });

  /**
   * THE PRODUCTION SIDE IS WHAT EVERYTHING ELSE IMPORTS, and it must stay
   * empty. `demo-boundary.test.ts` asserts what it RETURNS; this asserts that
   * production modules go through it rather than around it.
   */
  it("routes production modules through the production implementation", () => {
    const consumers = productionModules().filter((file) =>
      /from "@\/lib\/demo\/runtime"/.test(read(file)),
    );
    expect(consumers.length).toBeGreaterThan(5);

    for (const file of consumers) {
      expect(read(file), `${file} must not import the demo side directly`).not.toMatch(
        /from "@\/lib\/demo\/runtime\.demo"/,
      );
    }
  });
});

/* ============================================================ the store == */

describe("the client store seeds nothing it has not fetched", () => {
  const store = code(read("lib/store/app-store.tsx"));

  it("holds no static import of the seeds", () => {
    expect(store).not.toMatch(/^import[\s\S]*?from "@\/data\/demo/m);
  });

  it.each([
    ["documents", "KnowledgeDocument"],
    ["templates", "FormTemplate"],
    ["forms", "GeneratedForm"],
    ["conversations", "ChatConversation"],
  ])("starts %s empty", (_state, type) => {
    expect(store).toMatch(new RegExp(`useState<${type}\\[\\]>\\(\\[\\]\\)`));
  });

  it("asks the boundary for its seeds, only inside a demo branch", () => {
    const load = store.indexOf("demoRuntime.loadSeeds()");
    expect(load).toBeGreaterThan(-1);
    expect(store.slice(load - 400, load)).toContain("if (DEMO_MODE)");
  });

  /**
   * THE WRITE SIDE MATTERS AS MUCH AS THE READ SIDE. Seeded state written to
   * IndexedDB in live mode is read back on the next load as though the user
   * put it there — which is exactly how the seeded conversations survived.
   */
  it("does not persist seeded collections in live mode", () => {
    for (const collection of [
      "knowledge_documents",
      "form_templates",
      "generated_forms",
    ]) {
      const index = store.indexOf(`storage.replace("${collection}"`);
      expect(index, `${collection} should still be persisted`).toBeGreaterThan(-1);
      const effect = store.slice(store.lastIndexOf("useEffect(", index), index);
      expect(effect, `${collection} must be demo-gated`).toContain(
        "if (!DEMO_MODE) return;",
      );
    }
  });

  /**
   * CONVERSATIONS ARE THE DELIBERATE EXCEPTION AND IT IS NARROW. There is no
   * server-side chat history, so a live thread lives in this browser or
   * nowhere. What must not be written is the SEEDED pair, and they are no
   * longer in state to write.
   */
  it("still persists real conversations in live mode", () => {
    const index = store.indexOf('storage.replace("chat_conversations"');
    expect(index).toBeGreaterThan(-1);
    expect(store.slice(store.lastIndexOf("useEffect(", index), index)).not.toContain(
      "if (!DEMO_MODE) return;",
    );
  });
});

/* ========================================================= the screens === */

describe("screens that can render seeded content ask for the mode first", () => {
  it.each(["features/knowledge/knowledge-screen.tsx"])("%s consults isDemoMode", (path) => {
    expect(code(read(path)), `${path} must gate on the mode`).toContain("isDemoMode");
  });

  it.each([
    "features/admin/ai-usage-screen.tsx",
    "features/admin/integrations-screen.tsx",
    "features/dashboard/overview.tsx",
  ])("%s has no seeded content to gate", (path) => {
    /*
     * These screens render only what the server or the store reports. Should
     * one ever reach for seeded content, it must go through the boundary.
     */
    const source = code(read(path));
    expect(source).not.toMatch(/@\/data\/demo/);
    expect(source).not.toMatch(/\bDEMO_[A-Z_]+\b/);
  });

  /**
   * AND THE REAL PANELS STAY. Gating is not deleting: Integrations keeps the
   * `/api/health` status, which describes THIS deployment and is the section
   * an administrator came for, plus the storage card whose status is measured
   * rather than declared.
   */
  it("keeps the real service status and storage card on Integrations", () => {
    const source = read("features/admin/integrations-screen.tsx");
    expect(source).toContain("<ServiceStatusPanel />");
    expect(source).toContain("BROWSER_STORAGE_INTEGRATION");
    expect(source).toContain("storageAvailable");
    expect(
      /\{live \? null : \([\s\S]*?<ServiceStatusPanel \/>/.test(source),
      "service status must not sit in a demo-only branch",
    ).toBe(false);
  });
});

/* ============================================== links a manager can click = */

describe("production links are verified links", () => {
  /*
   * THE QUICK-ACTIONS ROW RENDERS ON EVERY PAGE, so an unverified destination
   * there is a promise the product makes everywhere. Every production action is
   * an internal route.
   */
  it("keeps the quick actions on internal routes", () => {
    const productionList = code(read("data/quick-actions.ts"));
    for (const banned of [/https?:\/\//, /example\.com/, /localhost/, /placeholder/i, /preview--/]) {
      expect(productionList, String(banned)).not.toMatch(banned);
    }
    for (const href of productionList.matchAll(/href:\s*[`"]([^`"]+)[`"]/g)) {
      expect(href[1].startsWith("/"), href[1]).toBe(true);
    }
  });
});
