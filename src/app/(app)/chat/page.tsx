import { Suspense } from "react";
import type { Metadata } from "next";

import { PermissionGate } from "@/components/permission-gate";
import { ChatScreen } from "@/features/chat/chat-screen";
import { requirePagePermission } from "@/lib/auth/page";
import { ACTIVE_BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: ACTIVE_BRAND.productName,
};

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  await requirePagePermission("ask_questions");

  return (
    <PermissionGate permission="ask_questions">
      <Suspense fallback={null}>
        <ChatScreen />
      </Suspense>
    </PermissionGate>
  );
}
