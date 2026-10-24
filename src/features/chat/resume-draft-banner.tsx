"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { resumeDraftEnabled } from "@/lib/config/chat-ui-flags";

interface ResumeDraft {
  employeeName: string | null;
  store: string | null;
  warningLevel: string | null;
}

/**
 * Offers to continue a form this conversation already started.
 * Renders nothing unless NEXT_PUBLIC_RESUME_DRAFT_ENABLED is on,
 * and nothing when the server has no saved draft.
 */
export function ResumeDraftBanner({
  conversationId,
  onContinue,
  initialDraft = null,
}: {
  conversationId: string;
  onContinue: (text: string) => void;
  /** Skips the fetch. The chat screen does not pass it. */
  initialDraft?: ResumeDraft | null;
}) {
  const [draft, setDraft] = React.useState<ResumeDraft | null>(initialDraft);
  React.useEffect(() => {
    if (!resumeDraftEnabled() || initialDraft) return;
    let cancelled = false;
    void fetch(`/api/chat/resume-draft?conversationId=${encodeURIComponent(conversationId)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { draft?: ResumeDraft | null } | null) => {
        if (cancelled) return;
        setDraft(payload?.draft ?? null);
      })
      .catch(() => {
        if (!cancelled) setDraft(null);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, initialDraft]);

  if (!resumeDraftEnabled() || !draft) return null;
  const who = draft.employeeName?.trim() || "this employee";
  const where = draft.store?.trim() ? ` at ${draft.store.trim()}` : "";
  return (
    <div
      className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border bg-surface px-3.5 py-2.5"
      data-chat-ui="resume-draft"
    >
      <p className="text-[12.5px] text-foreground">
        Resume the draft for {who}
        {where}.
      </p>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onContinue(`Continue the corrective action for ${who}.`)}
      >
        Continue this draft
      </Button>
    </div>
  );
}
