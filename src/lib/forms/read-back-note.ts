/**
 * ============================================================================
 * A READ-BACK NOTE IS NEVER A FIELD'S VALUE (QA's live re-test B8, 21 Nov 2026)
 * ============================================================================
 *
 * "The job title typed \"assistant store manager\" was saved as \"Assistant General Manager (from your words)\"": the
 * mapping is right, but the chat's note saying where the value came from reached the saved field. The chat may keep such
 * a note; the form never does. A note is the trailing parenthetical that says where a value came from, by its shape:
 * "(from …)", "(as you said / typed it)", "(per …)", "(… in Woven)", "(… on the staff list)". Anything else stays.
 */
const NOTE = /\s*\((?:from\s|as\s+you\s|per\s|according to\s)[^()]{1,60}\)\s*$|\s*\([^()]{1,60}\s(?:in|on)\s+(?:the\s+)?(?:woven|staff list|your staff list)\)\s*$/i;

export function withoutReadBackNote(value: string): string {
  let text = value;
  for (let guard = 0; guard < 3 && NOTE.test(text); guard += 1) text = text.replace(NOTE, "");
  return text.trim();
}
