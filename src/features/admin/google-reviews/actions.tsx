"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Link2Off, RefreshCw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { GOOGLE_CHECK_BODY, GOOGLE_CONFIRMED_SAVE_BODY } from "@/lib/google-reviews/request-bodies";

/**
 * THE SCREEN'S CONTROLS — client-side only for the clicks; every rule is
 * enforced by the server routes, so none of these buttons is the only lock.
 *
 *   Connect          a plain link: the server starts the Google sign-in.
 *   Disconnect       POST; asks Google to revoke, then ends the connection.
 *   Check (dry run)  POST the check body: reads Google, saves nothing.
 *   Sync and save    two steps. The first click only opens a confirmation; only
 *                    "Confirm and save" sends the confirmed-save body,
 *                    once (a ref blocks a double submit before React re-renders).
 *                    The server also needs GOOGLE_REVIEWS_WRITES_ENABLED.
 *
 * Nothing here can reply to, edit or delete a Google review: no route exists for it.
 */

type Outcome = { status: string; reason?: string | null; mode?: string; totals?: { fetched: number; inserted: number; updated: number; removed: number }; storesLinked?: number; storesTotal?: number; code?: string | null; missing?: string[] };

function describe(outcome: Outcome): string {
  switch (outcome.status) {
    case "succeeded":
    case "partial": {
      const t = outcome.totals;
      const what = outcome.mode === "dry_run" ? "Check finished; nothing was saved." : "Saved.";
      return `${what} ${outcome.storesLinked ?? 0} of ${outcome.storesTotal ?? 7} stores linked${t ? `, ${t.fetched} reviews read${outcome.mode === "dry_run" ? "" : ` (${t.inserted} new, ${t.updated} changed, ${t.removed} no longer returned)`}` : ""}.${outcome.status === "partial" ? " Some stores were not completed; see the table below." : ""}`;
    }
    case "not_configured":
      return `Not configured: ${(outcome.missing ?? []).join(", ") || outcome.reason}.`;
    case "confirmation_required":
      return outcome.reason ?? "Confirmation required.";
    default:
      return outcome.reason ?? `The sync did not run (${outcome.status}).`;
  }
}

export function GoogleReviewsActions({
  connected,
  canConnect,
  writesEnabled,
  enabled,
}: {
  connected: boolean;
  canConnect: boolean;
  writesEnabled: boolean;
  enabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "check" | "save" | "disconnect">(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: "accent" | "attention"; text: string } | null>(null);
  const inFlight = useRef(false);

  async function send(path: string, body: unknown, kind: "check" | "save" | "disconnect") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(kind);
    setMessage(null);
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = (await response.json().catch(() => ({}))) as Outcome & { disconnected?: boolean; revokedAtGoogle?: boolean };
      if (kind === "disconnect") {
        setMessage({ tone: "accent", text: json.disconnected ? "Disconnected. Reviews already saved are kept." : "Nothing was connected." });
      } else {
        setMessage({ tone: response.ok && (json.status === "succeeded" || json.status === "partial") ? "accent" : "attention", text: describe(json) });
      }
      // A dry run writes nothing, so it refreshes nothing; everything else can change what the page says.
      if (kind !== "check") router.refresh();
    } catch {
      setMessage({ tone: "attention", text: "The request did not reach the server. Nothing was changed." });
    } finally {
      inFlight.current = false;
      setBusy(null);
      setConfirming(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {connected ? (
          <Button variant="ghost" disabled={busy !== null} onClick={() => send("/api/admin/google-reviews/disconnect", {}, "disconnect")}>
            <Link2Off />
            {busy === "disconnect" ? "Disconnecting…" : "Disconnect Google"}
          </Button>
        ) : canConnect ? (
          <Button asChild>
            <a href="/api/admin/google-reviews/connect">
              <Link2 />
              Connect Google account
            </a>
          </Button>
        ) : (
          <Button disabled title="Google sign-in is not configured yet">
            <Link2 />
            Connect Google account
          </Button>
        )}

        <Button variant="ghost" disabled={!connected || !enabled || busy !== null} onClick={() => send("/api/admin/google-reviews/sync", GOOGLE_CHECK_BODY, "check")}>
          <RefreshCw className={busy === "check" ? "animate-spin" : undefined} />
          {busy === "check" ? "Checking…" : "Check Google (nothing saved)"}
        </Button>

        <Button disabled={!connected || !enabled || !writesEnabled || busy !== null} onClick={() => setConfirming(true)} title={writesEnabled ? undefined : "Saving is switched off (GOOGLE_REVIEWS_WRITES_ENABLED)"}>
          <Save />
          Sync and save
        </Button>
      </div>

      {confirming ? (
        <Notice tone="primary" title="Save the reviews now?" action={null}>
          <p>
            This reads all seven stores from Google and saves their reviews here. It never writes to Google and never replies to a review. A review Google stops returning is
            marked, not deleted.
          </p>
          <div className="mt-3 flex gap-2">
            <Button disabled={busy !== null} onClick={() => send("/api/admin/google-reviews/sync", GOOGLE_CONFIRMED_SAVE_BODY, "save")}>
              {busy === "save" ? "Saving…" : "Confirm and save"}
            </Button>
            <Button variant="ghost" disabled={busy !== null} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </Notice>
      ) : null}

      {message ? (
        <Notice tone={message.tone} className="max-w-3xl">
          <span role="status">{message.text}</span>
        </Notice>
      ) : null}
    </div>
  );
}

/** Confirms a candidate Google profile for one store, or clears a link. */
export function StoreLinkAction({
  storeCode,
  candidate,
  linked,
}: {
  storeCode: string;
  candidate: { account: string; location: string } | null;
  linked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function send(body: Record<string, string>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/google-reviews/locations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ storeCode, ...body }) });
      if (!response.ok) {
        const json = (await response.json().catch(() => ({}))) as { reason?: string };
        setError(json.reason ?? "That did not work.");
      } else {
        router.refresh();
      }
    } catch {
      setError("The request did not reach the server.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (candidate) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Button size="sm" disabled={busy} onClick={() => send({ action: "confirm", account: candidate.account, location: candidate.location })}>
          {busy ? "Confirming…" : "Confirm this profile"}
        </Button>
        {error ? <span className="text-[12px] text-status-failed">{error}</span> : null}
      </div>
    );
  }
  if (linked) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => send({ action: "clear" })}>
          {busy ? "Unlinking…" : "Unlink"}
        </Button>
        {error ? <span className="text-[12px] text-status-failed">{error}</span> : null}
      </div>
    );
  }
  return null;
}
