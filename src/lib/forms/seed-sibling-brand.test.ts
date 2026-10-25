import { describe, expect, it } from "vitest";

import * as categoriesConfig from "@/config/company/forms/categories";
import { EXAMPLE_CHECK_IN_SEED } from "@/config/company/forms/example-check-in";
import * as exitSystemsConfig from "@/config/company/forms/exit-systems";
import { HIDDEN_TEMPLATE_KEYS, isHiddenTemplate } from "@/config/company/forms/hidden";
import * as letterheadConfig from "@/config/company/forms/letterhead";
import * as retiredConfig from "@/config/company/forms/retired";

import { EMPLOYMENT_CHANGE_TEMPLATE_SEEDS } from "./employment-change-library";
import { EXIT_TEMPLATE_SEEDS } from "./exit-library";
import { HIRING_TEMPLATE_SEEDS } from "./hiring-library";
import { HR_TEMPLATE_SEEDS, MIGRATED_TEMPLATE_SEEDS, TEMPLATE_SEEDS } from "./library";

/**
 * ============================================================================
 * NO SUN TAN CITY CONTENT IN ANY BUFF CITY SOAP FORM SEED
 * ============================================================================
 *
 * QA, 25 Oct 2026: the hidden Tanning Consultant Interview's seed still
 * printed "Sun Tan City Core Values" under the Buff City Soap letterhead.
 * Hiding a template keeps it out of every list, but the seeder still writes
 * its row, so a hidden seed is held to the same rule as a listed one.
 *
 * Every string of every seed in every form library — HR, exit, employment
 * change, hiring (the hidden interviews included) and the retired example —
 * is walked, and so is every string the forms config exports. Each one is
 * a real value, not a grep of the source, so wording that arrives through a
 * template literal or a config constant is caught too.
 *
 * WHAT IS ALLOWED, AND WHY, IS LISTED BELOW AND NOWHERE ELSE. Each entry is
 * one exact string and the one phrase in it that may stay; any other sibling
 * term in that same string still fails. An entry that no longer matches a
 * real string fails as well, so the list cannot outlive what it excuses.
 *
 * Mirrored in Ask Sunny (`src/lib/forms/seed-sibling-brand.test.ts`), which
 * checks Sunny's seeds for Buff City Soap content.
 */
const SIBLING_CONTENT =
  /sun\s*tan\s*city|suntancity|\bSTC\b|sunless|tanning|\btan\s+consultants?\b|sunlync|1BA00000|ask\s*sunny|\bUV\b/i;

interface Allowed {
  /** The template key the string belongs to, or "config" for a forms config export. */
  where: string;
  /** The exact string. */
  text: string;
  /** The one phrase inside `text` that may stay. */
  phrase: string;
  reason: string;
}

const HIDDEN_INTERVIEW = "tanning-consultant-interview";

const ALLOWED: Allowed[] = [
  /*
   * Sunlync is Buff City Soap's system too (Pau, via QA, 25 Oct 2026; see
   * `config/company/forms/exit-systems.ts`). The step keeps the source wording.
   */
  {
    where: "resignation-exit",
    text: "Place comment on employee’s Sunlync account stating they are no longer employed.",
    phrase: "Sunlync",
    reason: "Buff City Soap uses Sunlync (Pau, via QA, 25 Oct 2026)",
  },
  {
    where: "config",
    text: "Sunlync",
    phrase: "Sunlync",
    reason: "EXIT_ACCOUNT_SYSTEM: Buff City Soap uses Sunlync (Pau, via QA, 25 Oct 2026)",
  },
  /*
   * THE HIDDEN TANNING CONSULTANT INTERVIEW'S IDENTITY. Its key is how
   * `hidden.ts`, the chooser and the intent matchers refer to it, and its name,
   * title, description, revision note and bundled PDF name are the database
   * row's identity: renaming them would publish a different template. The
   * role name may stay there; no Sun Tan City brand wording may.
   */
  { where: HIDDEN_INTERVIEW, text: HIDDEN_INTERVIEW, phrase: "tanning", reason: "hidden template's key (hidden.ts refers to it by key)" },
  { where: "config", text: HIDDEN_INTERVIEW, phrase: "tanning", reason: "HIDDEN_TEMPLATE_KEYS names the hidden template by key" },
  {
    where: HIDDEN_INTERVIEW,
    text: "Tanning Consultant Interview Form",
    phrase: "Tanning Consultant",
    reason: "hidden template's name and letterhead title",
  },
  {
    where: HIDDEN_INTERVIEW,
    text: "The in-store interview for a Tanning Consultant. Twelve questions through service, sales, accountability, the core values and the essential job functions.",
    phrase: "Tanning Consultant",
    reason: "hidden template's description, which repeats its title",
  },
  {
    where: HIDDEN_INTERVIEW,
    text: "Published from the 03. Tanning Consultant Interview Form source document.",
    phrase: "Tanning Consultant",
    reason: "hidden template's revision note, naming its source document",
  },
  {
    where: HIDDEN_INTERVIEW,
    text: "Tanning Consultant Interview Form.pdf",
    phrase: "Tanning Consultant",
    reason: "hidden template's bundled PDF name",
  },
  /*
   * HELD FOR THE BUSINESS, IN HIDDEN TEMPLATES ONLY. These two questions of the
   * hidden management interviews are the reference platform's role play and
   * training question. Replacing them means writing new hiring content, which
   * is Buff City Soap HR's to supply (residue review B7, B8; Phase 2A M1-1 and
   * M2-2 held); hiding the interviews was the decision taken instead (Pau, via
   * QA, 25 Oct 2026). A test below requires both templates to stay hidden.
   */
  {
    where: "management-interview-round-1",
    text: "A client approaches the counter upset because the tanning bed they reserved is unavailable due to a mechanical issue. They are raising their voice and demanding a refund, while other clients are in the store. Show how you would handle the client in the moment and explain the steps you would take afterward to address the root cause.",
    phrase: "tanning bed",
    reason: "held: hidden interview's role play, replacement scenario awaits Buff City Soap HR (B7, M1-1)",
  },
  {
    where: "management-interview-round-2",
    text: "How would you create a 30–60–90 day training plan for a new Assistant Store Director or Tanning Consultant?",
    phrase: "Tanning Consultant",
    reason: "held: hidden interview's training question, replacement awaits Buff City Soap HR (B8, M2-2)",
  },
];

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => strings(entry, out));
  else if (value && typeof value === "object") Object.values(value).forEach((entry) => strings(entry, out));
  return out;
}

function leftover(where: string, text: string): string {
  return ALLOWED.filter((entry) => entry.where === where && entry.text === text).reduce(
    (rest, entry) => rest.split(entry.phrase).join(""),
    text,
  );
}

const ALL_SEEDS = [...TEMPLATE_SEEDS, EXAMPLE_CHECK_IN_SEED];
/* `COMPANY_FORMS` (config/company/forms/index.ts) is built from TEMPLATE_SEEDS, walked above per template. */
const CONFIG = [categoriesConfig, exitSystemsConfig, { HIDDEN_TEMPLATE_KEYS }, letterheadConfig, retiredConfig];

const seedStrings = ALL_SEEDS.map((seed) => ({ where: seed.key, texts: strings(seed) }));
const configStrings = { where: "config", texts: CONFIG.flatMap((module) => strings(module)) };

describe("every Buff City Soap form seed is free of Sun Tan City content", () => {
  it("the walk covers every form library, the hidden templates and the retired example", () => {
    expect(MIGRATED_TEMPLATE_SEEDS.map((seed) => seed.key).sort()).toEqual(
      [...HR_TEMPLATE_SEEDS, ...EXIT_TEMPLATE_SEEDS, ...EMPLOYMENT_CHANGE_TEMPLATE_SEEDS, ...HIRING_TEMPLATE_SEEDS]
        .map((seed) => seed.key)
        .sort(),
    );
    const walked = seedStrings.map((entry) => entry.where);
    for (const key of [...MIGRATED_TEMPLATE_SEEDS.map((seed) => seed.key), ...HIDDEN_TEMPLATE_KEYS, EXAMPLE_CHECK_IN_SEED.key]) {
      expect(walked, key).toContain(key);
    }
  });

  it.each(seedStrings.map((entry) => [entry.where, entry] as const))("%s: no sibling-company wording", (_key, entry) => {
    const hits = entry.texts
      .map((text) => ({ text, rest: leftover(entry.where, text) }))
      .filter(({ rest }) => SIBLING_CONTENT.test(rest))
      .map(({ text }) => text);
    expect(hits).toEqual([]);
  });

  it("the forms config exports no sibling-company wording", () => {
    const hits = configStrings.texts.filter((text) => SIBLING_CONTENT.test(leftover("config", text)));
    expect(hits).toEqual([]);
  });

  it("the Tanning Consultant Interview's core-values heading names no company", () => {
    const reference = (HIRING_TEMPLATE_SEEDS.find((seed) => seed.key === HIDDEN_INTERVIEW)!.document.blocks as {
      kind: string;
      label?: string;
    }[]).find((block) => block.kind === "reference");
    // "Core Values" is the JBA Policy Manual's own heading for these five values (p.7), which Ask Bubbles cites.
    expect(reference?.label).toBe("Core Values");
  });
});

describe("the allow-list stays narrow", () => {
  it("every entry matches a real string, and its phrase is in that string", () => {
    const all = [...seedStrings, configStrings];
    for (const entry of ALLOWED) {
      expect(entry.text, entry.reason).toContain(entry.phrase);
      const source = all.find((candidate) => candidate.where === entry.where);
      expect(source?.texts, `${entry.where}: ${entry.reason}`).toContain(entry.text);
    }
  });

  it("the Sunlync entries are the confirmed exit system, nothing wider", () => {
    expect(exitSystemsConfig.EXIT_ACCOUNT_SYSTEM).toBe("Sunlync");
  });

  it("everything excused on a template is on a hidden template, except the confirmed Sunlync step", () => {
    for (const entry of ALLOWED) {
      if (entry.where === "config" || entry.phrase === "Sunlync") continue;
      expect(isHiddenTemplate(entry.where), entry.where).toBe(true);
    }
  });

  it("no allowed phrase is the sibling company's name", () => {
    for (const entry of ALLOWED) expect(entry.phrase).not.toMatch(/sun\s*tan\s*city|\bSTC\b|ask\s*sunny|1BA00000/i);
  });
});
