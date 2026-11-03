import { z } from "zod/v4";

/**
 * The structured output of the policy pick (POLICY_CITATION_CHECK_ENABLED),
 * exactly as approved in the Step A proposal, section 4. Ranges (confidence
 * 0 to 1) and the 3-alternative cap are checked in code (`resolve.ts`), not
 * here. Nothing imports this module yet.
 */

const ref = { section_title: z.string(), page: z.number(), chunk_id: z.string() };

export const PolicyPick = z.object({
  ...ref,
  quote: z.string(),
  confidence: z.number(),
  alternatives: z.array(z.object(ref)),
  asks_about_policy: z.boolean(),
});

export type PolicyPick = z.infer<typeof PolicyPick>;

/** The JSON schema the model call is held to. */
export function policyPickJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(PolicyPick) as Record<string, unknown>;
}
