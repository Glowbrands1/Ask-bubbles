/**
 * ============================================================================
 * GLO BRANDS APP LINKS (COMPANY CONFIGURATION)
 * ============================================================================
 *
 * Where the app switcher (src/components/shell/app-switcher.tsx) sends people.
 * The three apps are separate deployments; these are plain links, nothing is
 * shared between them. WHO sees the Leadership Hub tab is decided on the server
 * (`pageShowsLeadershipHubTab`, src/lib/auth/app-switcher.ts), not here.
 *
 * Each address can be overridden per deployment with a NEXT_PUBLIC_ variable
 * (read with literal names so Next inlines them into the client bundle).
 */

const DEFAULT_ASK_SUNNY_URL = "https://ask-sunny.vercel.app";
const DEFAULT_LEADERSHIP_HUB_URL = "https://leadership-hub-beta.vercel.app";

function urlFrom(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export const ASK_SUNNY_URL = urlFrom(process.env.NEXT_PUBLIC_ASK_SUNNY_URL, DEFAULT_ASK_SUNNY_URL);
export const LEADERSHIP_HUB_URL = urlFrom(
  process.env.NEXT_PUBLIC_LEADERSHIP_HUB_URL,
  DEFAULT_LEADERSHIP_HUB_URL,
);

/** The Leadership Hub's address without a trailing slash, for the DM L10 tab's server calls and links (src/features/l10). */
export function leadershipHubUrl(): string {
  // Read at call time (not the module-load constant above), so a server reads its deployment's value.
  return urlFrom(process.env.NEXT_PUBLIC_LEADERSHIP_HUB_URL, DEFAULT_LEADERSHIP_HUB_URL).replace(/\/+$/, "");
}

/**
 * HR'S QUEUE IN THE SIBLING APP (owner, 23 Nov 2026; `src/lib/partner/sibling-hr-queue.ts`). This app's id, which it
 * signs its requests with, and the sibling's id and address, the one caller `/api/partner/hr-queue` answers. Ids only:
 * the sibling's display name comes from its own answer.
 */
export const SIBLING_HR_APP = {
  thisAppId: "ask-bubbles",
  siblingAppId: "ask-sunny",
} as const;

/** The sibling app's address without a trailing slash, read at call time (server only). */
export function siblingAppUrl(): string {
  return urlFrom(process.env.NEXT_PUBLIC_ASK_SUNNY_URL, DEFAULT_ASK_SUNNY_URL).replace(/\/+$/, "");
}
