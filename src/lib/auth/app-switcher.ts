import "server-only";

import { canAccessAdminConsole } from "@/lib/permissions";
import { pageAuthorizationEnforced, pageIdentity } from "./page";

/**
 * Supabase Auth user ids (`auth.users.id` = `app_users.id`, Ask Bubbles project)
 * of people who are offered the switcher without being administrators:
 * one District Manager and one Regional Manager, by owner approval. These are
 * the Ask Bubbles ids, which differ from their ids in the sister app. Ids only —
 * the people are not named in this repository.
 */
export const APP_SWITCHER_USER_IDS: readonly string[] = [
  "4979fa8a-09ae-4b89-ad54-054be3acf6ba", // a District Manager
  "4f085a07-4e36-4ff0-a482-4dfba828b235", // a Regional Manager
];

/**
 * WHETHER THIS RENDER OFFERS THE APP SWITCHER — administrators, plus two named users.
 *
 * Decided here, on the server, from the VERIFIED identity: the role comes from
 * the auth provider and this app's own profile record, never from the browser.
 * "Administrator" is this app's existing answer, `canAccessAdminConsole`, so no
 * role is added and an administrator of the other app is not thereby one here.
 *
 * It fails closed. Demo mode has no verified identity (its role is the
 * presenter's switcher), so the switcher is never shown there; an unverified or
 * missing identity, or any error, also answers false. Anyone who is
 * neither an administrator nor one of the two named users never has the
 * switcher in their page at all.
 *
 * ONE NAMED EXCEPTION. Two non-administrators are offered the switcher too, by
 * stable Supabase user id (`APP_SWITCHER_USER_IDS`), never by email or role. It
 * changes their VISIBILITY of a link only: role, scope and permissions — and so
 * Admin Console access — are untouched. The identity provider only returns a
 * verified identity for an ACTIVE profile, so a disabled or invited account
 * never reaches this check as a match.
 *
 * IT IS NOT A BOUNDARY. The switcher is a link to the other app's public login;
 * that app's own sign-in and permissions decide what happens on arrival.
 */
export async function pageShowsAppSwitcher(): Promise<boolean> {
  try {
    if (!pageAuthorizationEnforced()) return false;
    const identity = await pageIdentity();
    if (!identity?.verified) return false;
    return canAccessAdminConsole(identity.role) || APP_SWITCHER_USER_IDS.includes(identity.subject);
  } catch {
    return false;
  }
}

/**
 * Whether `email` is on the comma-separated list in `raw` (the server-only
 * LEADERSHIP_HUB_TAB_EMAILS variable). Trimmed and case-insensitive; a missing,
 * empty or blank list matches nobody.
 */
export function emailOnLeadershipHubList(raw: string | undefined, email: string | undefined): boolean {
  const wanted = email?.trim().toLowerCase();
  if (!wanted || !raw) return false;
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .some((entry) => entry !== "" && entry === wanted);
}

/**
 * WHETHER THIS RENDER SHOWS THE "LEADERSHIP HUB" TAB IN THE SWITCHER.
 *
 * The list lives only in the server-side LEADERSHIP_HUB_TAB_EMAILS variable
 * (never NEXT_PUBLIC_, never in the repository) and is compared here with the
 * VERIFIED signed-in email; the browser receives a yes/no and nothing else.
 * Fails closed: variable unset or empty, signed out, unverified, demo mode or
 * any error all answer false. It shows a link only; the Leadership Hub's own
 * sign-in decides what happens on arrival.
 */
export async function pageShowsLeadershipHubTab(): Promise<boolean> {
  try {
    const raw = process.env.LEADERSHIP_HUB_TAB_EMAILS;
    if (!raw?.trim()) return false;
    if (!pageAuthorizationEnforced()) return false;
    const identity = await pageIdentity();
    if (!identity?.verified) return false;
    return emailOnLeadershipHubList(raw, identity.email);
  } catch {
    return false;
  }
}
