"use client";

import { CORRECTIVE_ACTION_INTAKE } from "@/lib/forms/corrective-action-intake";
import { fieldChecklistEnabled } from "@/lib/config/chat-ui-flags";
import { missingRequiredFields } from "@/lib/ai/required-fields";
import type { ChatFormProposal, ChatMessage } from "@/types";

/**
 * Filled and missing intake lines for a corrective-action card.
 * Renders nothing unless NEXT_PUBLIC_FIELD_CHECKLIST_ENABLED is on.
 * A typed employee name is filled, including a name Woven does not have.
 */
export function FieldChecklist({
  proposal,
  notes,
}: {
  proposal: ChatFormProposal;
  notes: string;
}) {
  if (!fieldChecklistEnabled()) return null;
  if (!/corrective|dpoa/i.test(`${proposal.templateKey} ${proposal.templateName}`)) return null;
  const missing = new Set(missingRequiredFields(proposal, notes).map((item) => item.key));
  const items = CORRECTIVE_ACTION_INTAKE.filter((item) => !item.optional);
  return (
    <ul className="mt-3 space-y-1 rounded-[var(--radius-sm)] border border-border bg-surface-muted px-3 py-2 text-xs" data-chat-ui="checklist" aria-label="Form fields">
      {items.map((item) => {
        const filled = !missing.has(item.key);
        return (
          <li key={item.key} className="flex gap-2">
            <span aria-hidden>{filled ? "✓" : "–"}</span>
            <span>
              {filled ? "Filled" : "Missing"}: {item.prompt}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function notesForChecklist(conversation: readonly ChatMessage[] | undefined): string {
  return (conversation ?? [])
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.content)
    .join("\n");
}
