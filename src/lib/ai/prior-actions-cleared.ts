import { extractEmployeeNames } from "@/lib/forms/proposal";

/**
 * ============================================================================
 * PRIOR_ACTIONS_RETAINED_ENABLED — "NO PRIOR COACHING" CLEARS A LISTED PRIOR
 * ============================================================================
 *
 * Ported from the sibling app (same flag name). On the full remap a prior the
 * manager stated stays on the card through every later turn, which is right
 * for "no payroll deduct" and wrong for "no prior coaching" or "remove the
 * prior": the prior-actions line is read again from every turn of the form,
 * and a blank read keeps the saved one, so a removal never took.
 *
 * On, the manager's turns of this form are read for a removal:
 *   - "no prior coaching", "no priors", "remove the prior", "she has never had
 *     a prior …" clear every prior stated before it; one that names a kind
 *     ("no prior written") clears only that kind;
 *   - a removal asked as a question ("never had a prior?") is not one;
 *   - a removal about somebody else ("no prior coaching for <another name>")
 *     does not clear this employee's card;
 *   - "add the prior back" undoes the latest removal.
 * The priors are then read, by the remap's own reader, from what was said
 * after the last removal. With no removal this returns null and the card is
 * read as before. Off, it is never called.
 */

export type PriorKind = "verbal" | "written" | "final";

export interface PriorRemoval {
  /** What was said after the last removal that clears every prior: the priors are read from this. */
  readonly after: string;
  /** Removals of one kind after that, each with what was said before it. */
  readonly kinds: readonly { readonly kind: PriorKind; readonly before: string; readonly after: string }[];
}

const REMOVES_PRIOR =
  /\b(?:(?:no|not\s+any|without|remove|delete|drop|clear|erase|scratch|strike|forget|ignore|take\s+(?:off|out|away))\s+(?:the\s+|any\s+|all\s+|her\s+|his\s+|their\s+|that\s+|those\s+)?|(?:never|not|n['’]t)\s+(?:had|have|has|got|gotten|received|been\s+given)\s+(?:a\s+|any\s+)?)(?:prior|previous|past|earlier)s?\b(?:\s+(verbal|written|final))?/gi;

const RESTORES_PRIOR =
  /\b(?:(?:add|put|bring)\s+(?:the\s+|that\s+|those\s+|her\s+|his\s+)?(?:priors?|previous(?:\s+\w+)?)\s+back|undo\s+(?:that|the\s+removal))\b/gi;

interface Event {
  readonly turn: number;
  readonly at: number;
  readonly end: number;
  readonly kind: PriorKind | "all" | "restore";
}

export function priorRemoval(turns: readonly string[], employeeName: string | null): PriorRemoval | null {
  const events: Event[] = [];
  turns.forEach((text, turn) => {
    for (const match of text.matchAll(REMOVES_PRIOR)) {
      if (asked(text, match.index) || aboutSomebodyElse(text, match.index, employeeName)) continue;
      const kind = (match[1]?.toLowerCase() as PriorKind | undefined) ?? "all";
      events.push({ turn, at: match.index, end: match.index + match[0].length, kind });
    }
    for (const match of text.matchAll(RESTORES_PRIOR)) {
      events.push({ turn, at: match.index, end: match.index + match[0].length, kind: "restore" });
    }
  });
  if (events.length === 0) return null;
  events.sort((a, b) => a.turn - b.turn || a.at - b.at);

  const standing: Event[] = [];
  for (const event of events) {
    if (event.kind === "restore") standing.pop();
    else standing.push(event);
  }
  if (standing.length === 0) return null;

  const allAt = standing.map((event) => event.kind).lastIndexOf("all");
  const from = allAt >= 0 ? standing[allAt]! : null;
  const slice = (start: Event | null, stop: Event | null, use: "end" | "at") => {
    const parts: string[] = [];
    turns.forEach((text, turn) => {
      const begin = start && turn === start.turn ? start.end : 0;
      const finish = stop && turn === stop.turn ? stop[use] : text.length;
      if (start && turn < start.turn) return;
      if (stop && turn > stop.turn) return;
      parts.push(text.slice(begin, finish));
    });
    return parts.join("\n");
  };
  const kinds = standing.slice(allAt + 1).map((event) => ({
    kind: event.kind as PriorKind,
    before: slice(from, event, "at"),
    after: slice(event, null, "end"),
  }));
  return { after: slice(from, null, "end"), kinds };
}

/** Drops each prior of a cleared kind that was stated before its removal and not again after it. */
export function withoutClearedKinds(
  lines: string | null,
  removal: PriorRemoval,
  read: (text: string) => string | null,
): string | null {
  if (!lines) return lines;
  let kept = lines.split("\n");
  for (const cleared of removal.kinds) {
    const before = new Set((read(cleared.before) ?? "").split("\n").filter(Boolean));
    const after = new Set((read(cleared.after) ?? "").split("\n").filter(Boolean));
    kept = kept.filter((line) => !(before.has(line) && !after.has(line) && new RegExp(`\\b${cleared.kind}`, "i").test(line)));
  }
  return kept.length > 0 ? kept.join("\n") : null;
}

/** "never had a prior?": a question, not a removal. */
function asked(text: string, at: number): boolean {
  const rest = text.slice(at);
  const end = /[.!?\n]/.exec(rest);
  return end?.[0] === "?";
}

/** "no prior coaching for <another name>": about somebody else, not this card. */
function aboutSomebodyElse(text: string, at: number, employeeName: string | null): boolean {
  if (!employeeName) return false;
  const start = Math.max(0, ...[...text.slice(0, at).matchAll(/[.!?;\n]/g)].map((match) => match.index + 1));
  const rest = text.slice(at);
  const clause = text.slice(start, at + (/[.!?;\n]/.exec(rest)?.index ?? rest.length));
  const names = extractEmployeeNames(clause);
  if (names.length === 0) return false;
  const card = employeeName.toLowerCase().split(/\s+/);
  return !names.some((name) => {
    const words = name.toLowerCase().split(/\s+/);
    return words.join(" ") === card.join(" ") || words[0] === card[0];
  });
}
