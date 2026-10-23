/**
 * Redact a rating into a replay case.
 *
 * Emails, phone numbers, and uuids go. A store name is whatever list the
 * caller passes (this app's locations), never a list kept here. Two or
 * three capitalized words are treated as a person's name. A single
 * capitalized word is left, so a policy heading stays.
 */

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const NAME_SPAN = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g;

export function redactReplayText(text, places) {
  let out = String(text ?? "");
  out = out.replace(EMAIL, "[redacted]");
  out = out.replace(PHONE, "[redacted]");
  out = out.replace(UUID, "[redacted]");
  const names = [...(places ?? [])].filter((place) => typeof place === "string" && place.trim() !== "");
  names.sort((left, right) => right.length - left.length);
  for (const place of names) {
    const escaped = place.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "gi"), "the store");
  }
  out = out.replace(NAME_SPAN, "the employee");
  return out.replace(/[ \t]+/g, " ").replace(/ +\n/g, "\n").trim();
}

export function replayCasesFromFeedback(rows, places) {
  const cases = [];
  for (const row of rows ?? []) {
    const rating = Number(row?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 4) continue;
    const question = typeof row.question === "string" && row.question.trim() ? redactReplayText(row.question, places) : null;
    const comment = typeof row.comment === "string" && row.comment.trim() ? redactReplayText(row.comment, places) : null;
    cases.push({ rating, question, comment });
  }
  return cases;
}
