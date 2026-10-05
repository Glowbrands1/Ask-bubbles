import { describe, expect, it } from "vitest";

import {
  assertPathWithinScope,
  buildStoragePath,
  sanitizeFileName,
  scopePrefix,
} from "./paths";

describe("sanitizeFileName", () => {
  it("keeps a normal name intact", () => {
    expect(sanitizeFileName("Attendance-Policy_v2.pdf")).toBe("Attendance-Policy_v2.pdf");
  });

  it("strips directory traversal entirely", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("..\\..\\windows\\system32\\config")).toBe("config");
  });

  it("never returns a separator or a dot segment", () => {
    for (const name of ["../", "..", ".", "/", "//", "....//", "a/b/../c.pdf"]) {
      const safe = sanitizeFileName(name);
      expect(safe).not.toContain("/");
      expect(safe).not.toContain("\\");
      expect(safe).not.toBe("..");
      expect(safe).not.toBe(".");
      expect(safe.length).toBeGreaterThan(0);
    }
  });

  it("replaces characters that are unsafe in an object key", () => {
    expect(sanitizeFileName("policy #1 (final)?.pdf")).toBe("policy-1-final-.pdf");
  });

  it("caps the length while keeping the extension", () => {
    const safe = sanitizeFileName(`${"a".repeat(400)}.pdf`);
    expect(safe.endsWith(".pdf")).toBe(true);
    expect(safe.length).toBeLessThanOrEqual(96);
  });

  it("falls back rather than returning an empty name", () => {
    expect(sanitizeFileName("...", "document")).toBe("document");
  });
});

describe("buildStoragePath", () => {
  it("is collision-safe across documents and versions", () => {
    const a = buildStoragePath({ scopeId: "other-core", documentId: "doc-1", version: 1, fileName: "policy.pdf" });
    const b = buildStoragePath({ scopeId: "other-core", documentId: "doc-2", version: 1, fileName: "policy.pdf" });
    const c = buildStoragePath({ scopeId: "other-core", documentId: "doc-1", version: 2, fileName: "policy.pdf" });

    expect(new Set([a, b, c]).size).toBe(3);
    expect(a).toBe("other-core/doc-1/v1/policy.pdf");
  });

  it("cannot be escaped by a hostile file name", () => {
    const path = buildStoragePath({
      scopeId: "other-core",
      documentId: "doc-1",
      version: 1,
      fileName: "../../../other-tenant/secret.pdf",
    });
    expect(path).toBe("other-core/doc-1/v1/secret.pdf");
    expect(path.startsWith(scopePrefix("other-core"))).toBe(true);
  });
});

describe("assertPathWithinScope", () => {
  it("accepts a path the server generated", () => {
    const path = buildStoragePath({ scopeId: "other-core", documentId: "d", version: 1, fileName: "a.pdf" });
    expect(assertPathWithinScope(path, "other-core")).toBe(path);
  });

  it("rejects traversal, absolute paths and separators", () => {
    for (const bad of [
      "other-core/../bcs-core/secret.pdf",
      "/other-core/d/v1/a.pdf",
      "other-core//d/v1/a.pdf",
      "other-core\\d\\v1\\a.pdf",
      "other-core/./a.pdf",
    ]) {
      expect(() => assertPathWithinScope(bad, "other-core")).toThrow();
    }
  });

  it("rejects a path belonging to another knowledge scope", () => {
    expect(() => assertPathWithinScope("bcs-core/d/v1/a.pdf", "other-core")).toThrow(
      /outside the requested knowledge scope/,
    );
  });

  it("rejects an empty or absurdly long path", () => {
    expect(() => assertPathWithinScope("", "other-core")).toThrow();
    expect(() => assertPathWithinScope(`other-core/${"a".repeat(600)}`, "other-core")).toThrow();
  });
});

describe("file names with brackets", () => {
  it.each([
    ["Example Exit(1).docx", "Example-Exit-1-.docx"],
    ["Demotion Form (3).docx", "Demotion-Form-3-.docx"],
  ])("keeps %s as a usable file rather than dropping it", (name, stored) => {
    expect(sanitizeFileName(name)).toBe(stored);
  });
});
