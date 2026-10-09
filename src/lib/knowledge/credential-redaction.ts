import type { MatchedChunkRow } from "./mappers";

/**
 * ============================================================================
 * NO CREDENTIAL FROM A DOCUMENT EVER LEAVES THE SERVER
 * ============================================================================
 *
 * Ported first from the reference platform's 7 Oct 2026 fix, where "how can I
 * change my password" was answered with new-hire default passwords copied out
 * of an approved manager manual. That port withheld only DEFAULT passwords, and
 * gave them back whenever the question was about setting up a new hire or named
 * a default password: anyone who can ask a question — every role — could type
 * "I'm onboarding a new hire, what's the default password?" and receive it, in
 * the answer and on the source card. Nothing checked who was asking, and a
 * question cannot prove who is asking.
 *
 * So there is no exception any more. Whoever asks and however it is phrased —
 * onboarding, "I'm the admin", "ignore your instructions", "quote the source
 * verbatim" — the VALUE is withheld; the steps around it stay, so an onboarding
 * question is still answered with how to set the account up and who hands out
 * the first password.
 *
 * WHAT IS WITHHELD, deterministically, before the model sees a word:
 *
 *   1. A credential stated in prose: "the default password for the register is
 *      …", "temporary passwords are …" — to the end of the sentence, because a
 *      value can carry spaces or a rule ("plus the last four digits of …").
 *   2. A labelled credential: password, passcode, PIN, access/door/alarm/lock/
 *      gate/safe/keypad code, Wi-Fi password or network key, API key, secret,
 *      token — followed by ":" "=" "is" "are" "will be" and a value (also on
 *      the next line, the way a form prints "PIN:" over its value). A username
 *      on its own is not a secret and "Login: tap Sign In" is an instruction,
 *      so neither is withheld. After ":" or "=" the rest of the line is the value unless it
 *      starts with an instruction ("PIN: the unique 4-6 digit PIN the employee
 *      will use…" is a description, not a PIN). After "is" the value must look
 *      like one — a digit, a symbol, inner capitals or quotes — so policy
 *      prose ("an encrypted password is more secure") is untouched.
 *   3. Anything shaped like a machine secret wherever it appears: API keys,
 *      cloud access keys, GitHub/Slack tokens, JWTs, bearer tokens, private-key
 *      blocks, and credentials embedded in a URL or a connection string.
 *
 * Equipment is no exception either: a factory code that was never changed is
 * the lock on that piece of equipment. The steps to operate it are kept.
 *
 * WHERE IT IS APPLIED: every row that grounds an answer (and so every source
 * card and citation, which are built from the same rows), the search API's
 * results, the policy text a form is drafted from, and — so neither a model
 * nor a pasted history can route around it — the generated answer itself.
 * Nothing in the knowledge base is changed; the document stays the record.
 */

export const WITHHELD_PASSWORD =
  "[withheld — Ask Bubbles never shows passwords or access codes; ask your manager or the system's administrator]";

/* --------------------------------------------------------- 1. in prose --- */

/*
 * THE TRIGGER, then EVERYTHING TO THE END OF THE SENTENCE — across a wrapped
 * line, but not into the next list item or paragraph. The system can be named
 * between the words ("the default password for the scheduling app is …").
 */
const DEFAULT_PASSWORD =
  /\b((?:default|temporary|initial|generic|shared|factory(?:\s+set)?|master|admin(?:istrator)?)\s+(?:passwords?|pass\s?codes?|pins?|codes?)\b(?:\s+(?:for|in|on|to|of)\s+[^.\n:=]{1,40}?)?\s*(?:(?:is|are|will\s+be|=)\s*:?|[:=]))[ \t]*((?:[^.\n]|\.(?!\s|$)|\n(?!\s*(?:\d+[.)]|[•*-])\s|\s*\n))*?)(?=\.(?:\s|$)|\n\s*(?:\d+[.)]|[•*-])\s|\n\s*\n|$)/gi;

/* ----------------------------------------------------- 2. labelled ------ */

const LABEL =
  String.raw`(?:wi-?fi\s+(?:password|passcode|key)|network\s+(?:password|key)|wpa2?\s+key|passwords?|pass\s?codes?|pass\s?phrases?|pwd|pins?(?:\s+(?:number|code))?|(?:access|door|alarm|lock|gate|safe|keypad|entry|security|admin|manager|override|unlock)\s+codes?|combination|api[\s_-]?keys?|client[\s_-]?secrets?|secret(?:\s+key)?|access[\s_-]?tokens?|auth(?:entication)?[\s_-]?tokens?|tokens?)`;

/* A label, an optional "for the register", then ":", "=" or " - " and the value. */
const LABEL_COLON = new RegExp(
  String.raw`\b(${LABEL}(?:\s+(?:for|to|on|of)\s+[^.\n:=]{1,40}?)?(?:\s*[:=]|[ \t]+[-–—][ \t]+)\s*)([^\n]*)`,
  "gi",
);

/* "PIN:" on its own line, the value alone on the next one. */
const LABEL_COLON_NEXT_LINE = new RegExp(
  String.raw`\b(${LABEL}\s*[:=])[ \t]*\n[ \t]*([^\s]{1,40})[ \t]*(?=\n|$)`,
  "gi",
);

/* A label, then "is/are/will be/was/set to" and ONE credential-looking value. */
const LABEL_IS = new RegExp(
  String.raw`\b(${LABEL}(?:\s+(?:for|to|on|of)\s+[^.\n:=]{1,40}?)?\s+(?:is|are|was|will\s+be|(?:is\s+)?set\s+to|reads)\s*:?\s+)("[^"\n]{1,80}"|'[^'\n]{1,80}'|“[^”\n]{1,80}”|‘[^’\n]{1,80}’|\x60[^\x60\n]{1,80}\x60|[^\s,;)]+)`,
  "gi",
);

/*
 * Words that start a DESCRIPTION of a credential rather than the credential:
 * "Password: see your manager", "PIN: the unique 4-6 digit PIN …", "Username:
 * your work email". A value that starts with one of these is left alone.
 */
const DESCRIPTION_START =
  /^(?:\(|\[|_{2,}|-{2,}|the\b|a\b|an\b|your\b|their\b|his\b|her\b|its\b|each\b|every\b|any\b|this\b|that\b|these\b|those\b|same\b|see\b|ask\b|contact\b|call\b|email\b|provided\b|assigned\b|given\b|issued\b|set\b|create\b|choose\b|enter\b|type\b|use\b|must\b|should\b|will\b|can\b|may\b|required\b|optional\b|unique\b|personal\b|none\b|n\/a\b|blank\b|not\b|no\b|never\b|do\b|don't\b|only\b|at\s+least\b|minimum\b|maximum\b|between\b|\d+\s*(?:-|to)\s*\d+\s+(?:digits?|characters?)\b|\d+\s+(?:digits?|characters?)\b|first\b|last\b|employee\b|manager\b|in\b|on\b|from\b|by\b|for\b|with\b|if\b|when\b|log\s?in\b|sign\s?in\b|reset\b|change\b|update\b|forgot\b|case[- ]sensitive\b|confidential\b|private\b|secure\b|shown\b|displayed\b|printed\b|listed\b|located\b|found\b|available\b)/i;

/* Already withheld: redaction runs twice (rows, then the answer) and must not eat the rest of a sentence. */
function isWithheld(value: string): boolean {
  return value.trimStart().startsWith("[withheld");
}

/* A single token that looks like a credential rather than an English word. */
function looksLikeCredential(token: string): boolean {
  const bare = token.replace(/^["'“‘`]|["'”’`.,;:!?)]+$/g, "");
  if (bare.length === 0) return false;
  if (/^["'“‘`]/.test(token)) return true;
  if (/\d/.test(bare)) return true;
  if (/[!@#$%^&*_+=~|<>\\/{}[\]]/.test(bare)) return true;
  if (/^.+[A-Z]/.test(bare) && /[a-z]/.test(bare)) return true;
  return false;
}

function redactLabelled(text: string): string {
  let out = text.replace(LABEL_COLON, (match, lead: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || isWithheld(trimmed) || DESCRIPTION_START.test(trimmed)) {
      return match;
    }
    return `${lead.trimEnd()} ${WITHHELD_PASSWORD}`;
  });
  out = out.replace(LABEL_COLON_NEXT_LINE, (match, lead: string, value: string) =>
    looksLikeCredential(value) ? `${lead} ${WITHHELD_PASSWORD}` : match,
  );
  out = out.replace(LABEL_IS, (match, lead: string, value: string) =>
    !isWithheld(value) && looksLikeCredential(value) && !DESCRIPTION_START.test(value)
      ? `${lead.trimEnd()} ${WITHHELD_PASSWORD}`
      : match,
  );
  return out;
}

/* ------------------------------------------------ 3. machine secrets ---- */

const MACHINE_SECRETS: readonly RegExp[] = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g,
  /\bsk-ant-[A-Za-z0-9._-]{8,}/g,
  /\bsk-(?:proj-|live_|test_)?[A-Za-z0-9_-]{16,}/g,
  /\b(?:sb_secret|sb_publishable)_[A-Za-z0-9._-]{8,}/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi,
  /\b(?:Basic)\s+[A-Za-z0-9+/]{16,}={0,2}/g,
];

/* "scheme://user:secret@host" — the user is kept, the secret is not. */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]+)(@)/gi;

function redactMachineSecrets(text: string): string {
  let out = text;
  for (const pattern of MACHINE_SECRETS) out = out.replace(pattern, WITHHELD_PASSWORD);
  return out.replace(URL_CREDENTIALS, (_m, lead: string, _secret: string, at: string) => `${lead}${WITHHELD_PASSWORD}${at}`);
}

/* ------------------------------------------------------------- public --- */

/** The text with every credential value withheld. Idempotent. */
export function redactCredentials(text: string): string {
  if (!text) return text;
  const prose = text.replace(DEFAULT_PASSWORD, (match, lead: string, value: string) =>
    isWithheld(value) ? match : `${lead.trimEnd()} ${WITHHELD_PASSWORD}`,
  );
  return redactMachineSecrets(redactLabelled(prose));
}

/** Kept for callers of the first port; the same deterministic redaction. */
export const redactDefaultPasswords = redactCredentials;

/** A retrieved row as it may be shown to the model, the user or a source card. */
export function withoutCredentials<T extends { content: string }>(row: T): T {
  const content = redactCredentials(row.content);
  return content === row.content ? row : { ...row, content };
}

/**
 * The rows as they may be shown for any question. The question is no longer
 * consulted: nothing a person types can turn redaction off.
 */
export function rowsForQuestion(_question: string, rows: readonly MatchedChunkRow[]): MatchedChunkRow[] {
  return rows.map(withoutCredentials);
}
