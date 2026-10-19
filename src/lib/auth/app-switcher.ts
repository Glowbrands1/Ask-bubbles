import "server-only";

import { canAccessAdminConsole } from "@/lib/permissions";
import { pageAuthorizationEnforced, pageIdentity } from "./page";

export { APP_SWITCHER_USER_IDS } from "./app-switcher-users";
import { APP_SWITCHER_USER_IDS } from "./app-switcher-users";

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
