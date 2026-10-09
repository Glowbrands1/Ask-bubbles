"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";

import { EmptyState, Notice } from "@/components/ui/feedback";
import { PageHeader, PageShell } from "@/components/ui/layout";
import { ACTIVE_BRAND } from "@/lib/brand";
import { useAppStore } from "@/lib/store/app-store";

import { ConversationList } from "./conversation-list";

/**
 * The History page. Reads and mutates the same conversation store the chat
 * screen uses, so a conversation deleted here is gone from the chat rail too,
 * and opening one hands it to `/chat?c=<id>`, which adopts the existing thread
 * rather than replaying it.
 */
export function HistoryScreen() {
  const router = useRouter();
  const { conversations, ready, removeConversation, clearConversations, conversationSyncFailed, accountHistory } =
    useAppStore();
  const [error, setError] = useState<string | null>(null);

  const open = (id: string) => router.push(`/chat?c=${encodeURIComponent(id)}`);

  return (
    <PageShell>
      <PageHeader
        band
        eyebrow="Assistant"
        title="History"
        description={`Your conversations with ${ACTIVE_BRAND.assistantName}. Only you can see them.`}
      />

      {conversationSyncFailed ? (
        <Notice tone="attention" className="mb-4">
          Your saved conversations could not be loaded just now. What is shown may be incomplete.
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="attention" className="mb-4">
          {error}
        </Notice>
      ) : null}

      {ready && conversations.length === 0 ? (
        <EmptyState
          icon={<History />}
          title="No conversations yet"
          description={`Ask ${ACTIVE_BRAND.assistantName} a question and it will appear here.`}
        />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-soft">
          <ConversationList
            conversations={conversations}
            activeId={null}
            onSelect={open}
            onNew={() => router.push("/chat")}
            onDelete={async (id) => {
              setError(null);
              try {
                await removeConversation(id);
              } catch (cause) {
                setError(
                  cause instanceof Error && cause.message
                    ? cause.message
                    : "That conversation could not be deleted just now. Nothing was removed.",
                );
              }
            }}
            onClearAll={async () => {
              setError(null);
              await clearConversations();
            }}
            showHeading={false}
            accountHistory={accountHistory}
          />
        </div>
      )}
    </PageShell>
  );
}
