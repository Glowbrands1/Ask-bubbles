import { extractEmployeeNames } from "@/lib/forms/proposal";
import { displayName, matchEmployeeName, type RosterEmployee } from "@/lib/forms/employee-match";
import { loadScopedRosterResult } from "@/lib/forms/employee-roster";
import { unverifiedWithoutRecord, verifyEmployee } from "@/lib/forms/employee-verification";
import { namedStoreIds } from "@/lib/forms/location-scope";
import { locationById } from "@/lib/locations";
import { describeStore, readStoreMentions, type StoreIndex } from "@/lib/stores/resolver";
import { loadKnownTitles, loadStoreIndex } from "@/lib/stores/woven-aliases";
import { neutralizeTitles } from "@/lib/forms/known-titles";

import type { ChatActor } from "./form-proposal";
import type { AskResponse } from "./types";

/**
 * ============================================================================
 * WHO AND WHICH STORE, IN ANY QUESTION — NOT ONLY WHEN A FORM IS BEING MADE
 * ============================================================================
 *
 * "What's Sarah Miller's job title?" and "Which store is 236?" are answered
 * from the same two sources a form is built from: the registered stores (via
 * the shared resolver) and the scoped Woven employee directory (via the shared
 * verifier). Nothing about a person or a store is taken from the model.
 *
 *   A LOOKUP IS ANSWERED OUTRIGHT. A question that only asks for a title, or
 *   for what a store is, gets the verified record (or the plain statement that
 *   it could not be verified) and no model call at all.
 *
 *   ANYTHING ELSE IS GIVEN THE RECORD. When the question is about something
 *   else — a policy, a plan — and also names a person or store, the verified
 *   records ride along as a block the prompt says is the only source for a
 *   title, a store assignment or an employment status.
 *
 * AUTHORIZED SCOPE ONLY. Employees come from `loadScopedRosterResult`, which is
 * restricted to the stores the actor's own scope contains (a district manager
 * is checked across the district) and to the one pinned Woven company. Someone
 * outside that scope is indistinguishable from someone Woven does not have, so
 * nothing about their existence is revealed.
 *
 * READ-ONLY. Never writes to Woven or to the directory. Never throws: any
 * failure here leaves the question to be answered as it always was.
 */

const FOLD = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const TITLE_ASK = /\b(?:job\s+)?(?:title|position|role)\b|\bwhat\s+does\s+\w+(?:\s+\w+)?\s+do\b/i;
const LOOKUP_VERB = /\b(?:what|which|who|tell me|confirm|verify|check|look\s*up|find|is|are)\b/i;
const STORE_ASK = /\b(?:store|location)\b/i;
const MAX_LOOKUP_WORDS = 22;
const PRONOUN = /\b(?:she|he|they|her|hers|his|their|theirs|him|them)\b/i;
const ABOUT_PERSON = /\b(?:store|stores|work|works|working|employed|employment|active|status|located|where)\b/i;
const HISTORY_TURNS = 8;

/** Whole-word, whole-name occurrences of roster employees in a question. */
function employeesNamed(question: string, roster: readonly RosterEmployee[]): RosterEmployee[] {
  const text = ` ${FOLD(question)} `;
  const found = new Map<string, RosterEmployee>();
  for (const employee of roster) {
    const last = FOLD(employee.lastName);
    for (const first of [employee.firstName, employee.preferredFirstName ?? ""]) {
      const name = `${FOLD(first)} ${last}`.trim();
      if (name.includes(" ") && text.includes(` ${name} `)) found.set(employee.id, employee);
    }
  }
  return [...found.values()];
}

function formatDate(iso: string | null | undefined): string | null {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(at)) return null;
  return new Date(at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  });
}

const storeLabel = (id: string) => {
  const store = locationById(id);
  return store ? describeStore(store) : id;
};

export interface EntityFacts {
  /** The verified records for the prompt, or null when the question names nobody and nothing. */
  readonly block: string | null;
  /** A complete answer, for a question that is only a lookup. */
  readonly direct: AskResponse | null;
}

const NONE: EntityFacts = { block: null, direct: null };

export async function resolveChatEntities(input: {
  question: string;
  /** The conversation so far, so "what about her title?" can be tied to the person already established. */
  history?: readonly { role: string; content: string }[];
  actor: ChatActor;
  index?: StoreIndex;
  now?: number;
}): Promise<EntityFacts> {
  try {
    return await resolve(input);
  } catch {
    return NONE;
  }
}

async function resolve({ question: asked, history = [], actor, index: given, now }: {
  question: string;
  history?: readonly { role: string; content: string }[];
  actor: ChatActor;
  index?: StoreIndex;
  now?: number;
}): Promise<EntityFacts> {
  // A Woven job title ("Assistant General Manager") is not a person.
  const titles = await loadKnownTitles();
  const question = neutralizeTitles(asked, titles);
  // "Sarah Miller's title" names Sarah Miller; "What's" is not part of a name.
  const unpossessed = question.replace(/['’]s\b/gi, "");
  const capitalisedPair = /\b[A-Z][a-zA-Z'’-]+\s+[A-Z][a-zA-Z'’-]+\b/.test(unpossessed);
  const typedNames = extractEmployeeNames(unpossessed)
    .map((name) => name.replace(/^(?:what|which|who|whom|how|where|when|why|is|are|does|do|can|could|tell me|check|confirm|verify|find)\s+/i, "").trim())
    .filter((name) => name.length > 0);
  const index = given ?? (await loadStoreIndex());
  const reading = readStoreMentions(question, index);
  const namesStore = reading.mentions.length > 0 || reading.unmatched.length > 0;

  /*
   * "WHAT ABOUT HER TITLE?" — a pronoun about somebody the conversation has
   * clearly established. Clear means the most recent turn that names anyone in
   * the asker's scope names exactly one person. Anything less is not guessed:
   * the model is told to ask who is meant.
   */
  const pronounAsk =
    PRONOUN.test(question) && (TITLE_ASK.test(question) || ABOUT_PERSON.test(question)) && typedNames.length === 0 && !capitalisedPair;

  if (!namesStore && !capitalisedPair && typedNames.length === 0 && !pronounAsk) return NONE;

  const lines: string[] = [];
  const direct: string[] = [];
  const storeIds = namedStoreIds(question, undefined, index);

  /* ------------------------------------------------------------- stores */
  const firm = reading.mentions.filter((mention) => !mention.confirm);
  const soft = reading.mentions.filter((mention) => mention.confirm);
  const named = [...new Set(firm.flatMap((mention) => mention.locationIds))];
  if (named.length === 1) {
    lines.push(`Store: the question names ${storeLabel(named[0]!)}.`);
  } else if (named.length > 1) {
    const collision = firm.find((mention) => mention.numbering);
    if (collision?.numbering) {
      const system = collision.numbering;
      lines.push(
        `Store: "${system.number}" is ambiguous because Buff City Soap and Woven number stores differently — in Buff City Soap's numbering it is ${system.buff.map(storeLabel).join(" or ")}; in Woven it is ${system.woven.filter((id) => !system.buff.includes(id)).map(storeLabel).join(" or ")}. Ask which they mean.`,
      );
    } else {
      lines.push(`Store: the question could mean ${named.map(storeLabel).join(" or ")}. Ask which.`);
    }
  } else if (soft.length > 0) {
    const ids = [...new Set(soft.flatMap((mention) => mention.locationIds))];
    lines.push(`Store: the question may mean ${ids.map(storeLabel).join(" or ")} (a typo or abbreviation) — confirm before relying on it.`);
  }
  if (named.length === 0 && soft.length === 0 && reading.unmatched.length > 0) {
    lines.push(
      `Store: "${reading.unmatched[0]}" is not a registered Buff City Soap store. Say so; do not guess a store or invent one.`,
    );
  }

  /* ---------------------------------------------------------- employees */
  const asksTitle = TITLE_ASK.test(question);
  const employees: string[] = [];
  let singleLookup: { employee: RosterEmployee; title: string | null; verified: boolean } | null = null;
  let candidatesAsked = false;

  if (capitalisedPair || typedNames.length > 0 || pronounAsk) {
    const loaded = await loadScopedRosterResult(actor.scope);
    if (loaded.status === "ok" && loaded.roster.length > 0) {
      const matched = new Map<string, RosterEmployee>();
      for (const employee of employeesNamed(unpossessed, loaded.roster)) matched.set(employee.id, employee);
      let unclearWho = false;
      if (pronounAsk) {
        for (const turn of [...history].reverse().slice(0, HISTORY_TURNS)) {
          if (typeof turn.content !== "string") continue;
          const people = employeesNamed(neutralizeTitles(turn.content, titles).replace(/['’]s\b/gi, ""), loaded.roster);
          if (people.length === 0) continue;
          if (people.length === 1) matched.set(people[0]!.id, people[0]!);
          else unclearWho = true;
          break;
        }
        if (matched.size === 0) unclearWho = true;
      }
      if (unclearWho) {
        employees.push(
          "Employee: the question refers to someone by a pronoun and the conversation does not clearly establish who. Ask who they mean; do not state a title, store or status for anyone.",
        );
        candidatesAsked = true;
        if (asksTitle) direct.push("Who do you mean? I can look up a job title once I know which employee — tell me their full name.");
      }
      const confirm: string[] = [];
      for (const typed of typedNames) {
        const result = matchEmployeeName(typed, loaded.roster);
        if (result.kind === "exact") matched.set(result.employee.id, result.employee);
        else if (result.kind === "confirm" && !employeesNamed(typed, loaded.roster).length) {
          confirm.push(...result.candidates.map((candidate) => candidate.name));
        }
      }

      // Two people of one name: the store the question names settles it, otherwise ask.
      const byName = new Map<string, RosterEmployee[]>();
      for (const employee of matched.values()) {
        const key = displayName(employee).toLowerCase();
        byName.set(key, [...(byName.get(key) ?? []), employee]);
      }
      for (const [, people] of byName) {
        let pool = people;
        if (pool.length > 1 && storeIds.length > 0) {
          const atNamed = pool.filter((person) => person.locationIds.some((id) => storeIds.includes(id)));
          if (atNamed.length > 0) pool = atNamed;
        }
        if (pool.length > 1) {
          const stores = [...new Set(pool.flatMap((person) => person.locationIds))].map(storeLabel);
          employees.push(
            `Employee: more than one ${displayName(pool[0]!)} works at the asker's stores${stores.length ? ` (${stores.join(" and ")})` : ""}. Ask which store; do not choose or state a title.`,
          );
          candidatesAsked = true;
          if (asksTitle) {
            direct.push(
              `More than one **${displayName(pool[0]!)}** works at your stores${stores.length ? ` — ${stores.join(" and ")}` : ""}. Which store is the one you mean?`,
            );
          }
          continue;
        }
        const employee = pool[0]!;
        const outcome = verifyEmployee({ employee, namedStoreIds: storeIds, storeLabel, ...(now ? { now } : {}) });
        const synced = formatDate(employee.lastSyncedAt);
        const where = employee.locationIds.map(storeLabel).join(" and ");
        if (outcome.verification.status === "verified") {
          employees.push(
            `Employee: ${displayName(employee)} — Woven job title: ${outcome.verification.title}${where ? `; Woven store: ${where}` : ""}; employment status: ${employee.employmentStatus ?? "unknown"}${synced ? `; Woven record last synced ${synced}` : ""}.${outcome.note ? ` ${outcome.note.replace(/\*\*/g, "")}` : ""}`,
          );
        } else {
          employees.push(`Employee: ${displayName(employee)} — NOT VERIFIED. ${(outcome.note ?? "").replace(/\*\*/g, "")}`);
        }
        singleLookup = { employee, title: outcome.verification.title, verified: outcome.verification.status === "verified" };
        if (outcome.verification.status === "verified" && asksTitle) {
          direct.push(
            `**${displayName(employee)}**'s job title in Woven is **${outcome.verification.title}**${where ? `, at ${where}` : ""}${synced ? ` (Woven record last synced ${synced})` : ""}.${outcome.note ? `\n\n${outcome.note}` : ""}`,
          );
        } else if (asksTitle) {
          direct.push(outcome.note ?? `I couldn't verify a job title for **${displayName(employee)}**.`);
        }
      }

      if (confirm.length > 0 && matched.size === 0) {
        const unique = [...new Set(confirm)];
        employees.push(
          `Employee: the question may mean ${unique.map((name) => `${name}`).join(" or ")} (close spelling) — ask "did you mean …?" before stating anything about them.`,
        );
        candidatesAsked = true;
        if (asksTitle) {
          direct.push(`Did you mean ${unique.map((name) => `**${name}**`).join(" or ")}? I want to be sure before I look up a job title.`);
        }
      }
      if (matched.size === 0 && confirm.length === 0 && asksTitle && typedNames.length > 0) {
        const out = unverifiedWithoutRecord("not_found", typedNames[0]!);
        employees.push(`Employee: ${out.note?.replace(/\*\*/g, "")}`);
        direct.push(out.note!);
      }
    } else if (pronounAsk && loaded.status === "ok") {
      // Nobody in the asker's scope has been established, so nobody can be named.
      employees.push(
        "Employee: the question refers to someone by a pronoun and the conversation does not clearly establish who. Ask who they mean; do not state a title, store or status for anyone.",
      );
      candidatesAsked = true;
      if (asksTitle) direct.push("Who do you mean? I can look up a job title once I know which employee — tell me their full name.");
    } else if (asksTitle && (typedNames.length > 0 || capitalisedPair || pronounAsk)) {
      const unavailable = loaded.status === "unavailable";
      const out = unverifiedWithoutRecord(
        loaded.status === "ok" ? "not_found" : unavailable ? "unavailable" : "not_checked",
        typedNames[0] ?? "that employee",
      );
      // Preview mode has no Woven scope to speak of; say nothing there.
      if (!(loaded.status === "not_checked" && loaded.reason === "no_scope")) {
        employees.push(`Employee: ${out.note?.replace(/\*\*/g, "")}`);
        direct.push(out.note!);
      }
    }
  }

  lines.push(...employees);
  if (lines.length === 0) return NONE;

  /* --------------------------------------------------- an outright answer */
  const words = question.trim().split(/\s+/).length;
  const onlyAskingTitle = asksTitle && LOOKUP_VERB.test(question) && words <= MAX_LOOKUP_WORDS;
  if (onlyAskingTitle && direct.length > 0 && (singleLookup || candidatesAsked || employees.length > 0)) {
    return { block: null, direct: { content: direct.join("\n\n"), citations: [], coverage: "not_applicable" } };
  }

  const onlyAskingStore =
    employees.length === 0 &&
    STORE_ASK.test(question) &&
    // "What is store 236?", "Which store is Dawley Farms?" — and not "What is the opening checklist at Store 102?".
    /^(?:what|which|where)(?:['’]s|\s+is|\s+are)?\s+(?:the\s+)?(?:store|location)\b/i.test(question.trim()) &&
    words <= 12 &&
    (named.length > 0 || (soft.length === 0 && reading.unmatched.length > 0));
  if (onlyAskingStore && named.length === 0) {
    return {
      block: null,
      direct: {
        content: `I couldn't find a registered store matching **${reading.unmatched[0]}**, so I won't guess. Tell me the store's name or number as Buff City Soap prints it.`,
        citations: [],
        coverage: "not_applicable",
      },
    };
  }
  if (onlyAskingStore) {
    const content =
      named.length === 1
        ? `That's **${storeLabel(named[0]!)}**.`
        : `That could be ${named.map((id) => `**${storeLabel(id)}**`).join(" or ")} — which do you mean?`;
    return { block: null, direct: { content, citations: [], coverage: "not_applicable" } };
  }

  const block = [
    "VERIFIED RECORDS (registered store list and Woven employee records, read-only)",
    "",
    ...lines,
  ].join("\n");
  return { block, direct: null };
}
