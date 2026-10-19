import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifySegment, classifySegments } from "./legacy-segments";

const FIXTURES = join(process.cwd(), "src/test/fixtures");

describe("classifySegment", () => {
  it.each([
    ["Spa % is the measure for the month.", "legacy_specific"],
    ["Review PPTA with the leader.", "legacy_specific"],
    ["Club Close is tracked weekly.", "legacy_specific"],
    ["Open the Routine Mat report.", "legacy_specific"],
    ["Check the Bonus Viewer.", "legacy_specific"],
    ["The SDIT completes the plan.", "legacy_specific"],
    ["Sun Tan City leaders handle this.", "legacy_specific"],
    ["Ask the Salon Director.", "legacy_specific"],
  ])("%s -> %s", (text, label) => {
    expect(classifySegment(text).label).toBe(label);
  });

  it.each([
    "Observe the behavior, state the expectation, and document the follow-up.",
    "Escalate only when a pattern continues after coaching.",
    "Choose the lowest appropriate rung of the ladder.",
    "Coaching is not a lecture.",
  ])("methodology: %s", (text) => {
    expect(classifySegment(text).label).toBe("methodology");
  });

  it("holds a sentence mixing method and a legacy fact as ambiguous", () => {
    expect(classifySegment("Coaching should cover PPTA before the next check-in.").label).toBe("ambiguous");
  });

  it("treats bare 'salon' as possible wording, not a fact", () => {
    expect(classifySegment("Protect the salon culture.").label).toBe("ambiguous");
  });

  it("does not treat 'client' or the Buff-confirmed DMIT as legacy", () => {
    expect(classifySegment("Protect the client experience.").label).toBe("methodology");
    expect(classifySegment("The DMIT meets the district manager.").label).toBe("methodology");
  });

  it("splits without changing text", () => {
    const segments = classifySegments("First sentence. Second one.\n- a bullet");
    expect(segments.map((s) => s.text)).toEqual(["First sentence.", "Second one.", "- a bullet"]);
  });
});

describe("Framework golden labels (NOT business-approved)", () => {
  const chunks = JSON.parse(readFileSync(join(FIXTURES, "framework-chunks.json"), "utf8")).chunks as {
    chunk_index: number;
    locator: string;
    content: string;
  }[];
  const actual = chunks.map((chunk) => ({
    chunk_index: chunk.chunk_index,
    locator: chunk.locator,
    segments: classifySegments(chunk.content).map((s) => ({
      text: s.text,
      label: s.label,
      concepts: s.concepts,
    })),
  }));
  const path = join(FIXTURES, "framework-segment-labels.json");
  const document = {
    _status: "ENGINEERING CLASSIFICATION — pending review by Buff HR and Operations. No label is business-approved.",
    chunks: actual,
  };

  it("matches the reviewed fixture (UPDATE_FRAMEWORK_LABELS=1 regenerates it)", () => {
    if (process.env.UPDATE_FRAMEWORK_LABELS === "1") {
      writeFileSync(path, `${JSON.stringify(document, null, 1)}\n`);
    }
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(document);
  });

  it("labels every segment and keeps every chunk verbatim", () => {
    for (const [index, chunk] of chunks.entries()) {
      const joined = actual[index].segments.map((s) => s.text).join(" ");
      expect(joined.replace(/\s+/g, " ")).toBe(chunk.content.replace(/\s+/g, " ").trim());
    }
  });
});
