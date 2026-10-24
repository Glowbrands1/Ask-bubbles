"use client";

import { MessageBubble } from "@/features/chat/message-bubble";
import { ResumeDraftBanner } from "@/features/chat/resume-draft-banner";
import {
  chatA11yEnabled,
  chatStreamingEnabled,
  citationChipsEnabled,
  fieldChecklistEnabled,
  inlineCardEditEnabled,
  quickRepliesEnabled,
  resumeDraftEnabled,
} from "@/lib/config/chat-ui-flags";
import type { ChatMessage } from "@/types";

const message: ChatMessage = {
  id: "preview-1",
  role: "assistant",
  content: "Here is the corrective action for Test Employee. Standards of Conduct applies.",
  createdAt: "2026-10-24T15:00:00Z",
  mode: "standard",
  coverage: "grounded",
  formProposal: {
    proposalId: "preview-proposal",
    templateKey: "dpoa",
    templateName: "Corrective Action",
    supportsInlineDraft: false,
    variantKey: null,
    employeeName: "Test Employee",
    employeeRole: null,
    locationId: null,
    locationName: null,
    locationResolution: "needs_selection",
    authorizedLocationIds: [],
    status: "needs_employee",
    sourceMessageIds: [],
    employeeVerification: { status: "unverified", title: null, reason: "not_found" },
  },
  citations: [
    {
      documentId: "doc-current",
      documentTitle: "JBA Policy Manual",
      locator: "Standards of Conduct, page 12",
      category: "policies_compliance",
      excerpt: "Employees follow the standards of conduct.",
      relevance: 1,
    },
  ],
};

/** The flagged controls, on the chat canvas, for a screenshot. */
export function ChatUiPreview() {
  const on = [
    chatStreamingEnabled() ? "NEXT_PUBLIC_CHAT_STREAMING_ENABLED" : null,
    fieldChecklistEnabled() ? "NEXT_PUBLIC_FIELD_CHECKLIST_ENABLED" : null,
    inlineCardEditEnabled() ? "NEXT_PUBLIC_INLINE_CARD_EDIT_ENABLED" : null,
    citationChipsEnabled() ? "NEXT_PUBLIC_CITATION_CHIPS_ENABLED" : null,
    quickRepliesEnabled() ? "NEXT_PUBLIC_QUICK_REPLIES_ENABLED" : null,
    resumeDraftEnabled() ? "NEXT_PUBLIC_RESUME_DRAFT_ENABLED" : null,
    chatA11yEnabled() ? "NEXT_PUBLIC_CHAT_A11Y_ENABLED" : null,
  ].filter((name): name is string => Boolean(name));
  return (
    <main id="main" className="min-h-screen bg-chat-canvas">
      <div aria-hidden className="chat-pattern" />
      <div className="relative mx-auto max-w-3xl px-6 py-8">
        <p className="mb-4 text-sm text-foreground">
          {on.length === 0 ? "UI flags off" : `UI flags on: ${on.join(", ")}`}
        </p>
        <ResumeDraftBanner
          conversationId="preview"
          onContinue={() => {}}
          initialDraft={{ employeeName: "Test Employee", store: "Omaha, NE (West Dodge Rd)", warningLevel: null }}
        />
        <MessageBubble message={message} onSuggestion={() => {}} />
      </div>
    </main>
  );
}
