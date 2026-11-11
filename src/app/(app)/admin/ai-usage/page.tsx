import type { Metadata } from "next";

import { PermissionGate } from "@/components/permission-gate";
import { AIUsageScreen } from "@/features/admin/ai-usage-screen";
import { requirePagePermission } from "@/lib/auth/page";
import { isDemoMode } from "@/lib/config/runtime";
import { AIUsageDemoScreen } from "@/features/admin/ai-usage-demo";

export const metadata: Metadata = {
  title: "AI Usage",
};

export const dynamic = "force-dynamic";

export default async function AIUsagePage() {
  await requirePagePermission("view_ai_usage");

  return (
    <PermissionGate permission="view_ai_usage" adminOnly>
      {/* DEMO BUILD ONLY: invented spend; live has no usage source and says so. */}
      {isDemoMode() ? <AIUsageDemoScreen /> : <AIUsageScreen />}
    </PermissionGate>
  );
}
