import {
  BookOpenCheck,
  BarChart3,
  CalendarCheck,
  FileStack,
  Gauge,
  History,
  LayoutDashboard,
  LayoutTemplate,
  GraduationCap,
  Library,
  LineChart,
  MessageCircle,
  PlugZap,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { featureEnabled, type CompanyFeature } from "@/config/company/features";
import {
  REPORTS_DEFAULT_PATH,
  REPORTS_SECTION_PATH,
} from "@/features/reports/reports-routes";
import { ACTIVE_BRAND } from "@/lib/brand";
import { REPORTS_SECTION_LABEL } from "@/lib/reporting/registry";
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
  /**
   * What's New's entry: shown only to the people the server says see it (`whatsNewVisibleFor`, handed down by the
   * layout as `useWhatsNewVisible()`): everyone once NEXT_PUBLIC_WHATS_NEW_ENABLED is on, else WHATS_NEW_USERS only.
   */
  whatsNew?: true;
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
      /* Port from the sibling app (Pau, 26 Nov 2026): one calendar with the Leadership Hub and the sibling app. */
      { label: "Calendar", href: "/calendar", icon: CalendarCheck, permission: "view_overview" },
      /* WHAT'S NEW (Pau, 26 Nov 2026): recent updates, from `src/config/whats-new.ts`; gated as Home is. Hidden until rolled out (Pau, 27 Nov 2026), except for WHATS_NEW_USERS (the owner: "live but on my own page only"): `whatsNew`, decided on the server. */
      { label: "What's New", href: "/whats-new", icon: Sparkles, permission: "view_overview", whatsNew: true },
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
    id: "insights",
    label: "Insights",
    items: [
      {
        label: REPORTS_SECTION_LABEL,
        href: REPORTS_DEFAULT_PATH,
        activePrefix: REPORTS_SECTION_PATH,
        icon: BarChart3,
        permission: "view_reports",
        feature: "reports",
      },
      {
        label: "Google Reviews",
        href: "/reviews",
        icon: Star,
        permission: "view_reports",
        feature: "reviews",
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
      {
        /*
         * THE AI TRAINING PROGRAM, rebuilt here from its own app. The label
         * is the client's own wording, in capitals as they asked for it.
         */
        label: "AI TRAINING",
        href: "/ai-training",
        icon: GraduationCap,
        permission: "view_ai_training",
        feature: "aiTraining",
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
      /* QA, 24 Nov 2026: the list of every page the AI can read, from the page registry. */
      { label: "AI-readable pages", href: "/admin/ai-readable-pages", icon: BookOpenCheck, permission: "view_ai_usage", adminOnly: true },
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

/** What decides which sidebar entries a person sees (the session's, and the server's yes/no for What's New). */
export interface NavVisibility {
  readonly can: (permission: Permission) => boolean;
  readonly isAdmin: boolean;
  readonly whatsNewVisible: boolean;
}

/**
 * The sidebar sections and entries this person sees. ONE RULE for the rail and for the pages the assistant's answers
 * link to (`src/lib/navigation/page-links.ts`), so an answer never links a page the person's own sidebar does not show.
 */
export function visibleNavSections({ can, isAdmin, whatsNewVisible }: NavVisibility, sections: readonly NavSection[] = NAV_SECTIONS): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (section.admin && !isAdmin) return false;
        // What's New: only for whom the server says (the owner, 27 Nov 2026: "live but on my own page only").
        if (item.whatsNew && !whatsNewVisible) return false;
        /*
         * Checked ALONGSIDE the section flag and BEFORE the demo bypass, for the
         * same reason: who administers the platform is a fixed decision rather
         * than a guess the preview is standing down on.
         */
        if (item.adminOnly && !isAdmin) return false;
        if (!item.permission) return true;
        return can(item.permission);
      }),
    }))
    .filter((section) => section.items.length > 0);
}

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
