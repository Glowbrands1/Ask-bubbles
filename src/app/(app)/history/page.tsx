import type { Metadata } from "next";

import { PermissionGate } from "@/components/permission-gate";
import { HistoryScreen } from "@/features/chat/history-screen";
import { requirePagePermission } from "@/lib/auth/page";

export const metadata: Metadata = {
  title: "History",
};

export const dynamic = "force-dynamic";

/**
 * CONVERSATION HISTORY — the person's own conversations, newest first.
 *
 * The same server-side history the chat rail shows (`chat_conversations`,
 * owner-only), given a page of its own so it can be found from the
 * navigation. Opening one continues it in the chat.
 */
export default async function HistoryPage() {
  await requirePagePermission("ask_questions");

  return (
    <PermissionGate permission="ask_questions">
      <HistoryScreen />
    </PermissionGate>
  );
}
