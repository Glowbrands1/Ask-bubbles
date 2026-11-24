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
 * (That interview was later removed from the library altogether and its key
 * retired: Pau, via QA, 21 Nov 2026.)
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

const REMOVED_INTERVIEW = "tanning-consultant-interview";

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
   * THE TEAM MEMBER INTERVIEW FORM'S KEY (Pau, 23 Nov 2026). The consultant interview removed on 21 Nov is back as Buff
   * City Soap's Team Member Interview Form; its name, description, revision note, PDF name and every question are Buff
   * City Soap's. Only its KEY keeps the old word, so the row, its versions and any form filed against it keep their
   * name. Config no longer names it (not hidden, not retired).
   *
   * The management interviews' role play and training question, once held here while the interviews were hidden, are
   * Buff City Soap's now (Pau, 23 Nov: BCS terms in the forms), so nothing on them is excused. CHANGED ON PURPOSE.
   */
  {
    where: REMOVED_INTERVIEW,
    text: REMOVED_INTERVIEW,
    phrase: "tanning",
    reason: "the Team Member Interview Form's key, kept so its row and history keep their name (Pau, 23 Nov 2026)",
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
    // Walked again (Pau, 23 Nov 2026): the Team Member Interview Form is seeded under the old key.
    expect(walked).toContain(REMOVED_INTERVIEW);
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

  /*
   * CHANGED ON PURPOSE (Pau, 23 Nov: BCS terms in the forms): the consultant interview is seeded again as Buff City Soap's Team Member
   * Interview Form, under its old key, and no longer retired; its core-values heading names no company.
   */
  it("the Team Member Interview Form is seeded under the old key, not retired, its core values naming no company", () => {
    const seed = HIRING_TEMPLATE_SEEDS.find((entry) => entry.key === REMOVED_INTERVIEW);
    expect(seed?.name).toBe("Team Member Interview Form");
    expect(retiredConfig.RETIRED_TEMPLATE_KEYS).not.toContain(REMOVED_INTERVIEW);
    expect(JSON.stringify(seed?.document)).toContain('"label":"Core Values"');
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

  it("everything excused on a template is on a hidden template, except the confirmed Sunlync step and the kept key", () => {
    for (const entry of ALLOWED) {
      if (entry.where === "config" || entry.phrase === "Sunlync" || entry.text === REMOVED_INTERVIEW) continue;
      expect(isHiddenTemplate(entry.where), entry.where).toBe(true);
    }
  });

  it("no allowed phrase is the sibling company's name", () => {
    for (const entry of ALLOWED) expect(entry.phrase).not.toMatch(/sun\s*tan\s*city|\bSTC\b|ask\s*sunny|1BA00000/i);
  });
});
