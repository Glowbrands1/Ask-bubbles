/**
 * The incident a draft belongs to.
 *
 * A resend of the same incident reopens that draft. A different date, or a
 * different account of what happened, does not. The card-id match is a
 * separate guard and is not replaced by this.
 */

const TOKEN = /[a-z0-9]{5,}/g;

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function tokensOf(text: string, employee: string): string[] {
  const blocked = new Set(employee.split(/\s+/).filter((word) => word.length >= 5));
  const found = new Set<string>();
  for (const match of text.toLowerCase().matchAll(TOKEN)) {
    const token = match[0]!;
    if (!blocked.has(token)) found.add(token);
  }
  return [...found].sort();
}

export function incidentFingerprint(input: {
  readonly employeeName: string;
  readonly formDate: string | null;
  readonly text: string;
}): string {
  const employee = normalizeName(input.employeeName);
  const date = input.formDate && /^\d{4}-\d{2}-\d{2}$/.test(input.formDate) ? input.formDate : "undated";
  return `${employee}|${date}|${tokensOf(input.text, employee).join(",")}`;
}

function parts(key: string): { employee: string; date: string; tokens: Set<string> } {
  const [employee = "", date = "undated", raw = ""] = key.split("|");
  return { employee, date, tokens: new Set(raw.split(",").filter(Boolean)) };
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/**
 * Same person and the same incident.
 *
 * Different calendar days never match. Undated text matches a dated draft
 * only when the words overlap strongly, so a bare "create it" does not pull
 * back an older incident. Two dated drafts on the same day still have to
 * describe the same event.
 */
export function sameIncident(left: string, right: string): boolean {
  const a = parts(left);
  const b = parts(right);
  if (!a.employee || a.employee !== b.employee) return false;
  if (a.date !== "undated" && b.date !== "undated" && a.date !== b.date) return false;
  const overlap = jaccard(a.tokens, b.tokens);
  if (a.tokens.size === 0 && b.tokens.size === 0) return a.date !== "undated" && a.date === b.date;
  return overlap >= 0.45;
}
