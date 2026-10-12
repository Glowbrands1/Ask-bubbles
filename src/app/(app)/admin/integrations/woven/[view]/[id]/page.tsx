import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PermissionGate } from "@/components/permission-gate";
import { WovenEmployeeScreen } from "@/features/admin/woven/employee-detail";
import { loadWovenEmployee } from "@/features/admin/woven/load";
import { requirePagePermission } from "@/lib/auth/page";

export const metadata: Metadata = {
  title: "Employee · Woven Employee Sync",
};

export const dynamic = "force-dynamic";

/**
 * ONE EMPLOYEE, at /admin/integrations/woven/directory/{id}.
 *
 * Names and emails, so the same guards as the Directory tab: Manage
 * integrations AND Manage users, on the SERVER, before anything is read.
 * `PermissionGate` is the second line, for demo mode. Only the directory has
 * per-row pages; any other tab with an id is a 404.
 */
export default async function WovenEmployeePage({ params }: { params: Promise<{ view: string; id: string }> }) {
  await requirePagePermission("manage_integrations");
  const { view, id } = await params;
  if (view !== "directory") notFound();
  await requirePagePermission("manage_users");

  const props = await loadWovenEmployee(id);

  return (
    <PermissionGate permission="manage_integrations" adminOnly>
      <PermissionGate permission="manage_users">
        <WovenEmployeeScreen props={props} />
      </PermissionGate>
    </PermissionGate>
  );
}
