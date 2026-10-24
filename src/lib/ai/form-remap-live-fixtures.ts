/**
 * User wording for the 24 Oct 2026 form replays.
 *
 * QA: `verbal` and `9/01` belong to conv_mvmj6v1t250hfij. conv_mvmj7ifs9oosat5
 * is the chat where the user typed "Create a Coaching Form", so that card is
 * a Coaching Form. The other corrective-action lines were reported with
 * `verbal` and are replayed on that conversation, in the reported order,
 * after the `10/11` already given there. Kearney and Bellevue are the stores
 * that leaked into conv_mvmj8a26gtq901w from other chats.
 */

export const CONV_VERBAL = "conv_mvmj6v1t250hfij";
export const CONV_COACHING = "conv_mvmj7ifs9oosat5";
export const CONV_LEAKED_STORE = "conv_mvmj8a26gtq901w";

export const VERBAL_TURNS = [
  "10/11",
  "verbal",
  "prior = manual ack 9/01",
  "coached on 2nd",
  "no payroll",
  "cell phone 30+ min",
  "10-20",
  "Grand Island",
] as const;

export const COACHING_FORM_TURNS = ["Create a Coaching Form"] as const;

export const LEAKED_STORE_TURNS = [
  { id: "msg-kearney", role: "user" as const, content: "corrective action at Kearney" },
  { id: "msg-bellevue", role: "user" as const, content: "change store to Bellevue" },
];
