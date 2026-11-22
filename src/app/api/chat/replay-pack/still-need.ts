import { stillAsks } from "@/lib/forms/reply-guards";

/**
 * EVERY REPLY (QA, 3 Nov 2026): "I still need …" is never said unless the reply asks something. The pack first read only
 * `stillAsks` (who, which location, which date). QA's live regression triage (22 Nov 2026; approved by QA): the live
 * loop's legitimate "I still need to know what happened … What did the customer complain about?" and "I still need you to
 * confirm the name … Did you mean **<P>**?" ask a question too. Kept the rule: a reply that says "I still need" and asks
 * nothing ("I still need the same answer before I can make this card.", eval b10) still fails.
 */
export function stillNeedWithoutQuestion(content: string): boolean {
  if (!/^I still need\b/m.test(content)) return false;
  if (stillAsks(content) !== null) return false;
  return !/\?/.test(content);
}
