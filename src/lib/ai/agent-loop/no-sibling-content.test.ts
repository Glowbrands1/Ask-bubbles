import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { BUBBLES_CONFIG } from "./app-config";
import { dataToolSpecs } from "./data-tools";
import { agentLoopRules } from "./prompt";
import { rulesBookText } from "./rules-book";
import { agentLoopTools } from "./run";

/*
 * ============================================================================
 * NOTHING OF THE SIBLING APP'S COMPANY IN THIS APP'S LOOP (QA2 for Pau, 21 Nov 2026)
 * ============================================================================
 *
 * Pau: the loop's logic is the sibling app's, but every company-specific thing comes from this app's own data: its
 * stores, its job titles, its own roster. So the rendered rules book, the system prompt, every tool description (and
 * the loop's own source and replay cases) name none of the sibling company's salons or cities, none of its own job
 * titles, and none of the people its loop fixtures and examples use.
 *
 * The list is kept as hashes, never as words: this repository is public and must not carry the other company's place
 * names, titles or people (CLAUDE.md: never copy one company's content into the other). Each entry is the first 16 hex
 * digits of sha256 of the normalised phrase (lower case; hyphens, apostrophes and full stops as spaces; single spaces),
 * and the text is checked by hashing every run of one to four words. Title abbreviations are checked case-sensitively
 * as "ABBR:<token>". Terms that are also this app's own (a store's city, a shared word) are left out of the list.
 */
const SIBLING_PHRASES: ReadonlySet<string> = new Set([
  "0c0506b937cd84a8", // the sentinel below
  "a5028e49f518c114",
  "0f030aae65fbec7f",
  "5a8255575e9883f7",
  "fae2b58bd1818dd8",
  "5e3ef00c4fd31ac9",
  "d4f2e0112c1edf14",
  "a26504d8cfde700f",
  "9a870f3f6bed21d2",
  "770430b11a30f820",
  "fdb827d1a99796cd",
  "54c11b7ff08beb61",
  "962314b7ef2f7000",
  "6aedf67476cd52d0",
  "5f4d1be4648f3241",
  "1a49bfba8f876f00",
  "794901857a837beb",
  "4e36a2d18e846bb0",
  "61939db3bc613b6d",
  "2405abced278737c",
  "dee06f6e75d944e9",
  "4bcb991b15bad758",
  "0ab506ec9eb5675d",
  "2591bd92df5783fc",
  "dd5d1388de187f6b",
  "58fbc3fbd8e151ee",
  "7c10558b62fae4a8",
  "dc00673ec3af3945",
  "2185577428060b73",
  "dc467fd99c0e2207",
  "d06941bbdf185e68",
  "6f12ebf934ac8261",
  "f03443d2e7cb3dae",
  "b0d3518b1abfb591",
  "cbf20eb8496f6cf1",
  "c0af0593c2cc56b8",
  "b7c9326d66874568",
  "be9611ba45536a55",
  "c5924fae93560d14",
  "fefd803478453a08",
  "5b69228247203166",
  "efe335d482607688",
  "64d532da7abc2e2f",
  "ae95f4b9f0e76768",
  "0824fd2d0c0d0883",
  "6c0c9335d5aa8d61",
  "a1fe1a0467c6cb75",
  "d523d77885ea1a72",
  "8754e2a544c5849c",
  "6a4bf1ee963b59bd",
  "121c7530b7d51917",
  "e85e7a4035ac4e44",
  "e5585ed39e668d35",
  "955baca6b620a7db",
  "24dd90c920beb23c",
  "e2dd3c62471c7f10",
  "d7ce1c3c7a236929",
  "8f2c2299415ce44d",
  "26e19f2b4dd93a3a",
]);
const SIBLING_ABBREVIATIONS: ReadonlySet<string> = new Set([
  "a673b99f860b77ef",
  "0c632b2ca2150218",
  "13faaf11cf743c4a",
  "1dded8411f0445d5",
  "c05d3c4c2bb47403",
]);
/** An invented phrase on the list, so the check is shown to catch a listed term (no real term is written here). */
const SENTINEL = "zephyrine quockerwodger";

const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);
const words = (text: string) => text.toLowerCase().replace(/[-'’.]/g, " ").split(/[^a-z0-9]+/).filter(Boolean);

/** Each listed term the text holds, as "<hash> in <where>" (the term itself is never printed). */
function siblingTerms(text: string, where: string): string[] {
  const found: string[] = [];
  const list = words(text);
  for (let start = 0; start < list.length; start += 1) {
    for (let size = 1; size <= 4 && start + size <= list.length; size += 1) {
      const key = hash(list.slice(start, start + size).join(" "));
      if (SIBLING_PHRASES.has(key)) found.push(`${key} in ${where} near "${list.slice(Math.max(0, start - 3), start).join(" ")} …"`);
    }
  }
  for (const token of text.split(/[^A-Za-z0-9]+/)) {
    const key = hash(`ABBR:${token}`);
    if (token && SIBLING_ABBREVIATIONS.has(key)) found.push(`${key} (a title abbreviation) in ${where}`);
  }
  return found;
}

function files(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, keep);
    return keep(name) ? [path] : [];
  });
}

describe("the loop names nothing of the sibling app's company", () => {
  it("the check catches a listed phrase (self-check, with an invented sentinel)", () => {
    expect(SIBLING_PHRASES.has(hash(SENTINEL))).toBe(true);
    expect(siblingTerms(`Make a CA for ${SENTINEL.replace(" ", "-")} today.`, "probe")).toHaveLength(1);
    expect(siblingTerms("Make a CA for Remy Calder at the store.", "probe")).toEqual([]);
    expect(SIBLING_PHRASES.size).toBeGreaterThan(40);
    expect(SIBLING_ABBREVIATIONS.size).toBe(5);
  });

  it("the rendered rules book, system prompt and tool descriptions", () => {
    const tools = [...agentLoopTools(BUBBLES_CONFIG), ...dataToolSpecs(BUBBLES_CONFIG)];
    expect(tools.length).toBeGreaterThan(10);
    const found = [
      ...siblingTerms(rulesBookText(), "the rules book"),
      ...siblingTerms(agentLoopRules(), "the system prompt"),
      ...tools.flatMap((tool) => siblingTerms(JSON.stringify(tool), `the ${tool.name} tool`)),
    ];
    expect(found).toEqual([]);
  });

  it("the loop's own source, its company config and its replay cases", () => {
    const sources = [
      ...files("src/lib/ai/agent-loop", (name) => /\.tsx?$/.test(name) && name !== "no-sibling-content.test.ts" && name !== "job-titles.test.ts"),
      "src/config/company/agent-loop.ts",
      ...files("src/app/api/chat/replay-pack", (name) => /loop/.test(name)),
    ];
    const found = sources.flatMap((path) => siblingTerms(readFileSync(path, "utf8"), path));
    expect(found).toEqual([]);
  });
});
