"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareReply } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/field";
import { Dialog, DialogActions, DialogClose, DialogContent } from "@/components/ui/overlays";
import { replyReason, type ReplyView } from "@/lib/google-reviews/reply-view";

/**
 * THE REPLY CONTROLS FOR ONE REVIEW — the clicks only. Every rule (who may reply, which salon, the
 * confirmation, duplicate and overwrite protection) is enforced by the server route, so none of these
 * buttons is the only lock.
 *
 *   Save draft     PUT. Stores the text in Ask Bubbles. Sends nothing to Google.
 *   Publish…       Opens a confirmation showing the exact text, the salon and that it will be PUBLIC.
 *                  Only "Publish reply" inside it sends the request; it names the draft version shown,
 *                  and for a review that already has an owner reply it also needs a second, explicit
 *                  "replace the existing reply" tick. A ref blocks a double submit.
 *   Discard draft  DELETE.
 *
 * Nothing here writes the reply for the person: the text is only ever what they typed.
 */

const MAX_BYTES = 4096;
const bytes = (text: string) => new TextEncoder().encode(text).length;

type Message = { tone: "accent" | "attention"; text: string };

export function ReplyControls({
  reviewId,
  salon,
  existingReply,
  open,
  publishingEnabled,
}: {
  reviewId: string;
  salon: string;
  existingReply: string | null;
  open: ReplyView | null;
  publishingEnabled: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(open?.body ?? existingReply ?? "");
  const [busy, setBusy] = useState<null | "save" | "discard" | "publish">(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [replaceTick, setReplaceTick] = useState(false);
  const inFlight = useRef(false);

  const path = `/api/google-reviews/reviews/${reviewId}/reply`;
  const saved = open?.body ?? null;
  const dirty = saved === null ? text.trim() !== (existingReply ?? "").trim() && text.trim().length > 0 : text.trim() !== saved.trim();
  const tooLong = bytes(text) > MAX_BYTES;
  const replacing = existingReply !== null;
  const publishing = open?.status === "publishing";

  async function send(method: "PUT" | "DELETE" | "POST", payload: unknown, kind: "save" | "discard" | "publish") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(kind);
    setMessage(null);
    try {
      const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: payload === undefined ? undefined : JSON.stringify(payload) });
      const json = (await response.json().catch(() => ({}))) as { status?: string; code?: string; reason?: string | null; alreadyOnGoogle?: boolean; reply?: { body?: string } | null };
      if (response.ok && json.status === "ok") {
        setConfirming(false);
        setReplaceTick(false);
        if (kind === "save") setMessage({ tone: "accent", text: "Draft saved. It has not been sent to Google." });
        if (kind === "discard") {
          setEditing(false);
          setText(existingReply ?? "");
          setMessage({ tone: "accent", text: "Draft discarded." });
        }
        if (kind === "publish") {
          setEditing(false);
          setMessage({ tone: "accent", text: json.alreadyOnGoogle ? "Google already had this reply; it is now recorded here. Nothing was sent twice." : "Reply published to Google." });
        }
      } else {
        setConfirming(false);
        setMessage({ tone: "attention", text: json.reason ?? replyReason(json.code) });
      }
      router.refresh();
    } catch {
      setConfirming(false);
      setMessage({ tone: "attention", text: "The request could not be completed. Check the connection and try again." });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  const canPublish = open !== null && !dirty && !open.stale && !publishing && publishingEnabled && !tooLong && text.trim().length > 0;
  const whyNot = !open
    ? "Save a draft first."
    : dirty
      ? "Save your changes first."
      : open.stale
        ? "The reply on Google changed since this draft was started. Discard it and start again."
        : publishing
          ? "A publish is already in progress."
          : !publishingEnabled
            ? "Publishing to Google is not switched on yet."
            : null;

  return (
    <div className="mt-2 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        {!editing ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)} aria-label={`${open ? "Open reply draft" : replacing ? "Edit reply" : "Reply"} for ${salon}`}>
            <MessageSquareReply aria-hidden />
            {open ? "Open draft" : replacing ? "Edit reply" : "Reply"}
          </Button>
        ) : null}
        {open?.status === "draft" ? <Badge tone="attention">Draft{open.kind === "edit" ? " · edit" : ""}</Badge> : null}
        {open?.status === "publishing" ? <Badge tone="neutral">Publishing…</Badge> : null}
        {open?.status === "failed" ? <Badge tone="attention">Failed</Badge> : null}
        {open?.stale ? <Badge tone="neutral">Reply changed on Google</Badge> : null}
      </div>

      {open?.status === "failed" && !editing ? <p className="mt-1.5 text-muted-foreground">{replyReason(open.lastErrorCode)}</p> : null}

      {editing ? (
        <div className="mt-2 max-w-2xl space-y-2">
          <label className="block">
            <span className="sr-only">{replacing ? "New owner reply" : "Owner reply"} for {salon}</span>
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              disabled={busy !== null || publishing}
              rows={4}
              aria-invalid={tooLong}
              placeholder="Write your reply. It is only sent to Google after you confirm."
            />
          </label>
          <p className={tooLong ? "font-bold text-status-attention" : "text-muted-foreground"}>
            {bytes(text).toLocaleString()} / {MAX_BYTES.toLocaleString()} bytes
            {replacing ? " · this will replace the current owner reply" : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={busy !== null || publishing || !dirty || tooLong || text.trim().length === 0} onClick={() => send("PUT", { body: text, version: open?.version }, "save")}>
              {busy === "save" ? "Saving…" : "Save draft"}
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy !== null || !canPublish} onClick={() => setConfirming(true)}>
              Publish to Google…
            </Button>
            {open && !publishing ? (
              <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => send("DELETE", undefined, "discard")}>
                Discard draft
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => setEditing(false)}>
              Close
            </Button>
          </div>
          {whyNot && !canPublish ? <p className="text-muted-foreground">{whyNot}</p> : null}
        </div>
      ) : null}

      <div aria-live="polite">{message ? <Notice tone={message.tone} className="mt-2 max-w-2xl">{message.text}</Notice> : null}</div>

      <Dialog open={confirming} onOpenChange={(next) => (busy === null ? setConfirming(next) : undefined)}>
        <DialogContent title={replacing ? "Replace the owner reply on Google?" : "Publish this reply to Google?"} description={`Salon: ${salon}`}>
          <div className="space-y-3 px-6 pt-4 text-[13px]">
            <p className="font-semibold text-foreground">This will be posted publicly on Google as the owner&apos;s reply, exactly as written below.</p>
            <blockquote className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] border border-border bg-surface-muted p-3 text-foreground">{open?.body ?? text}</blockquote>
            {replacing ? (
              <>
                <p className="text-muted-foreground">The reply currently on Google:</p>
                <blockquote className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] border border-border-hairline p-3 text-muted-foreground">{existingReply}</blockquote>
                <label className="flex items-start gap-2 font-semibold text-foreground">
                  <input type="checkbox" className="mt-0.5" checked={replaceTick} onChange={(event) => setReplaceTick(event.target.checked)} />
                  <span>I understand this replaces the existing public reply.</span>
                </label>
              </>
            ) : null}
          </div>
          <DialogActions className="px-6 pb-4">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={busy !== null}>Cancel</Button>
            </DialogClose>
            <Button
              type="button"
              disabled={busy !== null || !open || (replacing && !replaceTick)}
              onClick={() => open && send("POST", { version: open.version, confirmPublish: true, ...(replacing ? { confirmReplace: true } : {}) }, "publish")}
            >
              {busy === "publish" ? "Publishing…" : "Publish reply"}
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </div>
  );
}
