"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDashed, Power, PowerOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { SectionHeader } from "@/components/ui/layout";
import { centralClock } from "@/lib/employees/woven/auto-sync-schedule";

import { when } from "./format";
import type { AutoSyncPanelData } from "./load";

/**
 * THE AUTO SYNC CONTROL — administrators only (the page guards it; the route
 * checks `manage_integrations` again).
 *
 * It switches ONE thing: whether the daily cron may run the Woven employee
 * sync. The switch is stored in the database; the server refuses to turn it on
 * until a stored sync has saved the directory. Manual Dry run / Run now are in
 * the "Run a sync" panel below, and are unaffected by this switch.
 *
 * Turning it on never enables invitations, logins, disabling or deletion: the
 * sync has none of those.
 */

const REFUSALS: Record<string, string> = {
  sync_not_ready: "The Woven sync is not switched on and fully configured for Midwest Soap Makers.",
  writes_disabled: "Stored syncs are switched off (WOVEN_SYNC_WRITES_ENABLED), so a scheduled run could not save.",
  not_scheduled: "This deployment does not schedule the Woven cron.",
  auto_sync_requires_saved_directory: "Save the directory with a stored sync first. Automatic sync cannot be the first thing to write it.",
  setting_missing: "The Auto Sync setting has not been created in the database yet (apply the migration).",
  store_unavailable: "The database did not answer. Nothing was changed.",
};

const RUN_TONE: Record<string, "ready" | "attention" | "failed" | "neutral" | "processing"> = {
  succeeded: "ready",
  failed: "failed",
  rejected: "failed",
  running: "processing",
  abandoned: "attention",
};

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[13px]">
      {ok ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-status-ready" /> : <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>
        <span className="sr-only">{ok ? "Done: " : "Not yet: "}</span>
        {children}
      </span>
    </li>
  );
}

export function AutoSyncPanel({ data }: { data: AutoSyncPanelData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: "accent" | "attention"; text: string } | null>(null);
  const inFlight = useRef(false);

  const setting = data.setting;
  const enabled = setting.state === "ready" && setting.enabled;
  const r = data.readiness;
  const canEnable = setting.state === "ready" && !enabled && r.syncReady && r.writesEnabled && r.scheduled && r.directorySaved;

  async function change(next: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/employees/woven/auto-sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: next }) });
      const json = (await response.json().catch(() => ({}))) as { status?: string; code?: string; reason?: string };
      if (response.ok && json.status === "ok") {
        setMessage({ tone: "accent", text: next ? "Auto Sync is ON." : "Auto Sync is OFF. No scheduled run will start." });
        router.refresh();
      } else {
        setMessage({ tone: "attention", text: (json.code && REFUSALS[json.code]) || json.reason || "That did not work. Nothing was changed." });
      }
    } catch {
      setMessage({ tone: "attention", text: "The request did not reach the server. Nothing was changed." });
    } finally {
      inFlight.current = false;
      setBusy(false);
      setConfirming(false);
    }
  }

  const next = data.schedule?.nextRunAt ? new Date(data.schedule.nextRunAt) : null;

  return (
    <section id="auto-sync" aria-labelledby="auto-sync-title" className="mb-8" data-testid="auto-sync-panel">
      <SectionHeader
        title="Auto Sync"
        description="Runs the Woven employee sync on a schedule. Directory only: it never creates logins, sends invitations, disables accounts or deletes anyone."
      />

      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-soft">
        <div className="flex flex-wrap items-center gap-3">
          <h3 id="auto-sync-title" className="sr-only">Auto Sync status</h3>
          {setting.state === "ready" ? (
            <Badge tone={enabled ? "ready" : "neutral"} size="md">{enabled ? "Auto Sync is ON" : "Auto Sync is OFF"}</Badge>
          ) : (
            <Badge tone="attention" size="md">Status unavailable</Badge>
          )}
          {setting.state === "ready" && setting.updatedAt ? <span className="text-[12px] text-muted-foreground">Changed {when(setting.updatedAt)} (Central)</span> : null}
        </div>

        {setting.state === "missing" ? (
          <Notice tone="attention" className="mt-3" title="The Auto Sync setting is not installed">
            Apply database migration 20261014001000. Until then the scheduled sync starts nothing.
          </Notice>
        ) : setting.state === "unavailable" ? (
          <Notice tone="attention" className="mt-3" title="The Auto Sync setting could not be read">
            The database did not answer{setting.code ? ` (${setting.code})` : ""}. The scheduled sync starts nothing while this is the case.
          </Notice>
        ) : null}

        <dl className="mt-4 grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Frequency</dt>
            <dd className="mt-0.5 text-foreground" data-testid="auto-sync-frequency">
              {data.schedule ? (
                <>
                  {data.schedule.description ?? `Cron ${data.schedule.expression}`}
                  {next && data.schedule.description ? <span className="block text-[12px] text-muted-foreground">{centralClock(next)} Central</span> : null}
                </>
              ) : (
                "Not scheduled in this build"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Next scheduled run</dt>
            <dd className="mt-0.5 text-foreground" data-testid="auto-sync-next">
              {enabled && data.schedule?.nextRunAt ? `${when(data.schedule.nextRunAt)} (Central)` : "None — Auto Sync is off"}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Last successful sync</dt>
            <dd className="mt-0.5 text-foreground">{data.lastSuccessAt ? `${when(data.lastSuccessAt)} (Central)` : "Never"}</dd>
          </div>
          <div>
            <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Last scheduled success</dt>
            <dd className="mt-0.5 text-foreground">{data.lastScheduledSuccessAt ? `${when(data.lastScheduledSuccessAt)} (Central)` : "None yet"}</dd>
          </div>
        </dl>

        {setting.state === "ready" && !enabled ? (
          <ul className="mt-4 flex flex-col gap-1.5" aria-label="Before Auto Sync can be turned on">
            <Check ok={r.syncReady}>The Woven sync is on and configured for Midwest Soap Makers</Check>
            <Check ok={r.writesEnabled}>Stored syncs are allowed (WOVEN_SYNC_WRITES_ENABLED)</Check>
            <Check ok={r.scheduled}>This deployment schedules the Woven cron</Check>
            <Check ok={r.directorySaved}>A stored sync has saved the directory</Check>
          </ul>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {setting.state === "ready" && enabled ? (
            <Button variant="outline" disabled={busy} onClick={() => change(false)}>
              <PowerOff />
              {busy ? "Turning off…" : "Turn Auto Sync off"}
            </Button>
          ) : (
            <Button disabled={!canEnable || busy} onClick={() => setConfirming(true)} title={canEnable ? undefined : "Complete the checklist above first"}>
              <Power />
              Turn Auto Sync on
            </Button>
          )}
          <a href="#manual-sync" className="text-[13px] font-semibold text-primary underline underline-offset-4">
            Dry run and Run now are in “Run a sync” below
          </a>
        </div>

        {confirming ? (
          <Notice tone="primary" className="mt-4" title="Turn Auto Sync on?">
            <p>
              {data.schedule?.description ?? "On its schedule"}, Ask Bubbles will read Woven for Midwest Soap Makers only and update the employee directory. A read that is
              incomplete or names another company saves nothing, and only one run can be in progress at a time. It will not create logins, send invitations, disable
              accounts or delete anyone. You can turn it off here at any time.
            </p>
            <div className="mt-3 flex gap-2">
              <Button disabled={busy} onClick={() => change(true)}>{busy ? "Turning on…" : "Confirm: turn on"}</Button>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
            </div>
          </Notice>
        ) : null}

        {message ? (
          <Notice tone={message.tone} className="mt-4">
            <span role="status">{message.text}</span>
          </Notice>
        ) : null}
      </div>

      <h4 className="mb-2 mt-5 text-[13px] font-semibold text-foreground">Recent runs</h4>
      {data.recentRuns.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No sync has been recorded yet. A dry run records nothing; the first stored sync appears here.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-[var(--radius-md)] border border-border bg-surface" aria-label="Recent sync runs">
          {data.recentRuns.map((run) => (
            <li key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
              <span className="text-foreground">{when(run.startedAt)}</span>
              <Badge tone={RUN_TONE[run.status] ?? "neutral"}>{run.status}</Badge>
              <span className="text-muted-foreground">{run.scheduled ? "Scheduled" : "Manual"}</span>
              <span className="text-muted-foreground">{run.employeesReceived} received · {run.changesRecorded} changes</span>
              {run.errorCode ? <span className="text-status-failed">{run.errorCode.replaceAll("_", " ")}</span> : null}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[12px] text-muted-foreground">Full history, with counts and codes, is on the Runs tab.</p>
    </section>
  );
}
