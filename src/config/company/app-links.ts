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
