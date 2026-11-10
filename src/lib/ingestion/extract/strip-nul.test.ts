import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { extractDocument } = await import("./index");
const { withoutNulCharacters } = await import("./strip-nul");

/**
 * WOVEN_TEXT_NUL_STRIP_ENABLED. Ported from the sibling app (QA, 10 Nov 2026): three Woven equipment manuals there have
 * been "failed" since 4 Nov 2026 with "Chunks could not be saved: unsupported Unicode escape sequence": NUL characters
 * in the extracted text, which Postgres refuses. The document here is invented.
 */
const FLAG = "WOVEN_TEXT_NUL_STRIP_ENABLED";
const bytes = (text: string) => new TextEncoder().encode(text);
const MANUAL = "Mixer maintenance schedule\u0000\n\nReplace the paddle seal every 800 hours.\u0000\u0000 Reset the hour meter after.";

afterEach(() => vi.unstubAllEnvs());

describe("extracted text keeps no NUL character", () => {
  it("off (production today): the NUL characters reach the chunks (the bug)", async () => {
    const read = await extractDocument("txt", bytes(MANUAL));
    expect(read.segments.map((segment) => segment.text).join("")).toContain("\u0000");
  });

  it("on: no segment holds a NUL, and the words around it are kept", async () => {
    vi.stubEnv(FLAG, "true");
    const read = await extractDocument("txt", bytes(MANUAL));
    const text = read.segments.map((segment) => segment.text).join("\n");
    expect(text).not.toContain("\u0000");
    expect(text).toContain("Replace the paddle seal every 800 hours.");
    expect(read.characterCount).toBe(read.segments.reduce((total, segment) => total + segment.text.length, 0));
  });

  it("on: locators and sections are cleaned too; a NUL-only segment is dropped; OCR provenance is kept", () => {
    vi.stubEnv(FLAG, "true");
    const read = withoutNulCharacters({
      segments: [
        { text: "Seal\u0000 hours", locator: "Page 1 \u0000— Seals", page: 1, section: "Seals\u0000" },
        { text: "\u0000\u0000", locator: "Page 2", page: 2, section: null },
      ],
      characterCount: 13,
      pageCount: 2,
      ocr: { model: "m" },
    });
    expect(read.segments).toEqual([{ text: "Seal hours", locator: "Page 1 — Seals", page: 1, section: "Seals" }]);
    expect(read).toMatchObject({ characterCount: 10, pageCount: 2, ocr: { model: "m" } });
  });

  it("on: a document with no NUL is the same object", () => {
    vi.stubEnv(FLAG, "true");
    const clean = { segments: [{ text: "Seal hours", locator: "Page 1", page: 1, section: null }], characterCount: 10, pageCount: 1 };
    expect(withoutNulCharacters(clean)).toBe(clean);
  });
});
