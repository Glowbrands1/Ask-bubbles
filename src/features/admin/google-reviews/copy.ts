import type { Blocker } from "@/lib/google-reviews/views";

/**
 * What the screen says, in words a person can act on. Every sentence is derived
 * from a measured code; none is decorative.
 */

export const OAUTH_ERROR_TEXT: Record<string, string> = {
  denied: "Google did not give access. Nothing was connected. You can try again.",
  state_mismatch: "That sign-in could not be verified (it may have been opened in another window). Nothing was connected. Start again from this page.",
  attempt_expired: "That sign-in took longer than 10 minutes and expired. Start again.",
  attempt_invalid: "That sign-in was not started from this page. Start again from the Connect button.",
  invalid_grant: "Google rejected the sign-in code. Start again.",
  invalid_client: "Google rejected this application's OAuth client. Check GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.",
  no_refresh_token: "Google did not return long-lived access. Start again and approve every permission on the consent screen.",
  missing_scope: "The Business Profile permission was not approved, so nothing was connected. Start again and tick it on the consent screen.",
  bad_response: "Google's reply was not in the expected form. Nothing was connected.",
  network_error: "Google could not be reached. Nothing was connected.",
  not_configured: "Google sign-in is not configured on this deployment yet.",
  store_error: "The connection could not be saved to the database. Nothing was connected.",
};

export function blockerText(blocker: NonNullable<Blocker>): { title: string; body: string } {
  switch (blocker.code) {
    case "not_configured":
      return {
        title: "Google sign-in is not configured",
        body: `Set ${blocker.missing.join(", ")} on the server, then redeploy. Values are never shown here.`,
      };
    case "disabled":
      return { title: "The Google Reviews sync is switched off", body: "Set GOOGLE_REVIEWS_SYNC_ENABLED=true to allow it to reach Google. Nothing is read until then." };
    case "not_connected":
      return { title: "No Google account is connected", body: "Connect the Google account that manages Buff City Soap's Business Profiles. Ask Bubbles only reads reviews." };
    case "authorization_expired":
      return { title: "Google no longer accepts the saved connection", body: "The access was revoked or expired. Reconnect the Google account. Reviews already saved are kept." };
    case "api_access_pending":
      return {
        title: "Waiting for Google's approval of the Business Profile APIs",
        body: "The Google Cloud project has not been approved for the Business Profile APIs, so Google refuses every request with a zero quota. Nothing on this side can speed that up. Once Google approves the access request, the next sync works without any change here.",
      };
    case "api_disabled":
      return { title: "A Business Profile API is switched off in Google Cloud", body: "Enable the My Business Account Management, Business Information and My Business APIs in the Google Cloud project, then run a sync." };
    case "last_run_failed":
      return { title: "The last sync did not complete", body: `Google or the database returned “${blocker.errorCode.replaceAll("_", " ")}”. The next run will try again; nothing already saved was changed.` };
  }
}

export const MATCH_LABEL: Record<string, string> = {
  matched: "Linked",
  confirmed: "Confirmed",
  candidate: "Needs confirmation",
  mismatch: "Does not match",
  ambiguous: "Ambiguous",
  unmatched: "Not found in Google",
};

export const MATCH_TONE: Record<string, "ready" | "attention" | "failed" | "neutral"> = {
  matched: "ready",
  confirmed: "ready",
  candidate: "attention",
  mismatch: "failed",
  ambiguous: "failed",
  unmatched: "neutral",
};

export const MATCH_HELP: Record<string, string> = {
  candidate: "Google has a profile at this address but its store code is missing. Confirm it only if it is this store.",
  mismatch: "A profile has this store's code or address but not both, so it was not linked.",
  ambiguous: "More than one Google profile fits equally well, so none was linked.",
  unmatched: "No Google Business Profile in the connected account matches this store's code and address.",
};

export const REASON_TEXT: Record<string, string> = {
  store_code_matches_but_address_differs: "The store code matches but the address differs.",
  address_matches_but_store_code_differs: "The address matches but Google lists a different store code.",
  several_google_locations_match: "Several Google profiles match.",
  several_candidates: "Several Google profiles are possible.",
  location_matches_several_stores: "This Google profile also matches another store.",
  no_google_location_found: "No matching profile found.",
};

export const SYNC_ERROR_TEXT: Record<string, string> = {
  removal_guard: "Google returned far fewer reviews than are saved, so nothing was removed.",
  server_error: "Google had a server error.",
  rate_limited: "Google rate limited the request.",
  network_error: "Google could not be reached.",
  confirmed_link_not_found: "The confirmed Google profile is no longer in the account.",
  time_budget_exceeded: "The run ran out of time.",
  store_error: "The database could not save this store.",
};
