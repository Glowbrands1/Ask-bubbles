/**
 * TEMPLATES THIS DEPLOYMENT HAS RETIRED.
 *
 * A key listed here is switched off (`active = false`) the next time the
 * library is installed — never deleted. Its rows, versions, assets and any
 * form already filed against it are kept as they are. Read by
 * `ensureTemplateLibrary` only.
 */
import { EXAMPLE_CHECK_IN_KEY } from "./example-check-in";

/**
 * "Team Member Check-In (Example)" — the placeholder this deployment shipped
 * before the real HR library. Retired once all seventeen migrated forms
 * passed QA (`src/test/qa/forms-migration-qa.test.ts`). Switched off, never
 * deleted: a check-in already filed still opens and prints.
 */
export const RETIRED_TEMPLATE_KEYS: readonly string[] = [EXAMPLE_CHECK_IN_KEY];
