"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, Lock } from "lucide-react";

import { BrandMark, BubbleMark } from "@/components/brand-mark";
import { Tooltip } from "@/components/ui/overlays";
import { useSession } from "@/lib/session/session-context";
import { cn } from "@/lib/utils/cn";
import { NAV_SECTIONS, isActivePath } from "./navigation";
import { UserMenu } from "./user-menu";
import { ACTIVE_BRAND } from "@/lib/brand";
import { defaultLandingForRole } from "@/lib/permissions";

export function SidebarNav({
  collapsed,
  onToggleCollapse,
  onNavigate,
  variant = "desktop",
  overdueFollowUps = 0,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  variant?: "desktop" | "drawer";
  /** Counted on the server by the (app) layout. Zero hides the badge. */
  overdueFollowUps?: number;
}) {
  const pathname = usePathname();
  const { can, isAdmin, role } = useSession();
  /* The brand mark goes where this role starts, which is not Home for every role. */
  const homeHref = defaultLandingForRole(role);

  /*
   * THE RAIL SHOWS WHAT THE ROLE MAY OPEN, in demo and live alike: the role
   * matrix is company configuration (src/config/company/access.ts), so the
   * demo's role switcher previews exactly what each role will see. The rail is
   * not the boundary — the page guards and the API are.
   */
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (section.admin && !isAdmin) return false;
      /*
       * Checked ALONGSIDE the section flag and BEFORE the demo bypass, for the
       * same reason: who administers the platform is a fixed decision rather
       * than a guess the preview is standing down on.
       */
      if (item.adminOnly && !isAdmin) return false;
      if (!item.permission) return true;
      return can(item.permission);
    }),
  })).filter((section) => section.items.length > 0);

  const isCollapsed = variant === "desktop" && collapsed;

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/*
        THE DRAWER ONLY. On desktop the shell's navy top bar carries the
        wordmark, so repeating it here would put two Ask Bubbles marks on screen.
        The drawer slides over the content with no bar above it, so it still
        needs one.
      */}
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-border",
          isCollapsed ? "justify-center px-2" : "justify-between px-5",
          variant === "desktop" && "hidden",
        )}
      >
        {isCollapsed ? (
          <Link href={homeHref} aria-label={`${ACTIVE_BRAND.productName} — start`} onClick={onNavigate}>
            <BubbleMark className="size-6" />
          </Link>
        ) : (
          <Link href={homeHref} onClick={onNavigate} aria-label={`${ACTIVE_BRAND.productName} — start`}>
            <BrandMark size="md" />
          </Link>
        )}
      </div>

      <nav
        aria-label="Main"
        className="scroll-slim flex-1 overflow-y-auto px-3 py-4"
      >
        {sections.map((section) => (
          <div key={section.id} className="mb-5 last:mb-0">
            {!isCollapsed ? (
              <p
                className={cn(
                  /*
                    THE RAIL'S OWN INK, not the canvas muted `.eyebrow` paints
                    itself with — that lands at 1.92:1 on #b2aeaa. Of the
                    approved values only #2b2926 and #454240 clear 4.5:1 on this
                    surface, and section labels take the lighter of the two.
                  */
                  "eyebrow mb-2 flex items-center gap-1.5 px-2.5 text-sidebar-muted",
                  section.admin && "text-brand-accent-soft-foreground",
                )}
              >
                {section.admin ? <Lock className="size-2.5" aria-hidden /> : null}
                {section.label}
              </p>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-border" aria-hidden />
            )}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActivePath(pathname, item);
                const Icon = item.icon;
                const link = (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-[var(--radius-sm)] text-[13px] font-medium transition-colors",
                      isCollapsed ? "justify-center px-0 py-2.5" : "px-2.5 py-2",
                      /*
                       * SELECTED AND HOVERED BOTH LAND ON THE CANVAS, which is
                       * what the approved mockup shows: a pale pill on the grey
                       * rail. The previous pair was two greys a shade apart, so
                       * hovering an item barely changed it and the selected one
                       * still read as dark.
                       *
                       * What separates them is depth and weight, not hue — the
                       * selected item keeps its shadow and its coloured icon,
                       * so a hover never impersonates the current page.
                       */
                      active
                        ? "bg-sidebar-active text-sidebar-active-foreground shadow-rail-active"
                        : "text-sidebar-foreground hover:bg-hover-surface hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        active
                          ? "text-sidebar-active-foreground"
                          : "text-sidebar-foreground group-hover:text-foreground",
                      )}
                      aria-hidden
                    />
                    {!isCollapsed ? (
                      <span className="truncate">{item.label}</span>
                    ) : (
                      <span className="sr-only">{item.label}</span>
                    )}

                    {/*
                      COUNTS, NOT HUES. The direction's rule for the rail: add
                      information, not a colour per section. Giving each section
                      its own hue looks organised in a mockup and breaks
                      immediately, because section colour and status colour then
                      mean different things within the same twelve pixels.

                      This is the SAME overdue count the band and the Overview
                      report — one meaning, three places — and it only renders
                      when there is something to act on.
                    */}
                    {item.href === "/forms/monitoring" && overdueFollowUps > 0 ? (
                      <span
                        className={cn(
                          "grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-followup-attention px-1.5 text-[8px] font-black text-followup-attention-foreground",
                          isCollapsed
                            ? "absolute top-1 right-1"
                            : "ml-auto",
                        )}
                      >
                        {overdueFollowUps}
                        <span className="sr-only"> overdue follow-ups</span>
                      </span>
                    ) : null}
                    {!isCollapsed && section.admin ? (
                      <span
                        aria-hidden
                        className="ml-auto rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary-soft-foreground uppercase"
                      >
                        Admin
                      </span>
                    ) : null}
                  </Link>
                );

                return (
                  <li key={item.href}>
                    {isCollapsed ? (
                      <Tooltip content={item.label} side="right">
                        {link}
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <UserMenu collapsed={isCollapsed} onNavigate={onNavigate} />
        {variant === "desktop" && onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              "mt-2 flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-xs font-medium text-sidebar-muted transition-colors hover:bg-hover-surface hover:text-foreground",
              isCollapsed && "justify-center px-0",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronsLeft
              className={cn(
                "size-3.5 shrink-0 transition-transform",
                collapsed && "rotate-180",
              )}
              aria-hidden
            />
            {!isCollapsed ? "Collapse sidebar" : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}
