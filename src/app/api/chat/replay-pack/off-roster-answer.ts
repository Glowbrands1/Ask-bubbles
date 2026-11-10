import type { ReplayThread } from "./cases";

/**
 * OFF_ROSTER_ASK_BEFORE_CARD (switched on 9 Nov 2026, Pau's "on" via QA): a store manager's card for a full name not on
 * the roster is asked about first ("I can't find **<name>** on your roster — …", with OFF_ROSTER_CONFIRM's "reply use
 * <name>"). A case written before it, whose card is for such a name, answers "use <name>" and keeps every assertion on
 * that card turn. With no ask, the reply is returned as it was.
 */
export async function answerOffRosterAsk<T extends { content: string }>(thread: ReplayThread, reply: T, name: string): Promise<T> {
  const asked = new RegExp(String.raw`I can't find \*\*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\*\* on your roster`, "i");
  if (!asked.test(reply.content)) return reply;
  return (await thread.say(`use ${name}`)) as unknown as T;
}
