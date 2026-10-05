import type { Permission } from "@/types";

/**
 * Shortcuts on the Home screen's jump row. Each is an internal route, gated
 * by the permission its destination needs.
 */
export interface QuickAction {
  id: string;
  label: string;
  href: string;
  iconKey: string;
  external?: boolean;
  permission?: Permission;
}

export const DASHBOARD_QUICK_ACTIONS: QuickAction[] = [
  { id: "qa-ask", label: "Ask a question", href: "/chat", iconKey: "message-circle", permission: "ask_questions" },
  {
    id: "qa-forms",
    label: "See which forms I can create",
    href: `/chat?q=${encodeURIComponent("Which forms can I create here?")}`,
    iconKey: "file-plus",
    permission: "view_forms_workspace",
  },
  { id: "qa-reports", label: "Open reports", href: "/reports", iconKey: "line-chart", permission: "view_reports" },
];
