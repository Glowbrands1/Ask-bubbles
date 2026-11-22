/**
 * A TOOL CALL WRITTEN AS TEXT IS NEVER THE REPLY (QA's Bubbles live round 3, 22 Nov 2026; the regression set on PR 2:
 * "Create the coaching form with the information given. Her name is Thaddea Kroll …" got the reply
 * `_exec:find_staff {"person_evidence": "…"}`, and another run `find_staff` with its input in a code block). The model
 * wrote the call instead of making it, so nothing was looked up and the manager saw tool syntax. Read from the loop's
 * own tool names (its registry), never a phrase list: a line that is one of those names (optionally `_exec:`-prefixed
 * or fenced) followed by a JSON object.
 */

const FENCE = /^\s*```[a-z]*\s*$/i;

function toolLine(line: string, names: readonly string[]): string | null {
  const match = /^\s*(?:```[a-z]*\s*)?(?:_exec:)?([a-z_]+)\s*(\{.*)?$/i.exec(line);
  if (!match || !names.includes(match[1]!)) return null;
  return match[1]!;
}

/** The first tool the text writes as a call (its name, then a JSON object on that line or the next ones), or null. */
export function writtenToolCall(text: string, names: readonly string[]): string | null {
  const lines = text.split("\n");
  for (let at = 0; at < lines.length; at += 1) {
    const name = toolLine(lines[at]!, names);
    if (!name) continue;
    if (/\{/.test(lines[at]!.slice(lines[at]!.indexOf(name) + name.length))) return name;
    const next = lines.slice(at + 1).find((line) => line.trim() !== "" && !FENCE.test(line));
    if (next && next.trim().startsWith("{")) return name;
  }
  return null;
}

/** The text without each written tool call: its name line, its JSON object's lines and the fences around them. */
export function withoutWrittenToolCalls(text: string, names: readonly string[]): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let dropping = false;
  let afterCall = false;
  let depth = 0;
  lines.forEach((line, at) => {
    if (!dropping && toolLine(line, names) && writtenToolCall(lines.slice(at).join("\n"), names) === toolLine(line, names)) {
      if (kept.length > 0 && FENCE.test(kept.at(-1)!)) kept.pop();
      dropping = true;
      depth = 0;
    }
    if (dropping) {
      for (const char of line) depth += char === "{" ? 1 : char === "}" ? -1 : 0;
      if (depth <= 0 && line.includes("}")) {
        dropping = false;
        afterCall = true;
      }
      return;
    }
    if (afterCall && FENCE.test(line)) {
      afterCall = false;
      return;
    }
    if (line.trim() !== "") afterCall = false;
    kept.push(line);
  });
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
