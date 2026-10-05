import {
  BarChart3,
  FileStack,
  Gauge,
  History,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  LineChart,
  MessageCircle,
  PlugZap,
  Sparkles,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { featureEnabled, type CompanyFeature } from "@/config/company/features";
import {
  REPORTS_DEFAULT_PATH,
  REPORTS_SECTION_PATH,
} from "@/features/reports/reports-routes";
import { ACTIVE_BRAND } from "@/lib/brand";
import type { Permission } from "@/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Item is hidden unless the active role holds this permission. */
  permission?: Permission;
  /**
   * Item is ALSO hidden unless the role administers the platform.
   *
   * For an entry that sits in an ordinary section but opens an administrative
   * screen. Knowledge Base is the case: it lives under Knowledge, next to
   * Videos, because that is what it is ABOUT — but the screen behind it is the
   * corpus's management console (inventory, counts, processing and failure
   * states, upload, delete, re-index), and `ADMIN_CONSOLE_ROLES` is who
   * administers this app.
   *
   * It does not replace `permission`; both must pass. Reading one cited
   * document is a separate, ungated-by-this route — see
   * `/knowledge/document/[id]`, which every role holding `view_knowledge` may
   * open so Bubbles' citations stay clickable.
   */
  adminOnly?: boolean;
  /**
   * The path that marks this item active, when it differs from where the item
   * NAVIGATES to.
   *
   * Needed wherever a sidebar entry names a SECTION but opens that section's
   * default page. "Reports & Analytics" opens Location Performance directly — a
   * manager should not have to pick a report before seeing one — but it must
   * stay highlighted across every reporting route, including the drill-down and
   * the reports added later. Keying the highlight on `href` would light up on
   * Location Performance and go dark on Sales Totals, which reads as having left
   * the section.
   *
   * Matched as a prefix, exactly as `href` is.
   */
  activePrefix?: string;
  /** The company feature this item belongs to; absent when the feature is off. */
  feature?: CompanyFeature;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  /** Administrative sections are visually marked and permission-gated. */
  admin?: boolean;
}

const ALL_SECTIONS: NavSection[] = [
  {
    id: "home",
    label: "Home",
    items: [
      { label: "Home", href: "/", icon: LayoutDashboard, permission: "view_overview", feature: "home" },
    ],
  },
  {
    id: "assistant",
    label: "Assistant",
    items: [
      {
        label: ACTIVE_BRAND.productName,
        href: "/chat",
        icon: MessageCircle,
        permission: "ask_questions",
        feature: "assistant",
      },
      {
        label: "History",
        href: "/history",
        icon: History,
        permission: "ask_questions",
        feature: "history",
      },
    ],
  },
  {
    id: "knowledge",
    label: "Knowledge",
    items: [
      {
        label: "Knowledge Base",
        href: "/knowledge",
        icon: Library,
        permission: "view_knowledge",
        adminOnly: true,
        feature: "knowledge",
      },
    ],
  },
  {
    id: "forms",
    label: "Forms",
    items: [
      {
        label: "Forms Register",
        href: "/forms/monitoring",
        icon: FileStack,
        permission: "view_form_monitoring",
        feature: "forms",
      },
      {
        label: "Form Templates",
        href: "/forms/templates",
        icon: LayoutTemplate,
        permission: "manage_form_templates",
        feature: "forms",
      },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    items: [
      {
        label: "Reports",
        href: REPORTS_DEFAULT_PATH,
        activePrefix: REPORTS_SECTION_PATH,
        icon: BarChart3,
        permission: "view_reports",
        feature: "reports",
      },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    admin: true,
    items: [
      {
        label: "Analytics",
        href: "/admin/analytics",
        icon: LineChart,
        permission: "view_analytics",
        feature: "analytics",
      },
      {
        label: "AI Usage",
        href: "/admin/ai-usage",
        icon: Gauge,
        permission: "view_ai_usage",
        feature: "aiUsage",
      },
      { label: "User Management", href: "/admin/users", icon: Users, permission: "manage_users" },
      {
        label: "Integrations",
        href: "/admin/integrations",
        icon: PlugZap,
        permission: "manage_integrations",
      },
    ],
  },
];

/**
 * THE NAVIGATION THIS DEPLOYMENT SHOWS: every item whose company feature is
 * on, in every section that still has an item. Permission filtering happens
 * per viewer in the sidebar; this is the deployment-wide shape.
 */
export const NAV_SECTIONS: NavSection[] = ALL_SECTIONS.map((section) => ({
  ...section,
  items: section.items.filter((item) => !item.feature || featureEnabled(item.feature)),
})).filter((section) => section.items.length > 0);

export const ICONS = { Sparkles };

/**
 * Whether a sidebar item is the one the current route belongs to.
 *
 * Every item matches as a prefix, so a nested route keeps its section lit:
 * `/reports/location-performance/0468` belongs to Reports & Analytics, and
 * `/forms/monitoring/abc` to Form Monitoring. `/` is the exception, because a
 * prefix match on it would mark Overview active everywhere.
 *
 * Items carrying `activePrefix` are matched on that instead of on `href` — see
 * the field's own note for why the two differ.
 *
 * (An earlier `matchPrefix` flag on NavItem is gone. Both of its branches were
 * the same expression, so items setting it and items not setting it behaved
 * identically; it described a distinction the function never made.)
 */
export function isActivePath(
  pathname: string,
  item: Pick<NavItem, "href" | "activePrefix">,
): boolean {
  const target = item.activePrefix ?? item.href;
  if (target === "/") return pathname === "/";
  return pathname === target || pathname.startsWith(`${target}/`);
}
