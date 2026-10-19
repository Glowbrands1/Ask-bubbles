/**
 * `FORMS_GROUNDING_MODE` — off | shadow. Anything else, or nothing, is `off`.
 *
 * `enforce` is DELIBERATELY NOT A MODE in this build: asking for it resolves
 * to `shadow`, so no deployment can change drafting behaviour from here. A
 * later, separately approved change adds it.
 */
export type GroundingMode = "off" | "shadow";

export function groundingMode(env: Record<string, string | undefined> = process.env): GroundingMode {
  const raw = (env.FORMS_GROUNDING_MODE ?? "").trim().toLowerCase();
  return raw === "shadow" || raw === "enforce" ? "shadow" : "off";
}
