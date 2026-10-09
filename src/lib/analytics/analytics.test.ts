import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/* A small roster, because the shipped one is deliberately empty. */
vi.mock("@/config/company/locations", () => ({
  LOCATION_CODE_PATTERN: /^[A-Za-z0-9][A-Za-z0-9-]{0,15}$/,
  COMPANY_LOCATION_ENTRIES: [
    { code: "101", name: "Testville Downtown", state: "TN", districtId: "dist-east" },
    { code: "102", name: "Testville Uptown", state: "TN", districtId: "dist-east" },
    { code: "201", name: "Sampleton Square", state: "MS", districtId: "dist-west" },
  ],
  COMPANY_DISTRICT_ENTRIES: [
    { id: "dist-east", name: "East", regionId: null },
    { id: "dist-west", name: "West", regionId: null },
    { id: "dist-empty", name: "Empty", regionId: null },
  ],
  COMPANY_REGION_ENTRIES: [],
}));

import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_FEATURES,
  CATEGORY_FEATURE,
  CATEGORY_LABEL,
  FEATURE_LABEL,
  categoryForTemplateKey,
  categoryLabel,
  classifyChatTurn,
  classifyQuestionText,
} from "./taxonomy";
import {
  DEFAULT_RANGE,
  EMPTY_FILTERS,
  bucketFor,
  hasActiveFilters,
  locationFilterFor,
  parseFilters,
  resolveWindow,
  serializeFilters,
} from "./filters";
import { changeAgainst } from "./queries";
import { ROLES } from "@/lib/permissions";

/* ------------------------------------------------------------ taxonomy --- */

describe("the taxonomy matches the database", () => {
  /*
   * THE ENUMS ARE DECLARED TWICE — once in the migration, once in TypeScript —
   * and a category added to one and not the other is silent: the database
   * returns a key, the label lookup misses, and a whole class of usage reads as
   * a raw identifier or vanishes from a chart. These read the migration as text
   * rather than trusting the two to be kept in step by hand.
   */
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const migrations = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
    .join("\n");

  /**
   * Reads BOTH declaration styles, because a Postgres enum grows in two ways:
   * the original `create type ... as enum (...)` and every later
   * `alter type ... add value`. Reading only the first would have passed while
   * the nine business topics existed in TypeScript and not in the database.
   */
  function enumValues(typeName: string): string[] {
    const created = migrations.split(`create type public.${typeName} as enum`)[1];
    const body = created?.split(");")[0] ?? "";
    const initial = [...body.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);

    const added = [
      ...migrations.matchAll(
        new RegExp(
          `alter type public\\.${typeName} add value(?: if not exists)? '([a-z_]+)'`,
          "g",
        ),
      ),
    ].map((match) => match[1]);

    return [...new Set([...initial, ...added])];
  }

  it("declares exactly the categories the migration does", () => {
    expect([...ACTIVITY_CATEGORIES].sort()).toEqual(
      enumValues("activity_category").sort(),
    );
  });

  it("declares exactly the features the migration does", () => {
    expect([...ACTIVITY_FEATURES].sort()).toEqual(
      enumValues("activity_feature").sort(),
    );
  });

  it("gives every category a label and an owning feature", () => {
    for (const category of ACTIVITY_CATEGORIES) {
      expect(CATEGORY_LABEL[category], category).toBeTruthy();
      expect(ACTIVITY_FEATURES).toContain(CATEGORY_FEATURE[category]);
    }
    for (const feature of ACTIVITY_FEATURES) {
      expect(FEATURE_LABEL[feature], feature).toBeTruthy();
    }
  });

  it("uses role names Postgres will accept as app_user_role", () => {
    /*
     * `filters.role` is passed straight into `analytics_*` as a typed
     * `app_user_role` argument. A role this app knows and the enum does not is
     * not a mislabel — it is a 22P02 from Postgres and an error page, and it
     * would only appear when somebody actually picked that role in the filter.
     * The enum is declared in the app_users migration; this reads it there.
     */
    const appUsers = readFileSync(
      join(process.cwd(), "supabase/migrations/20260904006000_app_users.sql"),
      "utf8",
    );
    const body =
      appUsers.split("create type public.app_user_role as enum")[1]?.split(");")[0] ?? "";
    const dbRoles = [...body.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);

    expect(dbRoles.length).toBeGreaterThan(0);
    expect([...ROLES].sort()).toEqual(dbRoles.sort());
  });

  it("shows an unknown key as itself rather than folding it into Other", () => {
    /*
     * A category a later migration adds must read as the thing it is, so the
     * gap is visible. "Other" would hide a whole kind of usage behind a word
     * that looks deliberate.
     */
    expect(categoryLabel("something_new")).toBe("something_new");
  });
});

describe("a chat turn is classified by evidence, strongest first", () => {
  const NOTHING = { hadReportContext: false, citedCategories: [] };

  it("calls any proposed template a form turn, whichever form it is", () => {
    /*
     * The strongest signal: the answer named a template key, so the turn
     * produced a form. It beats an attached report and citations, because
     * producing the form is what the manager came for.
     */
    expect(
      classifyChatTurn({
        ...NOTHING,
        proposedTemplateKey: "coaching",
        hadReportContext: true,
        citedCategories: ["policies_compliance"],
        question: "what is the attendance policy",
      }),
    ).toBe("form_created");
    expect(categoryForTemplateKey("some-new-template")).toBe("form_created");
    expect(categoryForTemplateKey("   ")).toBeNull();
    expect(categoryForTemplateKey(null)).toBeNull();
  });

  it("calls a turn that offered form choices a form request", () => {
    expect(
      classifyChatTurn({ ...NOTHING, offeredFormChoices: true }),
    ).toBe("form_request");
  });

  it("calls a turn carrying an attached report a report analysis", () => {
    expect(
      classifyChatTurn({
        ...NOTHING,
        hadReportContext: true,
        citedCategories: ["policies_compliance"],
        question: "how is my location doing",
      }),
    ).toBe("report_analysis");
  });

  it("takes the topic from the categories of the documents it cited", () => {
    /*
     * Authoritative metadata: the category was chosen when the document was
     * uploaded, and the citation reports it. No reading of the question needed.
     */
    expect(
      classifyChatTurn({ ...NOTHING, citedCategories: ["leadership_coaching"] }),
    ).toBe("team_guidance");
    expect(
      classifyChatTurn({ ...NOTHING, citedCategories: ["equipment_procedures"] }),
    ).toBe("equipment_procedures");
    expect(
      classifyChatTurn({ ...NOTHING, citedCategories: ["bonuses_compensation"] }),
    ).toBe("pay_benefits");
  });

  it("lets the most-cited category win", () => {
    expect(
      classifyChatTurn({
        ...NOTHING,
        citedCategories: ["training", "policies_compliance", "policies_compliance"],
      }),
    ).toBe("policy_question");
  });

  it("skips documents filed as 'other' rather than counting them", () => {
    /*
     * A turn citing three "other" documents and one safety document is a safety
     * question, not an unclassified one — "other" says nothing about the topic.
     */
    expect(
      classifyChatTurn({
        ...NOTHING,
        citedCategories: ["other", "other", "other", "safety"],
      }),
    ).toBe("safety_compliance");
  });

  it("reads the question only when nothing deterministic explained the turn", () => {
    expect(
      classifyChatTurn({ ...NOTHING, question: "the register equipment is broken" }),
    ).toBe("equipment_procedures");
    expect(
      classifyChatTurn({ ...NOTHING, question: "when does payroll close" }),
    ).toBe("pay_benefits");
    expect(
      classifyChatTurn({ ...NOTHING, question: "how do I handle a guest complaint" }),
    ).toBe("guest_experience");
  });

  it("prefers the longer phrase over the general word inside it", () => {
    /*
     * "return policy" is listed under policy and must not be decided by a
     * shorter operations word; "new hire" must beat "hire" alone only by being
     * longer, and both still land on hiring.
     */
    expect(classifyQuestionText("what is our return policy")).toBe("policy_question");
    expect(classifyQuestionText("paperwork for a new hire")).toBe("hiring_onboarding");
  });

  it("matches whole words, so 'pay' is not found inside 'paypal' or 'repay'", () => {
    expect(classifyQuestionText("can I repay this later")).toBeNull();
    expect(classifyQuestionText("when is pay day")).toBe("pay_benefits");
  });

  it("calls an ordinary question general guidance rather than inventing a topic", () => {
    expect(
      classifyChatTurn({ ...NOTHING, question: "thank you, that helps" }),
    ).toBe("general_guidance");
  });

  it("says unclassified when there was no evidence at all, not general guidance", () => {
    /*
     * Kept separate on purpose. If the evidence pipeline ever breaks, it should
     * appear as its own bar on the chart rather than quietly inflating a
     * category that means something specific.
     */
    expect(classifyChatTurn({ ...NOTHING })).toBe("unclassified");
    expect(classifyChatTurn({ ...NOTHING, question: "   " })).toBe("unclassified");
  });
});

/**
 * Source with its comments removed, so an assertion matches CODE.
 *
 * This project's standing rule for tests that read source text, and the files
 * checked below are exactly why it exists: `record.ts` and `/api/chat/route.ts`
 * both EXPLAIN, at length, that no question is ever persisted. Matching raw
 * text for the word "question" therefore fails on the sentence documenting the
 * guarantee rather than on any breach of it — the test would be satisfied only
 * by deleting the explanation, which is the opposite of what anyone wants.
 *
 * Block comments first, then line comments, then whitespace collapsed. A `//`
 * inside a string literal would be stripped too; nothing here contains one, and
 * the alternative is a parser for a test helper.
 */
function statementsOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("no question text can be persisted", () => {
  /*
   * THE GUARANTEE IS STRUCTURAL, and this is what enforces it: the event table
   * has no column a prompt could go in, and the writer has no field for one.
   * A future edit that adds either has to delete this test to do it.
   */
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const eventsMigration = readFileSync(
    join(migrationsDir, "20260911001000_activity_analytics.sql"),
    "utf8",
  );

  it("declares no text-bearing column on activity_events", () => {
    const table =
      eventsMigration
        .split("create table public.activity_events (")[1]
        ?.split(");")[0] ?? "";

    /*
     * COLUMN NAMES ONLY — the first identifier on each declaration line.
     * Scanning the whole block matched the TYPE `text` on `location_id text`
     * and failed for the opposite of the reason this test exists.
     */
    const columnNames = table
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) =>
          /^[a-z_]+\s+[a-z]/.test(line) &&
          !line.startsWith("constraint") &&
          !line.startsWith("--") &&
          !line.startsWith("*") &&
          !line.startsWith("/*"),
      )
      .map((line) => line.split(/\s+/)[0]);

    expect(columnNames.length).toBeGreaterThan(5);
    const statements = columnNames.join(" ");

    for (const forbidden of [
      "question",
      "prompt",
      "answer",
      "excerpt",
      "content",
      "message",
      "text",
      "hash",
    ]) {
      expect(statements, `activity_events declares ${forbidden}`).not.toMatch(
        new RegExp(`\\b${forbidden}\\b`),
      );
    }
  });

  it("gives the event writer no field for text", () => {
    const writer = readFileSync(
      join(process.cwd(), "src/lib/analytics/record.ts"),
      "utf8",
    );
    /*
     * COMMENTS STRIPPED FIRST, per this project's standing rule for tests that
     * match on source text: the file EXPLAINS the guarantee it must not break —
     * "there is no field for a question, a prompt or an answer" — so raw-text
     * matching hits the explanation and fails on the very prose that documents
     * the rule. What is asserted is the DECLARED FIELDS.
     */
    const contract = statementsOnly(
      writer.split("export interface ActivityRecord")[1]?.split("}")[0] ?? "",
    );
    expect(contract.length).toBeGreaterThan(0);
    for (const forbidden of ["question", "prompt", "answer", "text", "excerpt"]) {
      expect(contract, `ActivityRecord carries ${forbidden}`).not.toMatch(
        new RegExp(`\\b${forbidden}\\b`),
      );
    }
  });

  it("never passes the question on to the recorder", () => {
    /*
     * THE QUESTION IS READ, NEVER WRITTEN, and this asserts that as a property
     * of the whole route rather than of one call.
     *
     * IT USED TO COUNT OCCURRENCES inside a single named call, and a refactor
     * broke it twice without any privacy guarantee changing — first when the
     * recorder was awaited, then when the turn lifecycle split into open and
     * close. A guard that fails on rearrangement teaches people to edit the
     * guard. So the rule is stated directly: every mention of the question in
     * this route is an argument to a classifier or to the validator, and the
     * two calls that PERSIST anything carry no text field at all.
     */
    const route = statementsOnly(
      readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8"),
    );

    /* The only three things allowed to receive it, all of them read-only. */
    const READERS = ["classifyChatTurn({", "classifyTurnKind(", "requireString("];

    const mentions = [...route.matchAll(/[\w.]*\bbody\.question\b/g)];
    expect(mentions.length, "the question is never read at all").toBeGreaterThan(0);

    for (const mention of mentions) {
      const before = route.slice(Math.max(0, mention.index - 400), mention.index);
      const reader = READERS.find((fn) => before.lastIndexOf(fn) > before.lastIndexOf(");"));
      expect(
        reader,
        `body.question at ${mention.index} does not reach a classifier or the validator`,
      ).toBeTruthy();
    }

    /*
     * AND NOTHING THAT WRITES A ROW DECLARES A FIELD FOR TEXT. `openTurn` and
     * `closeTurn` are the two calls that reach the database; a `question:` key
     * inside either is only ever the classifier's own argument, so the record's
     * own fields are checked against the forbidden list.
     */
    for (const call of ["openTurn({", "closeTurn(turnId, {"]) {
      const body = route.split(call)[1]?.split("});")[0] ?? "";
      expect(body.length, `${call} is not in the route`).toBeGreaterThan(0);

      /* Strip the classifier arguments; what remains is the persisted record. */
      const persisted = body.replace(/classify\w+\(\{[\s\S]*?\}\)/g, " ").replace(
        /classify\w+\([^)]*\)/g,
        " ",
      );
      for (const forbidden of ["question", "prompt", "answer", "excerpt", "content"]) {
        expect(persisted, `${call} persists ${forbidden}`).not.toMatch(
          new RegExp(`\\b${forbidden}\\b`),
        );
      }
    }
  });
});

/* ------------------------------------------------------------- filters --- */

describe("filters survive the round trip through a URL", () => {
  it("restores everything that was set", () => {
    const filters = {
      range: "90d" as const,
      from: null,
      to: null,
      district: "dist-east",
      locationId: "loc-101",
      role: "location_manager" as const,
      actorId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      inactiveOnly: true,
    };
    expect(
      parseFilters(Object.fromEntries(new URLSearchParams(serializeFilters(filters)))),
    ).toEqual(filters);
  });

  it("omits an unset filter from the query string entirely", () => {
    expect(serializeFilters(EMPTY_FILTERS)).toBe("");
  });

  it("drops a district the roster does not know", () => {
    expect(parseFilters({ district: "dist-nowhere" }).district).toBeNull();
    expect(parseFilters({ district: "East" }).district).toBeNull();
  });

  it("resolves a district to its roster locations, and an empty one to nothing", () => {
    expect(locationFilterFor(EMPTY_FILTERS)).toBeNull();
    expect(locationFilterFor({ ...EMPTY_FILTERS, locationId: "loc-101" })).toEqual(["loc-101"]);
    expect(locationFilterFor({ ...EMPTY_FILTERS, district: "dist-east" })?.sort()).toEqual([
      "loc-101",
      "loc-102",
    ]);
    /* A known district with no locations narrows to NOTHING, never to everything. */
    expect(locationFilterFor({ ...EMPTY_FILTERS, district: "dist-empty" })).toEqual([]);
  });

  it("drops a location id that is not loc-<code>, and a leader id that is not a uuid", () => {
    /*
     * Both are passed to a Postgres function as typed arguments. A junk value
     * must come back as "no filter" rather than as an error page from the
     * database, which is what a hand-edited URL would otherwise produce.
     */
    const parsed = parseFilters({ location: "'; drop table", leader: "42" });
    expect(parseFilters({ location: "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d" }).locationId).toBeNull();
    expect(parsed.locationId).toBeNull();
    expect(parsed.actorId).toBeNull();
  });

  it("drops a role this build does not know", () => {
    expect(parseFilters({ role: "supreme_leader" }).role).toBeNull();
  });

  it("falls back to the default range rather than trusting a junk one", () => {
    expect(parseFilters({ range: "since_forever" }).range).toBe(DEFAULT_RANGE);
  });

  it("ignores half a custom window", () => {
    /*
     * One end of a range is not a range. Honouring it would pair a typed date
     * with a default boundary the reader never chose and never sees.
     */
    const parsed = parseFilters({ from: "2026-01-01" });
    expect(parsed.from).toBeNull();
    expect(parsed.to).toBeNull();
  });

  it("knows when something is actually narrowing the view", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, district: "dist-west" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, inactiveOnly: true })).toBe(true);
  });

  it("treats inactive-only as on for exactly \"1\"", () => {
    expect(parseFilters({ inactive: "1" }).inactiveOnly).toBe(true);
    expect(parseFilters({ inactive: "true" }).inactiveOnly).toBe(false);
    expect(parseFilters({ inactive: "maybe" }).inactiveOnly).toBe(false);
    expect(parseFilters({}).inactiveOnly).toBe(false);
  });
});

describe("the window and the one before it", () => {
  /*
   * BUSINESS-ZONE MIDNIGHTS, NOT UTC MIDNIGHTS. These expected values used to
   * be "T00:00:00.000Z", which is 7pm Central the evening before: the windows
   * dropped every evening's activity into the next day. Central Daylight Time
   * is UTC-5 (midnight = 05:00Z), Central Standard Time UTC-6 (06:00Z).
   */
  it("covers the anchor day and ends exclusively at the next Central midnight", () => {
    const window = resolveWindow({ ...EMPTY_FILTERS, range: "7d" }, "2026-09-11");
    expect(window.days).toBe(7);
    expect(window.from).toBe("2026-09-05T05:00:00.000Z");
    expect(window.fromDate).toBe("2026-09-05");
    /* Exclusive: the 12th is the boundary, so the 11th is fully included. */
    expect(window.to).toBe("2026-09-12T05:00:00.000Z");
    expect(window.toDate).toBe("2026-09-12");
  });

  it("compares against the same number of days immediately before", () => {
    const window = resolveWindow({ ...EMPTY_FILTERS, range: "30d" }, "2026-09-11");
    expect(window.previousTo).toBe(window.from);
    expect(window.previousToDate).toBe(window.fromDate);
    expect(window.fromDate).toBe("2026-08-13");
    expect(window.previousFromDate).toBe("2026-07-14");
    const length =
      Date.parse(window.previousTo) - Date.parse(window.previousFrom);
    expect(length).toBe(Date.parse(window.to) - Date.parse(window.from));
  });

  it("treats a custom end date as the last day the reader wants included", () => {
    const window = resolveWindow(
      { ...EMPTY_FILTERS, from: "2026-09-01", to: "2026-09-07" },
      "2026-09-11",
    );
    expect(window.days).toBe(7);
    expect(window.from).toBe("2026-09-01T05:00:00.000Z");
    expect(window.to).toBe("2026-09-08T05:00:00.000Z");
  });

  it("a single custom day is that Central day: midnight to midnight", () => {
    const window = resolveWindow(
      { ...EMPTY_FILTERS, from: "2026-10-09", to: "2026-10-09" },
      "2026-10-09",
    );
    expect(window.days).toBe(1);
    expect(window.from).toBe("2026-10-09T05:00:00.000Z");
    expect(window.to).toBe("2026-10-10T05:00:00.000Z");
    /* Yesterday, as the prior period. */
    expect(window.previousFrom).toBe("2026-10-08T05:00:00.000Z");
    expect(window.previousTo).toBe("2026-10-09T05:00:00.000Z");
  });

  it("uses Central Standard Time in winter", () => {
    const window = resolveWindow({ ...EMPTY_FILTERS, range: "7d" }, "2026-12-15");
    expect(window.from).toBe("2026-12-09T06:00:00.000Z");
    expect(window.to).toBe("2026-12-16T06:00:00.000Z");
  });

  it("counts days, not hours, across a daylight-saving change", () => {
    /* 1 November 2026 is 25 hours long; the week is still 7 days. */
    const fall = resolveWindow({ ...EMPTY_FILTERS, range: "7d" }, "2026-11-03");
    expect(fall.days).toBe(7);
    expect(fall.from).toBe("2026-10-28T05:00:00.000Z");
    expect(fall.to).toBe("2026-11-04T06:00:00.000Z");
    expect(fall.previousFromDate).toBe("2026-10-21");
    /* 8 March 2026 is 23 hours long. */
    const spring = resolveWindow({ ...EMPTY_FILTERS, from: "2026-03-08", to: "2026-03-08" }, "2026-03-10");
    expect(spring.days).toBe(1);
    expect(Date.parse(spring.to) - Date.parse(spring.from)).toBe(23 * 3_600_000);
  });

  it("starts this month and this year at Central midnight on their first day", () => {
    expect(
      resolveWindow({ ...EMPTY_FILTERS, range: "mtd" }, "2026-09-11").from,
    ).toBe("2026-09-01T05:00:00.000Z");
    expect(
      resolveWindow({ ...EMPTY_FILTERS, range: "ytd" }, "2026-09-11").from,
    ).toBe("2026-01-01T06:00:00.000Z");
  });

  it("coarsens the bucket as the window grows", () => {
    expect(bucketFor(30)).toBe("day");
    expect(bucketFor(365)).toBe("week");
    expect(bucketFor(900)).toBe("month");
  });
});

/* -------------------------------------------------------- the comparison -- */

describe("change against the prior period", () => {
  it("refuses to divide by an empty baseline", () => {
    /*
     * THE RULE THE BRIEF ASKED FOR IN AS MANY WORDS: no misleading percentage
     * when the comparison period has insufficient data. 0 to 7 is a first week
     * of use, not "+700%", and every four-figure percentage on a dashboard of
     * this kind is a small number divided by a smaller one.
     */
    expect(changeAgainst(7, 0)).toBeNull();
    expect(changeAgainst(0, 0)).toBeNull();
  });

  it("reports a real change as a percentage", () => {
    expect(changeAgainst(150, 100)).toBe(50);
    expect(changeAgainst(50, 100)).toBe(-50);
  });
});
