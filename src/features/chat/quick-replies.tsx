"use client";

import { quickRepliesEnabled } from "@/lib/config/chat-ui-flags";
import type { ChatFormProposal } from "@/types";

/**
 * The two answers a corrective-action card is often waiting on.
 * The wording is what the intake readers already accept.
 * Renders nothing unless NEXT_PUBLIC_QUICK_REPLIES_ENABLED is on.
 */
export function quickReplyLabels(proposal: ChatFormProposal | undefined): string[] {
  if (!proposal) return [];
  if (!/corrective|dpoa/i.test(`${proposal.templateKey} ${proposal.templateName}`)) return [];
  const labels: string[] = [];
  if (!proposal.warningLevel) {
    labels.push("Verbal warning", "Written warning");
  }
  if (proposal.payrollDeduct !== "yes" && proposal.payrollDeduct !== "no") {
    labels.push("Payroll deduct: yes", "Payroll deduct: no");
  }
  return labels;
}

export function QuickReplies({
  proposal,
  onSuggestion,
}: {
  proposal: ChatFormProposal | undefined;
  onSuggestion: (value: string) => void;
}) {
  if (!quickRepliesEnabled()) return null;
  const labels = quickReplyLabels(proposal);
  if (labels.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2" data-chat-ui="quick-replies">
      {labels.map((label) => (
        <button
          key={label}
          type="button"
          onClick={() => onSuggestion(label)}
          className="rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-foreground hover:border-primary"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
