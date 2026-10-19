import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PERFORMANCE_MANAGEMENT_FRAMEWORK } from "@/config/company/knowledge";
import { originForRole } from "@/config/company/provenance";
import { selectMandatoryChunks } from "@/lib/knowledge/document-roles";
import { parseFormDocument } from "./document";
import { analyzeGroundingShadow, runGroundingShadow } from "./grounding-shadow";
import { groundingMode } from "./grounding-mode";
import { defaultVariantKey, TEMPLATE_SEEDS } from "./library";
import { performanceManagementGovernance } from "./pm-governance";

const chunks = JSON.parse(
  readFileSync(join(process.cwd(), "src/test/fixtures/framework-chunks.json"), "utf8"),
).chunks as { chunk_index: number; locator: string; content: string }[];

const pinned = selectMandatoryChunks(chunks, PERFORMANCE_MANAGEMENT_FRAMEWORK);

describe("grounding mode", () => {
  it("defaults to off, and 'enforce' can never change behaviour in this build", () => {
    expect(groundingMode({})).toBe("off");
    expect(groundingMode({ FORMS_GROUNDING_MODE: "bogus" })).toBe("off");
    expect(groundingMode({ FORMS_GROUNDING_MODE: "shadow" })).toBe("shadow");
    expect(groundingMode({ FORMS_GROUNDING_MODE: "enforce" })).toBe("shadow");
  });
});

describe("shadow analysis of the shipped Framework", () => {
  const report = analyzeGroundingShadow(pinned.chunks, PERFORMANCE_MANAGEMENT_FRAMEWORK);

  it("pins a complete set and classifies it as legacy Sun Tan City methodology", () => {
    expect(pinned.complete).toBe(true);
    expect(report.origin).toBe("legacy_stc");
    expect(report.rowCount).toBe(pinned.chunks.length);
    expect(report.labels.methodology + report.labels.legacy_specific + report.labels.ambiguous).toBe(
      report.segmentCount,
    );
  });

  it("reports that every required group would still keep methodology", () => {
    expect(report.legacyOnlyGroups).toEqual([]);
  });

  it("separates methodology from legacy-specific content", () => {
    expect(report.labels.methodology).toBeGreaterThan(0);
    expect(report.wouldWithhold).toBe(report.labels.legacy_specific + report.labels.ambiguous);
  });

  it("flags a synthetic group that is legacy-only", () => {
    const rows = pinned.chunks.map((chunk) =>
      ["ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK", "2.8 Further Leadership Review"].includes(
        chunk.locator,
      )
        ? { ...chunk, content: "Only the Salon Director decides. Review PPTA." }
        : chunk,
    );
    expect(analyzeGroundingShadow(rows, PERFORMANCE_MANAGEMENT_FRAMEWORK).legacyOnlyGroups).toContain(
      "escalation_authority",
    );
  });
});

describe("runGroundingShadow", () => {
  const rows = pinned.chunks;

  it("is silent and returns null when off", () => {
    const log = vi.fn();
    expect(
      runGroundingShadow({ templateKey: "x", rows, role: PERFORMANCE_MANAGEMENT_FRAMEWORK, mode: "off", log }),
    ).toBeNull();
    expect(log).not.toHaveBeenCalled();
  });

  it("logs counts only: no Framework text, no form content", () => {
    const log = vi.fn();
    runGroundingShadow({
      templateKey: "corrective-action",
      rows,
      role: PERFORMANCE_MANAGEMENT_FRAMEWORK,
      mode: "shadow",
      log,
    });
    const line = log.mock.calls[0][0] as string;
    const event = JSON.parse(line);
    expect(event.event).toBe("forms.grounding.shadow");
    for (const row of rows) {
      for (const sentence of row.content.split(/\n+/).filter((text) => text.length > 30)) {
        expect(line).not.toContain(sentence.slice(0, 30));
      }
    }
    expect(Object.keys(event)).not.toContain("values");
  });

  it("does not mutate the grounding rows (the prompt is built from them)", () => {
    const before = JSON.stringify(rows);
    runGroundingShadow({
      templateKey: "x",
      rows,
      role: PERFORMANCE_MANAGEMENT_FRAMEWORK,
      mode: "shadow",
      log: () => {},
    });
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("never throws, even when logging fails", () => {
    expect(() =>
      runGroundingShadow({
        templateKey: "x",
        rows,
        role: PERFORMANCE_MANAGEMENT_FRAMEWORK,
        mode: "shadow",
        log: () => {
          throw new Error("log down");
        },
      }),
    ).not.toThrow();
  });
});

describe("which document families the diagnostic can see", () => {
  const governed = (key: string) => {
    const seed = TEMPLATE_SEEDS.find((entry) => entry.key === key)!;
    return performanceManagementGovernance({
      layoutFamily: seed.layoutFamily,
      document: parseFormDocument(seed.document),
      variantKey: defaultVariantKey(key),
    }).governed;
  };

  it.each([
    "dpoa",
    "follow-up-coaching",
    "sdit-epp",
    "tsd-epp",
    "asd-sdit-epp",
    "fttc-epp",
    "dmit-epp-tsd",
    "dmit-epp-dmit",
    "policy-review",
  ])("%s is governed, so its drafts reach the diagnostic", (key) => {
    expect(governed(key)).toBe(true);
  });

  it.each([
    "coaching",
    "resignation-exit",
    "position-transfer",
    "demotion",
    "prescreen-phone-interview",
    "management-interview-round-1",
    "management-interview-round-2",
    "tanning-consultant-interview",
  ])("%s never reaches the Framework, so drafting is unaffected", (key) => {
    expect(governed(key)).toBe(false);
  });
});

describe("data safety and unchanged safeguards", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("the shadow modules read and write nothing in the knowledge base or database", () => {
    for (const path of [
      "src/lib/forms/grounding-shadow.ts",
      "src/lib/forms/grounding-mode.ts",
      "src/lib/knowledge/legacy-segments.ts",
      "src/config/company/provenance.ts",
    ]) {
      expect(read(path), path).not.toMatch(/supabase|knowledge_chunks|knowledge_documents|\.insert\(|\.update\(|\.delete\(/i);
    }
  });

  it("the draft route calls the diagnostic after the fail-closed return and leaves the prompt block alone", () => {
    const route = read("src/app/api/forms/instances/[id]/draft/route.ts");
    const failClosed = route.indexOf("PM_DRAFT_UNAVAILABLE_NOTICE,");
    const hook = route.indexOf("runGroundingShadow({");
    const block = route.indexOf("const progressionBlock = progression?.ok");
    expect(failClosed).toBeGreaterThan(0);
    expect(hook).toBeGreaterThan(failClosed);
    expect(block).toBeGreaterThan(hook);
    expect(route.match(/runGroundingShadow\(/g)).toHaveLength(1);
    expect(route).toContain(
      "progression.grounding.rows\n          .map((row) => `[${row.document_title} — ${row.locator}]\\n${row.content}`)",
    );
  });

  it("origin is a registry fact, not set by any knowledge write", () => {
    expect(originForRole(PERFORMANCE_MANAGEMENT_FRAMEWORK.id)).toBe("legacy_stc");
    expect(originForRole("unknown")).toBeNull();
  });
});
