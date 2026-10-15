"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Copy,
  KeyRound,
  Loader2,
  MailCheck,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup, Input, Select } from "@/components/ui/field";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { ScrollTable, SectionHeader } from "@/components/ui/layout";
import {
  Dialog,
  DialogActions,
  DialogClose,
  DialogContent,
} from "@/components/ui/overlays";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  additionalLocationOptions,
  cleanAdditionalLocations,
  reachableLocationIds,
} from "@/lib/admin/additional-locations";
import type { InviteSuggestion } from "@/lib/admin/woven-invite-suggestion";
import {
  COMPANY_DISTRICTS,
  COMPANY_REGIONS,
  COMPANY_LOCATIONS,
  areaLabel,
} from "@/lib/locations";
import { ADMIN_CONSOLE_ROLES, ROLE_DESCRIPTION, ROLE_LABEL, ROLES } from "@/lib/permissions";
import { useSession } from "@/lib/session/session-context";
import { relativeTime } from "@/lib/utils/date";
import type { AccessScope, Role, ScopeLevel } from "@/types";

/**
 * ============================================================================
 * THE REAL USER DIRECTORY.
 * ============================================================================
 *
 * Reads and writes `/api/admin/users`, which is authorized server-side against
 * a verified identity. Nothing on this screen is trusted to be a boundary: the
 * disabled buttons and hidden options below are there so an administrator is
 * not offered an action that will fail, and every one of them is enforced again
 * on the server whether or not this component behaves.
 *
 * ============================================================================
 * WHAT THIS SCREEN CANNOT DO, BY DESIGN
 * ============================================================================
 *
 * It cannot set, show, generate or email a password. "Send sign-in link" asks
 * the server to have SUPABASE mail the person a link they use themselves; the
 * link never comes back here, so there is nothing for this screen to display
 * even if somebody asked it to. That is why there is no "copy link" button and
 * no password field anywhere below.
 *
 * It cannot change an email address either. The address is the credential's
 * identity, so changing it in the profile alone would silently break sign-in —
 * which looks like an app bug rather than an edit.
 */

export interface DirectoryUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: "invited" | "active" | "disabled";
  scope: AccessScope;
  createdAt: string;
  updatedAt: string;
}

/** Uses the shared badge tones so status reads the same as it does elsewhere. */
const STATUS_TONE: Record<DirectoryUser["status"], "ready" | "processing" | "neutral"> = {
  active: "ready",
  invited: "processing",
  disabled: "neutral",
};

const STATUS_LABEL: Record<DirectoryUser["status"], string> = {
  active: "Active",
  invited: "Invited",
  disabled: "Disabled",
};

/** Areas an administrator can pick, by scope level. */
const AREAS: Record<Exclude<ScopeLevel, "global">, { id: string; name: string }[]> = {
  location: COMPANY_LOCATIONS.map((entry) => ({ id: entry.id, name: entry.name })),
  district: COMPANY_DISTRICTS.map((entry) => ({ id: entry.id, name: entry.name })),
  region: COMPANY_REGIONS.map((entry) => ({ id: entry.id, name: entry.name })),
};

function areaName(scope: AccessScope): string {
  if (scope.level === "global") return "All locations";
  if (!scope.primaryAreaId) return "—";
  const list = AREAS[scope.level];
  return list.find((entry) => entry.id === scope.primaryAreaId)?.name ?? scope.primaryAreaId;
}

export function DirectoryScreen({
  /**
   * The directory as the SERVER read it for this request.
   *
   * Passed in rather than fetched on mount. The page already required
   * `manage_users` before rendering, so the same request that proved the caller
   * may see this list also read it: the first paint is the real thing, there is
   * no second round trip, and there is no mount effect to cascade renders.
   */
  initialUsers,
  loadError: initialLoadError = null,
}: {
  initialUsers: DirectoryUser[];
  loadError?: string | null;
}) {
  const { user: me } = useSession();

  const [users, setUsers] = useState<DirectoryUser[]>(initialUsers);
  const [loadError, setLoadError] = useState<string | null>(initialLoadError);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [locationsFor, setLocationsFor] = useState<DirectoryUser | null>(null);
  const [wovenOpen, setWovenOpen] = useState(false);
  /*
   * A generated reset link. A CREDENTIAL: held only while its dialog is open
   * and dropped the moment it closes. Never persisted, never logged.
   */
  const [resetLink, setResetLink] = useState<{ email: string; url: string } | null>(null);

  /*
   * The error is cleared when an ANSWER arrives, not when a request starts.
   *
   * Clearing it first read better — the banner disappears the moment you press
   * Refresh — but it is a synchronous setState in the mount effect, which
   * cascades a render before the fetch has even been issued. Clearing on the
   * response is also more honest: while the request is in flight, the last
   * thing we actually know is still that the previous one failed.
   */
  /**
   * Re-reads the directory. Called from the Refresh button and after nothing
   * else — a user action, never a render.
   *
   * On failure the CURRENT list is kept rather than replaced with an empty one.
   * Blanking an administration screen because one refresh failed is worse than
   * showing a slightly stale list beside a message saying so.
   */
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setLoadError(
          (payload as { error?: string } | null)?.error ??
            "The user list could not be refreshed.",
        );
        return;
      }
      setLoadError(null);
      setUsers((payload as { users: DirectoryUser[] }).users);
    } catch {
      setLoadError("The user list could not be refreshed. Check your connection and try again.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users
      .filter((entry) => (roleFilter === "all" ? true : entry.role === roleFilter))
      .filter((entry) => {
        if (!needle) return true;
        return (
          entry.displayName.toLowerCase().includes(needle) ||
          entry.email.toLowerCase().includes(needle) ||
          ROLE_LABEL[entry.role].toLowerCase().includes(needle)
        );
      });
  }, [users, query, roleFilter]);

  /**
   * How many ACTIVE administrators there are, counted from what is on screen.
   *
   * Used only to disable a control before it is clicked. The refusal itself
   * lives in the API and in a database trigger, counted there against the whole
   * table — this count would be wrong the moment somebody else made a change,
   * and it is not allowed to be the thing that protects the last administrator.
   */
  const activeAdmins = useMemo(
    () =>
      users.filter(
        (entry) =>
          entry.status === "active" &&
          (ADMIN_CONSOLE_ROLES as readonly string[]).includes(entry.role),
      ).length,
    [users],
  );

  async function send(
    id: string,
    body: Record<string, unknown> | null,
    path = "",
  ): Promise<boolean> {
    setBusyId(id);
    setActionError(null);
    setActionNote(null);
    try {
      const response = await fetch(`/api/admin/users/${id}${path}`, {
        method: body ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setActionError(
          (payload as { error?: string } | null)?.error ?? "That change could not be saved.",
        );
        return false;
      }

      const updated = (payload as { user?: DirectoryUser }).user;
      if (updated) {
        setUsers((current) =>
          current.map((entry) => (entry.id === updated.id ? updated : entry)),
        );
      }
      const sent = (payload as { sent?: string; email?: string }).sent;
      if (sent) {
        setActionNote(
          sent === "invitation"
            ? `A new invitation is on its way to ${(payload as { email: string }).email}.`
            : `A password reset link is on its way to ${(payload as { email: string }).email}.`,
        );
      }
      return true;
    } catch {
      setActionError("That change could not be saved. Check your connection and try again.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Asks the server for a reset link. No body: the server looks the person up
   * by id and never accepts an address from here.
   */
  async function generateResetLink(id: string): Promise<void> {
    setBusyId(id);
    setActionError(null);
    setActionNote(null);
    try {
      const response = await fetch(`/api/admin/users/${id}/reset-link`, {
        method: "POST",
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => null);
      const url = (payload as { url?: unknown } | null)?.url;
      const email = (payload as { email?: unknown } | null)?.email;

      if (!response.ok || typeof url !== "string" || typeof email !== "string") {
        setActionError(
          (payload as { error?: string } | null)?.error ??
            "The reset link could not be generated.",
        );
        return;
      }
      setResetLink({ email, url });
    } catch {
      setActionError("The reset link could not be generated. Check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {loadError ? (
        <Notice tone="attention" title="The directory is unavailable">
          {loadError}
        </Notice>
      ) : null}
      {actionError ? (
        <Notice tone="attention" title="That did not work">
          {actionError}
        </Notice>
      ) : null}
      {actionNote ? (
        <Notice tone="accent" icon={<MailCheck />}>
          {actionNote}
        </Notice>
      ) : null}

      <SectionHeader
        title="Team"
        description="Every person with an Ask Bubbles login. Roles and access are read from the server on every request — nothing here is decided in the browser."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={refreshing}
              onClick={() => void load()}
            >
              {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Refresh
            </Button>
            <Button variant="outline" onClick={() => setWovenOpen(true)}>
              <UserPlus />
              Create account for a Woven employee
            </Button>
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus />
              Invite someone
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <FieldGroup label="Search" htmlFor="directory-search" className="min-w-56 flex-1">
              <Input
                id="directory-search"
                type="search"
                placeholder="Name, email or role"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </FieldGroup>
            <FieldGroup label="Role" htmlFor="directory-role" className="min-w-48">
              <Select
                id="directory-role"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as Role | "all")}
              >
                <option value="all">All roles</option>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </Select>
            </FieldGroup>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Search />}
              title={users.length === 0 ? "No accounts yet" : "Nobody matches that"}
              description={
                users.length === 0
                  ? "No Ask Bubbles accounts exist yet. Invite the first person to get started."
                  : "Try a different name, email or role."
              }
            />
          ) : (
            <ScrollTable>
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11px] tracking-wide text-muted-foreground uppercase">
                    <th className="py-2 pr-3 font-semibold">Person</th>
                    <th className="py-2 pr-3 font-semibold">Role</th>
                    <th className="py-2 pr-3 font-semibold">Scope</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 pr-3 font-semibold">Updated</th>
                    <th className="py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => {
                    const isMe = entry.id === me.id;
                    const isAdministrative = (ADMIN_CONSOLE_ROLES as readonly string[]).includes(
                      entry.role,
                    );
                    /*
                     * Disabled when this is the last active administrator, so a
                     * change that the server would refuse is not offered. The
                     * server refuses it anyway — see `activeAdmins`.
                     */
                    const isLastAdmin =
                      isAdministrative && entry.status === "active" && activeAdmins <= 1;
                    const busy = busyId === entry.id;

                    return (
                      <tr key={entry.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2.5 pr-3">
                          <span className="block font-medium text-foreground">
                            {entry.displayName}
                            {isMe ? (
                              <Badge tone="neutral" size="sm" className="ml-2">
                                You
                              </Badge>
                            ) : null}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {entry.email}
                          </span>
                        </td>

                        <td className="py-2.5 pr-3">
                          <Select
                            aria-label={`Role for ${entry.displayName}`}
                            value={entry.role}
                            disabled={busy || isMe || isLastAdmin}
                            onChange={(event) =>
                              void send(entry.id, { role: event.target.value })
                            }
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABEL[role]}
                              </option>
                            ))}
                          </Select>
                        </td>

                        <td className="py-2.5 pr-3 text-muted-foreground">
                          <span className="block">{areaName(entry.scope)}</span>
                          <span className="block text-xs capitalize">{entry.scope.level}</span>
                          {entry.scope.alsoCoversAreaIds.length > 0 ? (
                            <span className="mt-1 block text-xs text-subtle-foreground">
                              Also: {entry.scope.alsoCoversAreaIds.map((id) => areaLabel(id)).join(", ")}
                            </span>
                          ) : null}
                        </td>

                        <td className="py-2.5 pr-3">
                          <Badge tone={STATUS_TONE[entry.status]} size="sm">
                            {STATUS_LABEL[entry.status]}
                          </Badge>
                        </td>

                        <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                          {entry.updatedAt ? relativeTime(entry.updatedAt) : "—"}
                        </td>

                        <td className="py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy || entry.status === "disabled"}
                              onClick={() => void send(entry.id, null, "/recovery")}
                            >
                              {busy ? <Loader2 className="animate-spin" /> : <MailCheck />}
                              {/*
                                ONE LABEL FOR BOTH. It used to say "Resend
                                invite" for an invited profile, which the server
                                no longer guarantees: whether an invitation or a
                                reset goes out is decided from the CREDENTIAL's
                                confirmation state, not the profile's status, so
                                an invited-but-confirmed account correctly gets
                                a reset. The notice after the click says which
                                was actually sent; the button no longer predicts
                                it wrongly.
                              */}
                              Send sign-in link
                            </Button>

                            {/*
                              Offered for active, non-administrator accounts
                              only — the server refuses everything else anyway.
                              See `lib/admin/reset-link.ts` for why
                              administrators are excluded.
                            */}
                            {entry.status === "active" && !isAdministrative ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => void generateResetLink(entry.id)}
                              >
                                <KeyRound />
                                Generate reset link
                              </Button>
                            ) : null}

                            {/*
                              A global scope already covers every location, so
                              there is nothing to add to it.
                            */}
                            {entry.scope.level !== "global" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                  setActionError(null);
                                  setLocationsFor(entry);
                                }}
                              >
                                <MapPin />
                                Edit locations
                              </Button>
                            ) : null}

                            {entry.status === "disabled" ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={busy}
                                onClick={() => void send(entry.id, { status: "active" })}
                              >
                                Re-enable
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={busy || isMe || isLastAdmin}
                                onClick={() => void send(entry.id, { status: "disabled" })}
                              >
                                Disable
                              </Button>
                            )}
                          </div>
                          {isLastAdmin ? (
                            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                              <AlertTriangle className="size-3 shrink-0" aria-hidden />
                              Last administrator — give somebody else admin access first.
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollTable>
          )}
        </CardContent>
      </Card>

      <Notice tone="neutral" icon={<ShieldCheck />} title="Ask Bubbles never handles passwords">
        Passwords are held by Supabase Auth. Nobody here — including an
        administrator — can read, set or email one. &ldquo;Send sign-in
        link&rdquo; asks Supabase to email the person a single-use link they use
        themselves. &ldquo;Generate reset link&rdquo; shows a single-use link
        once, to you only, for you to send them privately; the person still
        chooses their own password.
      </Notice>

      <ResetLinkDialog
        link={resetLink}
        onClose={() => setResetLink(null)}
      />

      <WovenAccountDialog
        open={wovenOpen}
        onOpenChange={setWovenOpen}
        onDone={(note) => {
          setActionNote(note);
          void load();
        }}
      />

      <EditLocationsDialog
        user={locationsFor}
        error={actionError}
        onClose={() => setLocationsFor(null)}
        onSave={async (target, alsoCoversAreaIds) => {
          /*
           * The WHOLE scope is sent, with only the additional locations
           * changed: the level and primary come from the row as the server last
           * returned it, so saving here cannot move somebody's primary area.
           */
          const saved = await send(target.id, {
            scope: {
              level: target.scope.level,
              primaryAreaId: target.scope.primaryAreaId,
              alsoCoversAreaIds,
            },
          });
          if (saved) setActionNote(`Locations updated for ${target.email}.`);
          return saved;
        }}
      />

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={(user) => {
          setUsers((current) => [...current, user]);
          setActionNote(`An invitation is on its way to ${user.email}.`);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------ reset link -- */

/**
 * Shows a generated reset link ONCE, to the administrator who asked for it.
 *
 * The link is plain text in a read-only field — never an anchor, so a stray
 * click cannot open it and spend it in the administrator's own browser. Closing
 * the dialog drops it; there is no way to show it again, only to generate a new
 * one (which replaces this one).
 */
export function ResetLinkDialog({
  link,
  onClose,
}: {
  link: { email: string; url: string } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");

  function close(open: boolean) {
    if (open) return;
    setCopied("idle");
    onClose();
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <Dialog open={link !== null} onOpenChange={close}>
      <DialogContent
        title="Password reset link"
        description={link ? `For ${link.email}. No email has been sent.` : undefined}
      >
        {link ? (
          <div className="space-y-4">
            <Notice tone="attention" title="This link is a one-time credential">
              Anyone who opens it can set a new password for this account. Send
              it only to {link.email}, privately (for example a direct Teams
              message). Do not open it yourself. It stops working once it is
              used, when it expires, or when another link is generated.
            </Notice>

            <FieldGroup label="Reset link" htmlFor="reset-link-url">
              <Input
                id="reset-link-url"
                readOnly
                value={link.url}
                onFocus={(event) => event.currentTarget.select()}
                autoComplete="off"
                spellCheck={false}
              />
            </FieldGroup>

            {copied === "copied" ? (
              <p role="status" className="text-xs text-muted-foreground">
                Copied. Paste it into a private message to {link.email}.
              </p>
            ) : copied === "failed" ? (
              <p role="status" className="text-xs text-muted-foreground">
                Could not copy automatically. Select the link above and copy it.
              </p>
            ) : null}

            <DialogActions>
              <DialogClose asChild>
                <Button variant="ghost">Close</Button>
              </DialogClose>
              <Button onClick={() => void copy()}>
                <Copy />
                Copy reset link
              </Button>
            </DialogActions>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- invite -- */

/** What the Woven lookup is doing for the address currently typed. */
type SuggestionLookup =
  | { state: "idle" }
  | { state: "loading"; email: string }
  | { state: "done"; email: string; result: InviteSuggestion }
  | { state: "applied"; email: string; result: InviteSuggestion };

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SCOPE_LEVEL_LABEL: Record<Exclude<ScopeLevel, "global">, string> = {
  location: "One location",
  district: "A district",
  region: "A region",
};

function InviteDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: (user: DirectoryUser) => void;
}) {
  const { user: me } = useSession();
  const reach = reachableLocationIds(me?.scope);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  /*
   * Employee is the default, deliberately. The least-privileged role is the
   * safe thing to click past, and an invitation sent with the wrong role is
   * only recoverable by noticing it.
   */
  const [role, setRole] = useState<Role>("employee");
  /* What THIS administrator may offer (null: no filtering). The server enforces it regardless. */
  const reachable = (entries: { id: string; name: string }[]) =>
    reach ? entries.filter((entry) => reach.has(entry.id)) : entries;
  const [level, setLevel] = useState<ScopeLevel>("location");
  const [areaId, setAreaId] = useState<string>(() => reachable(AREAS.location)[0]?.id ?? "");
  /*
   * ADDITIONAL LOCATIONS: optional, empty for somebody with one location. Held
   * as stable location ids; the names are only for display.
   */
  const [additional, setAdditional] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<SuggestionLookup>({ state: "idle" });
  /* A later lookup supersedes an earlier one that is still in flight. */
  const lookupSeq = useRef(0);

  function reset() {
    setEmail("");
    setDisplayName("");
    setRole("employee");
    setLevel("location");
    setAreaId(reachable(AREAS.location)[0]?.id ?? "");
    setAdditional([]);
    setLookup({ state: "idle" });
    lookupSeq.current += 1;
  }

  /** A new primary can never also be an additional location. */
  function choosePrimary(nextLevel: ScopeLevel, nextArea: string) {
    setAdditional((current) =>
      cleanAdditionalLocations(current, { level: nextLevel, primaryAreaId: nextArea || null }),
    );
  }

  /*
   * ASKS WOVEN, SUGGESTS, CHANGES NOTHING. Runs when the administrator leaves
   * the email field, never on every keystroke, and only for something shaped
   * like an address. A failure (not permitted, Woven not connected, offline) is
   * silent: the form is complete without it, and an error banner about an
   * optional convenience would only get in the way of sending an invitation.
   */
  async function lookUpWoven() {
    const wanted = email.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(wanted)) {
      setLookup({ state: "idle" });
      return;
    }
    if ("email" in lookup && lookup.email === wanted) return;

    const seq = ++lookupSeq.current;
    setLookup({ state: "loading", email: wanted });
    try {
      const response = await fetch(
        `/api/admin/employees/woven/invite-suggestion?email=${encodeURIComponent(wanted)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as InviteSuggestion | null;
      if (seq !== lookupSeq.current) return;
      if (!response.ok || !payload || !("status" in payload)) {
        setLookup({ state: "idle" });
        return;
      }
      setLookup({ state: "done", email: wanted, result: payload });
    } catch {
      if (seq === lookupSeq.current) setLookup({ state: "idle" });
    }
  }

  /*
   * APPLYING IS THE ADMINISTRATOR'S ACT. Nothing above fills a field; this does,
   * when asked, and every field stays editable afterwards. A value Woven could
   * not vouch for is absent from the suggestion and left as it was — and where
   * the primary area is missing it is left EMPTY, so the form cannot be sent
   * until somebody chooses one rather than inheriting a default.
   */
  function applySuggestion(result: InviteSuggestion) {
    if (result.status !== "found" || !result.suggestion) return;
    const s = result.suggestion;
    if (s.displayName) setDisplayName(s.displayName);
    if (s.role) setRole(s.role);

    let nextLevel: ScopeLevel = level;
    let nextArea = areaId;
    if (s.scopeLevel) {
      nextLevel = s.scopeLevel;
      nextArea = s.primaryAreaId ?? "";
      setLevel(nextLevel);
      setAreaId(nextArea);
    }
    setAdditional(
      cleanAdditionalLocations(s.additionalAreaIds, { level: nextLevel, primaryAreaId: nextArea || null }),
    );
    if (lookup.state === "done") setLookup({ state: "applied", email: lookup.email, result });
  }

  const needsArea = level !== "global" && !areaId;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || needsArea) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          displayName,
          role,
          scope: {
            level,
            primaryAreaId: level === "global" ? null : areaId,
            alsoCoversAreaIds:
              level === "global"
                ? []
                : cleanAdditionalLocations(additional, { level, primaryAreaId: areaId }),
          },
        }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          (payload as { error?: string } | null)?.error ?? "The invitation could not be sent.",
        );
        setBusy(false);
        return;
      }

      onInvited((payload as { user: DirectoryUser }).user);
      reset();
      onOpenChange(false);
    } catch {
      setError("The invitation could not be sent. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const suggestion = lookup.state === "done" || lookup.state === "applied" ? lookup.result : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Invite someone to Ask Bubbles"
        description="They receive an email with a link to set their own password. No password is created here."
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <Notice tone="attention" title="Could not invite">
              {error}
            </Notice>
          ) : null}

          <FieldGroup label="Work email" htmlFor="invite-email">
            <Input
              id="invite-email"
              type="email"
              required
              autoComplete="off"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                // A different address makes any earlier suggestion stale.
                if (lookup.state !== "idle") {
                  setLookup({ state: "idle" });
                  lookupSeq.current += 1;
                }
              }}
              onBlur={() => void lookUpWoven()}
              disabled={busy}
            />
          </FieldGroup>

          {lookup.state === "loading" ? (
            <p role="status" className="text-xs text-muted-foreground">
              Checking Woven…
            </p>
          ) : null}

          {suggestion?.status === "not_found" ? (
            <p role="status" className="text-xs text-muted-foreground">
              No employee with this email was found in Woven. Fill in the details below.
            </p>
          ) : null}

          {suggestion?.status === "ambiguous" ? (
            <p role="status" className="text-xs text-muted-foreground">
              {suggestion.reason}
            </p>
          ) : null}

          {suggestion?.status === "found" ? (
            <Notice tone="neutral" icon={<ShieldCheck />} title="Found in Woven">
              <p>
                {suggestion.employee.name}
                {suggestion.employee.positionName ? ` — ${suggestion.employee.positionName}` : ""}
                {suggestion.employee.primaryLocationName
                  ? `, ${suggestion.employee.primaryLocationName}`
                  : ""}
              </p>
              {suggestion.suggestion ? (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs">
                  {suggestion.suggestion.role ? (
                    <li>Role: {ROLE_LABEL[suggestion.suggestion.role]}</li>
                  ) : null}
                  {suggestion.suggestion.scopeLevel ? (
                    <li>Scope: {SCOPE_LEVEL_LABEL[suggestion.suggestion.scopeLevel]}</li>
                  ) : null}
                  {suggestion.suggestion.primaryAreaId ? (
                    <li>Primary area: {areaLabel(suggestion.suggestion.primaryAreaId)}</li>
                  ) : null}
                  {suggestion.suggestion.additionalAreaIds.length > 0 ? (
                    <li>
                      Additional locations:{" "}
                      {suggestion.suggestion.additionalAreaIds.map((id) => areaLabel(id)).join(", ")}
                    </li>
                  ) : null}
                </ul>
              ) : null}
              {suggestion.notes.length > 0 ? (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                  {suggestion.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
              {suggestion.suggestion ? (
                <div className="mt-2.5 flex items-center gap-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy || lookup.state === "applied"}
                    onClick={() => applySuggestion(suggestion)}
                  >
                    {lookup.state === "applied" ? "Applied" : "Apply suggestions"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {lookup.state === "applied"
                      ? "Review each field before sending."
                      : "Nothing changes until you apply. You can edit everything after."}
                  </span>
                </div>
              ) : null}
            </Notice>
          ) : null}

          <FieldGroup label="Full name" htmlFor="invite-name">
            <Input
              id="invite-name"
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={busy}
            />
          </FieldGroup>

          <FieldGroup label="Role" htmlFor="invite-role">
            <Select
              id="invite-role"
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
              disabled={busy}
            >
              {ROLES.map((entry) => (
                <option key={entry} value={entry}>
                  {ROLE_LABEL[entry]}
                </option>
              ))}
            </Select>
          </FieldGroup>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {ROLE_DESCRIPTION[role]}
          </p>

          <FieldGroup label="Scope" htmlFor="invite-scope">
            <Select
              id="invite-scope"
              value={level}
              onChange={(event) => {
                const next = event.target.value as ScopeLevel;
                setLevel(next);
                const nextArea = next !== "global" ? (reachable(AREAS[next])[0]?.id ?? "") : "";
                setAreaId(nextArea);
                choosePrimary(next, nextArea);
              }}
              disabled={busy}
            >
              <option value="location">One location</option>
              <option value="district">A district</option>
              <option value="region">A region</option>
              {/* Only somebody with access to everything can give it. */}
              {reach === null ? <option value="global">Everything</option> : null}
            </Select>
          </FieldGroup>

          {level !== "global" ? (
            <FieldGroup label="Primary area" htmlFor="invite-area">
              <Select
                id="invite-area"
                value={areaId}
                onChange={(event) => {
                  setAreaId(event.target.value);
                  choosePrimary(level, event.target.value);
                }}
                disabled={busy}
              >
                {areaId === "" ? (
                  <option value="" disabled>
                    Choose a primary area…
                  </option>
                ) : null}
                {reachable(AREAS[level]).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </Select>
            </FieldGroup>
          ) : null}

          {/*
            Directly under Primary area. Hidden for a global scope, which already
            covers every location and cannot be widened.
          */}
          {level !== "global" ? (
            <FieldGroup
              label="Additional locations (optional)"
              htmlFor="invite-additional"
              hint="Locations this person can access in addition to their primary area. Leave empty if they have just one."
            >
              <MultiSelect
                id="invite-additional"
                options={reachable(additionalLocationOptions(level === "location" ? areaId : null))}
                value={additional}
                onChange={setAdditional}
                disabled={busy}
              />
            </FieldGroup>
          ) : null}

          <DialogActions>
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy || !email || !displayName || needsArea}>
              {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
              {busy ? "Sending…" : "Send invitation"}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------------------------------- edit locations -- */

/**
 * Edits ONE thing: the additional locations of an existing account.
 *
 * The primary area, scope and role are shown and cannot be changed here, so
 * opening this and pressing Save cannot move somebody's primary assignment.
 * Saving sends the account's current level and primary back unchanged with the
 * new list; the server validates it like any other write (known locations, and
 * an administrator may add only locations they can access themselves).
 */
function EditLocationsDialog({
  user,
  onClose,
  onSave,
  error,
}: {
  user: DirectoryUser | null;
  onClose: () => void;
  onSave: (user: DirectoryUser, alsoCoversAreaIds: string[]) => Promise<boolean>;
  error: string | null;
}) {
  return (
    <Dialog open={user !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      {user ? (
        <DialogContent title="Edit locations" description={`${user.displayName} — ${user.email}`}>
          <EditLocationsForm key={user.id} user={user} onClose={onClose} onSave={onSave} error={error} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function EditLocationsForm({
  user,
  onClose,
  onSave,
  error,
}: {
  user: DirectoryUser;
  onClose: () => void;
  onSave: (user: DirectoryUser, alsoCoversAreaIds: string[]) => Promise<boolean>;
  error: string | null;
}) {
  const { user: me } = useSession();
  const reach = reachableLocationIds(me?.scope);
  const initial = user.scope.alsoCoversAreaIds;
  const [selected, setSelected] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);

  /*
   * What is offered: the locations, minus the primary. Anything the account
   * ALREADY holds that is not a location (a district or region added before)
   * stays selectable by name so it displays and survives a save — opening this
   * dialog never silently drops it.
   */
  const options = useMemo(() => {
    const primary = user.scope.level === "location" ? user.scope.primaryAreaId : null;
    const held = initial.filter((id) => !id.startsWith("loc-")).map((id) => ({ id, name: areaLabel(id) }));
    /* Offer only locations the administrator can grant; what the person already holds stays visible and removable. */
    const offered = additionalLocationOptions(primary).filter((o) => !reach || reach.has(o.id) || initial.includes(o.id));
    return [...offered, ...held];
  }, [user, initial, reach]);

  const cleaned = cleanAdditionalLocations(selected, {
    level: user.scope.level,
    primaryAreaId: user.scope.primaryAreaId,
  });
  const changed = cleaned.length !== initial.length || cleaned.some((id) => !initial.includes(id));

  return (
    <div className="space-y-4">
      {error ? (
        <Notice tone="attention" title="That did not work">
          {error}
        </Notice>
      ) : null}

      <p className="text-[13px] text-muted-foreground">
        Primary area: <span className="font-medium text-foreground">{areaName(user.scope)}</span>
        <span className="ml-1 capitalize">({user.scope.level})</span>
      </p>

      <FieldGroup
        label="Additional locations"
        htmlFor="edit-additional"
        hint="Locations this person can access in addition to their primary area. Removing one takes effect on their next request."
      >
        <MultiSelect id="edit-additional" options={options} value={selected} onChange={setSelected} disabled={busy} />
      </FieldGroup>

      <DialogActions>
        <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={busy || !changed}
          onClick={async () => {
            setBusy(true);
            const saved = await onSave(user, cleaned);
            setBusy(false);
            if (saved) onClose();
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : <MapPin />}
          {busy ? "Saving…" : "Save locations"}
        </Button>
      </DialogActions>
    </div>
  );
}

/* ------------------------------------------------- Woven employee account -- */

interface WovenLocationView {
  wovenLocationId: string;
  name: string | null;
  areaId: string | null;
  expiresOn?: string | null;
}
interface WovenEmployeeOption {
  externalEmployeeId: string;
  name: string;
  email: string | null;
  status: string | null;
  position: string | null;
  primaryLocation: string | null;
  suggestedRole: Role | null;
  account: "none" | "linked" | "unlinked";
  locations: {
    primary: WovenLocationView | null;
    additional: WovenLocationView[];
    temporary: WovenLocationView[];
    hasAllLocationAccess: boolean;
    suggestion: { level: "global" | "location" | "none"; primaryAreaId: string | null; alsoCoversAreaIds: string[] };
  } | null;
}

type WovenAccess = "one" | "several" | "all";

/**
 * Creates ONE login for a synced Woven employee that the administrator picked.
 * Name and email come from Woven; the role and access are the administrator's
 * choice, and Woven's location assignments are shown and only SUGGESTED. NO
 * email, invitation or code is sent and no password is set: the account is
 * created DISABLED, and to let the person in the administrator enables it and
 * generates a reset link. The server re-checks every role and scope.
 */
function WovenAccountDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (note: string) => void;
}) {
  const { user: me } = useSession();
  const [employees, setEmployees] = useState<WovenEmployeeOption[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [access, setAccess] = useState<WovenAccess>("one");
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [confirmAdmin, setConfirmAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* What this administrator may offer. Convenience only: the server decides. */
  const aboveAdmin = me?.role === "owner" || me?.role === "developer";
  const assignableRoles = ROLES.filter((r) => aboveAdmin || (r !== "owner" && r !== "developer"));
  const canGrantAll = me?.scope?.level === "global";
  const isAdminRole = (ADMIN_CONSOLE_ROLES as readonly string[]).includes(role);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/admin/employees/woven/accounts", { cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) {
          setError((payload as { error?: string; reason?: string } | null)?.error ?? "The synced employees could not be loaded.");
          return;
        }
        setEmployees((payload as { employees: WovenEmployeeOption[] }).employees);
      })
      .catch(() => !cancelled && setError("The synced employees could not be loaded."));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (employees ?? []).filter(
      (e) => !needle || e.name.toLowerCase().includes(needle) || (e.email ?? "").toLowerCase().includes(needle),
    );
  }, [employees, query]);
  const employee = (employees ?? []).find((e) => e.externalEmployeeId === selected) ?? null;

  function choose(id: string) {
    setSelected(id);
    const e = (employees ?? []).find((x) => x.externalEmployeeId === id);
    /* Preselect only what is confidently matched; "all locations" in Woven is shown, never preselected as a grant. */
    setRole(e?.suggestedRole && assignableRoles.includes(e.suggestedRole) && !(ADMIN_CONSOLE_ROLES as readonly string[]).includes(e.suggestedRole) ? e.suggestedRole : "employee");
    const s = e?.locations?.suggestion;
    const ids = s?.level === "location" && s.primaryAreaId ? [s.primaryAreaId, ...s.alsoCoversAreaIds] : [];
    setAreaIds(ids);
    setAccess(ids.length > 1 ? "several" : "one");
    setConfirmAdmin(false);
    setError(null);
  }

  /* One Location holds exactly one location; Several keeps every selected one. */
  function changeAccess(next: WovenAccess) {
    setAccess(next);
    if (next === "one") setAreaIds((current) => current.slice(0, 1));
  }

  function toggleArea(id: string) {
    setAreaIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  const scope =
    access === "all"
      ? { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] as string[] }
      : { level: "location", primaryAreaId: areaIds[0] ?? null, alsoCoversAreaIds: areaIds.slice(1) };
  const scopeReady = access === "all" ? canGrantAll : access === "one" ? areaIds.length === 1 : areaIds.length >= 2;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !employee || !scopeReady) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/employees/woven/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ externalEmployeeId: employee.externalEmployeeId, role, scope, confirmAdmin: isAdminRole && confirmAdmin }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError((payload as { error?: string } | null)?.error ?? "The account could not be created.");
        return;
      }
      const result = payload as { outcome: "created" | "repaired"; linked: boolean };
      onDone(
        result.outcome === "repaired"
          ? `${employee.name}'s existing account was linked to Woven. Nothing was created or sent.`
          : result.linked
            ? `Account created for ${employee.name}, disabled, and nothing was sent. To let them sign in: enable the account, then Generate reset link and send it privately.`
            : `Account created for ${employee.name}, but the Woven link was not saved. Choose them here again to repair the link — no second account is made.`,
      );
      setSelected("");
      setEmployees(null);
      onOpenChange(false);
    } catch {
      setError("The account could not be created. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const blocked = employee?.account === "linked";
  const loc = employee?.locations ?? null;
  const permanent = loc ? [loc.primary, ...loc.additional].filter((l): l is WovenLocationView => l !== null) : [];
  const unmatchedCount = permanent.filter((l) => !l.areaId).length;
  const matchedCount = new Set(permanent.filter((l) => l.areaId).map((l) => l.areaId)).size;
  const showLoc = (l: WovenLocationView) => `${l.name ?? "Unnamed"} — ${l.areaId ? `matches ${areaName({ level: "location", primaryAreaId: l.areaId, alsoCoversAreaIds: [] })}` : "not matched to an Ask Bubbles location"}${l.expiresOn ? ` (expires ${l.expiresOn})` : ""}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Create an account for a Woven employee"
        description="No invitation, email or code is sent, and no password is set. The account starts disabled until you enable it and generate a reset link."
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <Notice tone="attention" title="Could not continue">
              {error}
            </Notice>
          ) : null}

          <FieldGroup label="Find an employee" htmlFor="woven-search">
            <Input id="woven-search" type="search" placeholder="Name or email" value={query} onChange={(e) => setQuery(e.target.value)} disabled={busy} />
          </FieldGroup>
          <FieldGroup label={`Synced employee${employees ? ` (${shown.length} of ${employees.length})` : ""}`} htmlFor="woven-employee">
            <Select id="woven-employee" value={selected} onChange={(e) => choose(e.target.value)} disabled={busy || !employees}>
              <option value="">{employees ? "Choose an employee…" : "Loading…"}</option>
              {shown.map((e) => (
                <option key={e.externalEmployeeId} value={e.externalEmployeeId}>
                  {e.name} — {e.position ?? "no position"}, {e.primaryLocation ?? "no location"}
                  {e.account === "linked" ? " (has account)" : e.account === "unlinked" ? " (account exists, not linked)" : ""}
                </option>
              ))}
            </Select>
          </FieldGroup>

          {employee ? (
            <>
              <p className="text-sm text-muted-foreground">
                {employee.name} · {employee.email ?? "no email in Woven"} · Woven status: {employee.status}
              </p>
              {employee.account === "unlinked" ? (
                <Notice tone="attention" title="An account with this email already exists">
                  Continuing links it to this Woven employee. No second account is created and its access is not changed.
                </Notice>
              ) : null}
              {blocked ? (
                <Notice tone="attention" title="Already has an account">
                  This employee is already linked to an Ask Bubbles account.
                </Notice>
              ) : null}

              <div className="space-y-1 rounded-md border border-border p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Woven location assignments (kept as they are)</p>
                <p>Primary: {loc?.primary ? showLoc(loc.primary) : "none"}</p>
                {loc?.hasAllLocationAccess ? <p>Woven marks this person as having access to all locations (a suggestion only).</p> : null}
                {(loc?.additional ?? []).map((l) => (
                  <p key={`a-${l.wovenLocationId}`}>Additional: {showLoc(l)}</p>
                ))}
                {(loc?.temporary ?? []).map((l) => (
                  <p key={`t-${l.wovenLocationId}`}>Temporary: {showLoc(l)} — not granted unless you select it below</p>
                ))}
                {unmatchedCount > 0 ? (
                  <p className="text-foreground">
                    {unmatchedCount} Woven location{unmatchedCount === 1 ? " is" : "s are"} not matched to an Ask Bubbles location, so
                    {unmatchedCount === 1 ? " it is" : " they are"} not included. They stay recorded in Woven; map them or choose a location below.
                  </p>
                ) : null}
                {access === "one" && matchedCount > 1 ? (
                  <p className="text-foreground">Woven lists {matchedCount} matched locations. One Location gives access to only one of them; choose Several Locations to keep them all.</p>
                ) : null}
              </div>

              <FieldGroup label="Role" htmlFor="woven-role">
                <Select id="woven-role" value={role} onChange={(e) => { setRole(e.target.value as Role); setConfirmAdmin(false); }} disabled={busy}>
                  {assignableRoles.map((entry) => (
                    <option key={entry} value={entry}>
                      {ROLE_LABEL[entry]}
                    </option>
                  ))}
                </Select>
              </FieldGroup>
              <p className="text-xs leading-relaxed text-muted-foreground">{ROLE_DESCRIPTION[role]}</p>
              {isAdminRole ? (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={confirmAdmin} onChange={(e) => setConfirmAdmin(e.target.checked)} disabled={busy} className="mt-1" />
                  <span>I am deliberately giving this person administrator access. Woven does not decide this.</span>
                </label>
              ) : null}

              <FieldGroup label="Location access (separate from role)" htmlFor="woven-access">
                <Select id="woven-access" value={access} onChange={(e) => changeAccess(e.target.value as WovenAccess)} disabled={busy}>
                  <option value="one">One location</option>
                  <option value="several">Several locations</option>
                  {canGrantAll ? <option value="all">All locations</option> : null}
                </Select>
              </FieldGroup>
              {access === "all" ? (
                <p className="text-xs text-muted-foreground">
                  All locations is visibility only. It does not give administrator permissions; the role above does that.
                  {loc?.suggestion.level === "global" ? " Woven suggests this." : ""}
                </p>
              ) : (
                <fieldset className="space-y-1">
                  <legend className="text-xs text-muted-foreground">
                    {access === "one" ? "Choose one location" : "Choose two or more locations"}
                    {loc?.suggestion.level === "location" ? " (matched locations are preselected)" : ""}
                  </legend>
                  {AREAS.location.map((entry) => (
                    <label key={entry.id} className="flex items-center gap-2 text-sm">
                      <input
                        type={access === "one" ? "radio" : "checkbox"}
                        name="woven-area"
                        checked={areaIds.includes(entry.id)}
                        onChange={() => (access === "one" ? setAreaIds([entry.id]) : toggleArea(entry.id))}
                        disabled={busy}
                      />
                      {entry.name}
                    </label>
                  ))}
                </fieldset>
              )}
            </>
          ) : null}

          <DialogActions>
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy || !employee || !scopeReady || blocked || (isAdminRole && !confirmAdmin)}>
              {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
              {busy ? "Creating…" : employee?.account === "unlinked" ? "Link account" : "Create account"}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
