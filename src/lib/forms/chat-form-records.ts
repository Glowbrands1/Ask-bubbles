import "server-only";

import { promptLabel } from "@/lib/ai/prompts";
import { ACTIVE_BRAND } from "@/lib/brand";
import { businessToday } from "@/lib/business-date";
import { priorRecordFinalOnlyEnabled } from "@/lib/config/chat-quality-flags";
import { locationById } from "@/lib/locations";
import { DEFAULT_PERMISSION_MATRIX, hasPermission } from "@/lib/permissions";
import type { AccessScope, Role } from "@/types";

import type { FormsActor } from "./access";
import { FOLLOW_UP_LABEL, followUpState } from "./follow-up";
import { resolveFormsVisibility } from "./forms-visibility";
import { instanceListFilterFor, visibleInstances } from "./instance-scope";
import { listInstances, type InstanceRow } from "./instances";
import { authorizedLocationIds } from "./location-scope";
import { privateAwareLimit } from "./private-creators";

/**
 * ============================================================================
 * "DOES WREN HAVE PREVIOUS COACHINGS?" — ANSWERED FROM THE FORMS REGISTER
 * ============================================================================
 *
 * Asked whether an employee had prior coaching, the assistant said it could not
 * look that up and sent the manager to Forms → Forms Register — the screen
 * holding exactly the answer, read from the same table this app writes. So a
 * question about forms ALREADY ON FILE reads that record and hands the model a
 * FORMS ON FILE block. Ported from the reference platform.
 *
 * THE SAME VISIBILITY AS THE SCREEN, AND NOTHING WIDER. The read goes through
 * `resolveFormsVisibility`, `instanceListFilterFor` and `visibleInstances` —
 * the one rule the Forms Register, its API, the Overview queue and the badge
 * all apply: every store Woven assigns the person (plus a `location` scope's
 * stores), every store for administrators and designated accounts, their own
 * forms elsewhere while their stored scope still covers that store, and exit
 * forms only for roles that may create them. Chat's report scope
 * (`resolveScopeFor`) is deliberately NOT used: it is a different rule.
 *
 * METADATA ONLY. Which form, about whom, at which store, when, and where it
 * stands. Never a field's contents: what a coaching record says belongs in the
 * record, opened by a person, not paraphrased into a chat answer.
 *
 * NAMES ARE MATCHED, NEVER GUESSED. The question's words narrow the query
 * (`employeeNameWords`), and a row counts as NAMED only when every word of its
 * employee name appears in the question. A row matching on a first name alone
 * is listed as a POSSIBLE match, so "is Wren Halvorsen the one you mean?" is
 * the model's to ask rather than this file's to decide.
 */

const NOUN = ACTIVE_BRAND.vocabulary.locationNoun;
const NOUNS = ACTIVE_BRAND.vocabulary.locationNounPlural;

/** What the nav calls the screen these records are read from. */
export const REGISTER_PATH = "Forms → Forms Register";

/* ------------------------------------------------------------------ gate --- */

const FORM_NOUN =
  "(?:coachings?|coaching (?:forms?|records?|notes?|sessions?|files?)|forms?|files?|write[- ]?ups?|corrective(?: actions?)?(?: forms?)?|ca|cas|cafs?|ca forms?|warnings?|documentation|records?|epps?|follow[- ]?ups?|disciplinary|discipline|exit (?:forms?|interviews?))";

/*
 * THE FORM IS ONE THAT ALREADY EXISTS, said in so many words: "previous",
 * "past", "on file", "history", "been written up". These alone may take a turn
 * away from the form-request path — see `asksOnlyAboutFormsOnFile`.
 */
const ON_FILE_PATTERNS: readonly RegExp[] = [
  // "previous coachings", "past CA", "prior write-ups"
  new RegExp(`\\b(?:previous|prior|past|earlier|older|existing|filed|finalized)\\s+${FORM_NOUN}\\b`),
  // "has she been coached", "was he ever written up"
  /\b(?:been|ever|already|previously|before)\s+(?:been\s+)?(?:coached|written up|wrote up|documented|disciplined|warned)\b/,
  /\b(?:coached|written up|documented|disciplined|warned)\s+(?:before|previously|already)\b/,
  // "coaching history", "form history", "disciplinary record"
  /\b(?:coaching|form|forms|write[- ]?up|disciplinary|corrective(?: action)?|performance)\s+(?:history|records?)\b/,
  /\bon file\b/,
  // The screen by either name it carries: the nav's and the page title's.
  /\bforms? register\b/,
  /\bform monitoring\b/,
  new RegExp(`\\bhow many\\s+${FORM_NOUN}\\b`),
];

/*
 * THE WIDER GATE for reading the register: the cues above, plus wording that
 * is about existing forms more often than not — "any open follow-ups", "forms
 * I created", "write-ups for Jordan". "Coaching forms for Avery and Jordan"
 * passes it too, which is why it never decides between a proposal and an
 * answer; it only decides whether an answer gets the register.
 */
const FORM_RECORDS_PATTERNS: readonly RegExp[] = [
  ...ON_FILE_PATTERNS,
  // "any write-ups", "open follow-ups", "recent forms"
  new RegExp(
    `\\b(?:recent|last|any|outstanding|open|pending|draft|drafted|unfinished|overdue)\\s+${FORM_NOUN}\\b`,
  ),
  // "forms I created", "coachings we have done", "forms filed"
  new RegExp(
    `\\b${FORM_NOUN}\\s+(?:(?:i|we|you|they|she|he)\\s+)?(?:have\\s+|has\\s+|had\\s+)?(?:been\\s+)?(?:filed|created|done|completed|submitted|finalized|started|written)\\b`,
  ),
  // "coachings for wren", "write-ups on dana"
  /\b(?:coachings|write[- ]?ups|forms|corrective actions|cas|warnings)\s+(?:for|on|about)\s+\w/,
];

/**
 * Whether this question asks about forms that ALREADY EXIST — as opposed to the
 * templates (the inventory gate) or a new one (the proposal gate). Pure and
 * cheap.
 */
export function isFormRecordsQuestion(question: string): boolean {
  const text = question.toLowerCase().replace(/\s+/g, " ");
  return FORM_RECORDS_PATTERNS.some((pattern) => pattern.test(text));
}

/*
 * MAKING ONE, said in so many words. "Create a CA for Dana, she's been coached
 * before" mentions the history and asks for a form; the form wins. Only
 * explicit making counts — "for Dana" alone does not, because "past CA for
 * Dana" is the very question this file answers, and "draft" only as a verb,
 * because "any draft coachings?" asks about drafts on file.
 */
const ASKS_FOR_A_NEW_FORM =
  /\b(?:create|start|make|generate|prepare|issue|begin|fill (?:out|in)|set up|put together)\b|\bdraft (?:a|an|me|one)\b|\b(?:need|want)\s+(?:a|an|to (?:do|create|start|write|make))\b|\bwrite (?:a|an|her up|him up|them up)\b|\bgive (?:her|him|them) a\b|\bdo a\b/;

/**
 * A question about forms ALREADY on file that does not also ask for a new one.
 *
 * The form-request gate reads "does Dana have a previous CA form?" as naming
 * the Corrective Action Form, and "past corrective action form for Marcus" as
 * asking for one for Marcus — and would answer either with a proposal card for
 * a form nobody asked to create. A question like that is answered from the
 * register instead. A sentence that ALSO says "create" or "write a" keeps the
 * proposal.
 */
const PREVIOUS_RECORD = /\b(?:previous|prior|past)\b/i;
const ASKS_FOR_DRAFTS = /\b(?:draft|drafted)\b/i;

/**
 * A previous, prior, or past coaching question, or a question that asks
 * about drafts, lists drafts apart from the record when the flag is on.
 * The flag off returns false and the labelled list is unchanged.
 */
export function separateDraftsAsNotOnFile(question: string): boolean {
  if (!priorRecordFinalOnlyEnabled()) return false;
  return PREVIOUS_RECORD.test(question) || ASKS_FOR_DRAFTS.test(question);
}

export function splitRecordDrafts<T extends { status: string }>(
  question: string,
  rows: readonly T[],
): { onFile: T[]; notOnFile: T[] } {
  if (!separateDraftsAsNotOnFile(question)) return { onFile: [...rows], notOnFile: [] };
  return {
    onFile: rows.filter((row) => row.status !== "draft"),
    notOnFile: rows.filter((row) => row.status === "draft"),
  };
}

export function asksOnlyAboutFormsOnFile(question: string): boolean {
  const text = question.toLowerCase().replace(/\s+/g, " ");
  if (!ON_FILE_PATTERNS.some((pattern) => pattern.test(text))) return false;
  return !ASKS_FOR_A_NEW_FORM.test(text);
}

/* ----------------------------------------------------------------- names --- */

/*
 * Words that are never part of a person's name in these questions. Kept broad
 * on purpose: a missed stop word costs a wider query that the scoring below
 * then discards, while a person's name in this list could never be matched.
 */
const STOP_WORDS = new Set(
  (
    "a about after again all also am an and any anyone anything are as at be been before being " +
    "both but by can check could did do does doing done during each employee employees ever for " +
    "from had has have having he her here hers him his how i if in into is it its just last let " +
    "like look me mine more most my need no not now of on once only or other our out over own " +
    "please previous previously prior past earlier older existing recent recently same see she " +
    "should show so some still such tell than that the their them then there these they this " +
    "those through to too under until up very was we were what when where which while who whom " +
    "why will with would you your yours already currently today yesterday week weeks month " +
    "months year years ago time times new open opened pending draft drafted unfinished overdue " +
    "finalized filed outstanding coach coached coaching coachings form forms record records " +
    "note notes session sessions write writeup writeups written wrote documentation documented " +
    "corrective action actions warning warnings disciplinary discipline disciplined epp epps " +
    "exit interview interviews follow followup followups history file monitoring many much " +
    "created create completed submitted started team member members staff store stores location " +
    "locations manager managers director assistant associate associates supervisor register " +
    "bubbles ask know find list give get got people person performance plan plans has hasnt " +
    "havent doesnt didnt isnt wasnt dont ca cas caf cafs files ups"
  ).split(" "),
);

/** The words of a question that could be part of somebody's name. */
export function candidateNameWords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
  return [...new Set(words)].slice(0, 8);
}

function nameWords(name: string): string[] {
  return name.toLowerCase().split(/[^a-z]+/).filter((word) => word.length >= 2);
}

export interface NameMatches {
  /** Every word of the employee's name appears in the question. */
  named: InstanceRow[];
  /** Part of the name appears — a first name alone, usually. */
  possible: InstanceRow[];
}

/** Splits rows by how fully the question names their employee. Pure. */
export function matchRowsToQuestion(
  rows: readonly InstanceRow[],
  words: readonly string[],
): NameMatches {
  const asked = new Set(words);
  const named: InstanceRow[] = [];
  const possible: InstanceRow[] = [];
  for (const row of rows) {
    const parts = nameWords(row.employeeName);
    if (parts.length === 0) continue;
    const hits = parts.filter((part) => asked.has(part)).length;
    if (hits === parts.length) named.push(row);
    else if (hits > 0) possible.push(row);
  }
  return { named, possible };
}

/* ---------------------------------------------------------------- render --- */

export const FORM_RECORDS_HEADING = "FORMS ON FILE (FORMS REGISTER)";

const STATUS_LABEL: Record<InstanceRow["status"], string> = {
  draft: "draft — not finalized",
  finalized: "finalized",
  revised: "revised — replaced by a newer version",
};

/*
 * EVERY LABEL IS SOMETHING A PERSON TYPED — an employee name on a form, a
 * title — so it is reduced to a plain label before it enters the prompt, the
 * same as the user and store names the system prompt carries.
 */
/*
 * CROSS_CHAT_REPLY_GUARD_ENABLED: each row says whether the person asking
 * created it. The register lists every form this user may SEE, and a reply
 * called another manager's draft "the written one you created today"
 * (conv_mvmznap42vcw0dl). Without a viewer the line is unchanged.
 */
const CREATED_BY_RULE =
  'Each row says who created it. Say the manager created a form only when its row says "created by: this user"; a form created by another user was not created by them.';

function createdByPart(row: InstanceRow, viewerId: string | null | undefined): string[] {
  if (!viewerId) return [];
  return [row.createdBy === viewerId ? "created by: this user" : "created by: another user"];
}

function describeRow(row: InstanceRow, today: string, viewerId?: string | null): string {
  const state = followUpState(row, today);
  const role = promptLabel(row.employeeRole);
  const parts = [
    `${row.formDate} — ${promptLabel(row.templateName)}`,
    `employee: ${promptLabel(row.employeeName)}${role ? ` (${role})` : ""}`,
    `${NOUN}: ${promptLabel(row.locationName) || "none recorded"}`,
    `status: ${STATUS_LABEL[row.status]}`,
  ];
  if (row.followUpDate) parts.push(`follow-up date: ${row.followUpDate}`);
  if (state === "open" || state === "overdue" || state === "followed_up") {
    parts.push(`follow-up: ${FOLLOW_UP_LABEL[state]}`);
  }
  if (row.archivedAt) parts.push("archived");
  parts.push(...createdByPart(row, viewerId));
  return `- ${parts.join("; ")}`;
}

/** Which stores the list covers, by the roster's names — never an id. */
function scopeSentence(visibility: AccessScope): string {
  if (visibility.level === "global") {
    return `This list covers every ${NOUN}: this user may see all ${NOUNS}' forms.`;
  }
  const names = authorizedLocationIds(visibility)
    .map((id) => locationById(id)?.name)
    .filter((name): name is string => Boolean(name));
  const covered =
    names.length > 0
      ? `the ${NOUNS} whose forms this user may see in the Forms Register (${names.join(", ")}), and forms they created themselves at a ${NOUN} their assignment still covers`
      : `only forms this user created themselves: no ${NOUN} is assigned to them for the Forms Register`;
  return `This list covers ${covered}. A form filed anywhere else is not visible to them and is not listed — so no match here means none on file that they can see, not none anywhere.`;
}

const RECORDS_RULES = `These are records of forms that exist, read from the Forms Register for this user. Never mark them with a source marker. Only the form name, employee, ${NOUN}, dates and status are shown — you have NOT seen what any form says, so never describe or guess its contents, reasons or wording. A draft is not a completed coaching. Tell the manager they can open any of these in ${REGISTER_PATH}.`;

export function renderFormRecordsBlock(input: {
  visibility: AccessScope;
  /** The name words searched for, or empty when the question named nobody. */
  words: readonly string[];
  matches: NameMatches | null;
  recent: readonly InstanceRow[];
  /** Drafts kept out of the previous-coaching list. Empty when the flag is off. */
  notOnFile?: readonly InstanceRow[];
  today: string;
  /** CROSS_CHAT_REPLY_GUARD_ENABLED: the asking user's id, to mark who created each row. */
  viewerId?: string | null;
}): string {
  const viewerId = input.viewerId ?? null;
  const { words, matches, recent, today } = input;
  const sections: string[] = [FORM_RECORDS_HEADING, `${RECORDS_RULES} ${scopeSentence(input.visibility)}${viewerId ? ` ${CREATED_BY_RULE}` : ""}`];

  if (matches) {
    if (matches.named.length > 0) {
      sections.push(
        `Forms naming the person in the question (${matches.named.length}), newest first:\n${matches.named.map((row) => describeRow(row, today, viewerId)).join("\n")}`,
      );
    } else {
      sections.push(
        `No form on file names the person in the question (searched for: ${words.join(", ")}). Say so plainly — there is no coaching or other form on file for them at the ${NOUNS} this user can see.`,
      );
    }
    if (matches.possible.length > 0) {
      sections.push(
        `Possible matches — part of the name matches, so they may be somebody else. Ask before treating them as the same person:\n${matches.possible.map((row) => describeRow(row, today, viewerId)).join("\n")}`,
      );
    }
  } else if (recent.length > 0) {
    sections.push(
      `The question names nobody. The ${recent.length} most recent forms this user can see, newest first:\n${recent.map((row) => describeRow(row, today, viewerId)).join("\n")}`,
    );
  } else {
    sections.push(`No forms are on file at the ${NOUNS} this user can see.`);
  }

  if (input.notOnFile && input.notOnFile.length > 0) {
    sections.push(
      `Not on file. These drafts are not previous coaching:\n${input.notOnFile.map((row) => describeRow(row, today, viewerId)).join("\n")}`,
    );
  }

  return sections.join("\n\n");
}

export const FORM_RECORDS_UNAVAILABLE_BLOCK = `${FORM_RECORDS_HEADING}

The Forms Register could not be read for this question. Say you could not check the Forms Register just now and that the manager can look in ${REGISTER_PATH} directly. Never guess whether any form exists.`;

/* ---------------------------------------------------------------- loader --- */

/** The authenticated caller, as this lookup needs it. */
export interface FormRecordsActor {
  subject?: string;
  verified?: boolean;
  role: Role | null;
  scope: AccessScope | null;
}

/**
 * The chat caller as the Forms Register reads under them, or null when they
 * may not read it at all. Fails closed: no verified identity, no read. Throws
 * only when the visibility itself cannot be resolved.
 */
export async function chatFormsActor(actor: FormRecordsActor): Promise<FormsActor | null> {
  if (!actor.verified || !actor.subject || !actor.role || !actor.scope) return null;
  if (!hasPermission(DEFAULT_PERMISSION_MATRIX, actor.role, "view_form_monitoring")) return null;
  const visibility = await resolveFormsVisibility({
    subject: actor.subject,
    role: actor.role,
    scope: actor.scope,
  });
  /*
   * THE STORED SCOPE TRAVELS WITH THE VISIBILITY, as it does for every forms
   * route: `visibleInstances` needs it to keep the reader's own forms at a
   * store their assignment still covers (`ownFormStillInScope`).
   */
  return { id: actor.subject, role: actor.role, verified: true, scope: actor.scope, visibility };
}

const MATCH_LIMIT = 50;
const RECENT_LIMIT = 20;

/**
 * The FORMS ON FILE block for this turn, or null when this caller may not read
 * the Forms Register at all. Never throws: a failed read becomes a block telling
 * the model to say it could not check, rather than an answer that silently
 * implies nothing is on file.
 *
 * @param previousQuestion The manager's turn before this one, searched for a
 *   name when the question names nobody ("does she have any write-ups?").
 */
export async function loadFormRecords(input: {
  actor: FormRecordsActor;
  question: string;
  previousQuestion?: string | null;
  today?: string;
  /** CROSS_CHAT_REPLY_GUARD_ENABLED: mark which rows the asking user created. */
  markCreator?: boolean;
}): Promise<{ block: string } | null> {
  const { actor } = input;
  // Fails closed: no verified identity, no read. Chat is live-only, so this is
  // the ordinary state of a signed-in manager.
  if (!actor.verified || !actor.subject || !actor.role || !actor.scope) return null;
  if (!hasPermission(DEFAULT_PERMISSION_MATRIX, actor.role, "view_form_monitoring")) return null;

  const today = input.today ?? businessToday();
  const viewerId = input.markCreator ? actor.subject : null;
  try {
    const formsActor = (await chatFormsActor(actor))!;
    const visibility = formsActor.visibility!;
    const filter = instanceListFilterFor(formsActor);

    let nameSource = input.question;
    let words = candidateNameWords(nameSource);
    if (words.length === 0 && input.previousQuestion) {
      nameSource = input.previousQuestion;
      words = candidateNameWords(nameSource);
    }

    if (words.length > 0) {
      const split = splitRecordDrafts(
        input.question,
        visibleInstances(
          formsActor,
          // PRIVATE_CREATOR_FORMS: over-read, then trim to the page; off, the page itself.
          await listInstances("all", privateAwareLimit(MATCH_LIMIT), { ...filter, employeeNameWords: words }),
        ).slice(0, MATCH_LIMIT),
      );
      const matches = matchRowsToQuestion(split.onFile, words);
      const drafts = matchRowsToQuestion(split.notOnFile, words);
      const notOnFile = [...drafts.named, ...drafts.possible];
      if (matches.named.length > 0 || matches.possible.length > 0 || notOnFile.length > 0) {
        return { block: renderFormRecordsBlock({ visibility, words, matches, recent: [], notOnFile, today, viewerId }) };
      }
    }

    const recentSplit = splitRecordDrafts(
      input.question,
      visibleInstances(formsActor, await listInstances("active", privateAwareLimit(RECENT_LIMIT), filter)).slice(0, RECENT_LIMIT),
    );
    const recent = recentSplit.onFile;
    /*
     * A question that names somebody nobody on file matches is reported as
     * "no form names them" — with the recent list left out, so the model
     * cannot mistake somebody else's coaching for theirs.
     */
    const named = words.length > 0 && looksLikeItNamesSomebody(nameSource);
    return {
      block: renderFormRecordsBlock({
        viewerId,
        visibility,
        words,
        matches: named ? { named: [], possible: [] } : null,
        recent,
        // A named miss already returned that person's drafts above. The recent
        // list's drafts belong here only when the question named nobody.
        notOnFile: named ? undefined : recentSplit.notOnFile,
        today,
      }),
    };
  } catch {
    return { block: FORM_RECORDS_UNAVAILABLE_BLOCK };
  }
}

/**
 * Whether the text itself carries a name-like phrase: two adjacent candidate
 * words ("wren halvorsen"), or a candidate word after "for", "on", "about",
 * "does" or "has". Conservative — when unsure it says no, and the model gets
 * the recent list instead of a false "nothing on file".
 */
function looksLikeItNamesSomebody(text: string): boolean {
  const tokens = text.toLowerCase().replace(/['’]s\b/g, "").split(/[^a-z]+/).filter(Boolean);
  const candidate = (word: string | undefined) =>
    word !== undefined && word.length >= 2 && !STOP_WORDS.has(word);
  for (let i = 0; i < tokens.length; i += 1) {
    if (candidate(tokens[i]) && candidate(tokens[i + 1])) return true;
    if (["for", "on", "about", "does", "has", "did", "was", "is"].includes(tokens[i]!) && candidate(tokens[i + 1])) {
      return true;
    }
  }
  return false;
}
