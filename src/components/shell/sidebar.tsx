"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, Lock, Search } from "lucide-react";

import { BrandMark, BubbleMark } from "@/components/brand-mark";
import { Dialog, DialogContent, DialogTrigger, Tooltip } from "@/components/ui/overlays";
import { useSession } from "@/lib/session/session-context";
import { cn } from "@/lib/utils/cn";
import { GlobalSearch } from "./global-search";
import { AppSwitcher } from "./app-switcher";
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
  showAppSwitcher = false,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  variant?: "desktop" | "drawer";
  /** Counted on the server by the (app) layout. Zero hides the badge. */
  overdueFollowUps?: number;
  /** Decided on the server by the (app) layout: administrators only. */
  showAppSwitcher?: boolean;
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
    // `rail-pattern` draws the faint brand pattern behind the rail (globals.css,
    // BRAND BACKGROUNDS); `isolate` keeps it above the Charcoal and below the links.
    <div className="rail-pattern relative isolate flex h-full flex-col bg-sidebar">
      {/*
        THE ASK BUBBLES LOGO LEADS THE RAIL, on desktop and in the drawer — the
        approved layout. The shell's white top bar carries the Buff City Soap
        logo instead, so the two marks never compete; the top bar shows the
        product wordmark only on small screens, where this rail is a drawer.
      */}
      <div
        className={cn(
          "flex shrink-0 items-center border-b border-rail-border",
          isCollapsed ? "h-16 justify-center px-2" : "px-5 pt-[22px] pb-[18px]",
        )}
      >
        {isCollapsed ? (
          <Link href={homeHref} aria-label={`${ACTIVE_BRAND.productName} — start`} onClick={onNavigate}>
            <BubbleMark className="size-8" onDark />
          </Link>
        ) : (
          <Link href={homeHref} onClick={onNavigate} aria-label={`${ACTIVE_BRAND.productName} — start`}>
            <BrandMark size="md" onDark stacked />
          </Link>
        )}
      </div>

      <nav
        aria-label="Main"
        className="scroll-slim flex-1 overflow-y-auto px-3 py-4"
      >
        <SearchLauncher collapsed={isCollapsed} onNavigate={onNavigate} />
        {sections.map((section) => (
          <div key={section.id} className="mb-5 last:mb-0">
            {!isCollapsed ? (
              <p
                className={cn(
                  /*
                    THE RAIL'S OWN INK, not the canvas muted `.eyebrow` paints
                    itself with, which is too dark on Charcoal. The rail label
                    (35% Charcoal on White) clears 5.8:1 here — the admin label
                    included, which used to take a teal ink that would land at
                    1.85:1 on this rail.
                  */
                  "eyebrow mb-2 flex items-center gap-1.5 px-2.5 text-sidebar-muted",
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
                      "group relative flex items-center gap-3 rounded-[var(--radius-sm)] text-[14px] transition-colors",
                      isCollapsed ? "justify-center px-0 py-2.5" : "px-3 py-[9px]",
                      /*
                       * THE CURRENT PAGE IS THE TOKYO GREEN PILL with Charcoal
                       * text (5.71:1) — the rail's one colour. A hover is a
                       * step lighter Charcoal and keeps the white text, so it
                       * can never be mistaken for the current page.
                       */
                      active
                        ? "bg-sidebar-active font-bold text-sidebar-active-foreground shadow-rail-active"
                        : "font-medium text-sidebar-foreground hover:bg-rail-hover",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-[18px] shrink-0",
                        active ? "text-sidebar-active-foreground" : "text-sidebar-foreground",
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
                          "grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-followup-attention px-1.5 text-[11px] font-bold text-followup-attention-foreground tabular-nums",
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
                        className={cn(
                          "ml-auto rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                          active
                            ? "border-sidebar-active-foreground/30 text-sidebar-active-foreground"
                            : "border-rail-border text-sidebar-muted",
                        )}
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

      {/*
        THE SIGNED-IN PERSON, at the foot of the rail. Name, role, email and
        scope all come from the session (the server-resolved profile), never
        from fixed copy. The menu opens upward from here.
      */}
      <div className="shrink-0 space-y-1.5 border-t border-rail-border p-3">
        {variant === "desktop" && onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-sidebar-muted transition-colors hover:bg-rail-hover hover:text-sidebar-foreground",
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
        <UserMenu collapsed={isCollapsed} onNavigate={onNavigate} />
        {/* Below the profile, the last thing on the rail: administrators only. */}
        {showAppSwitcher ? <AppSwitcher collapsed={isCollapsed} /> : null}
      </div>
    </div>
  );
}

/**
 * SEARCH, AT THE TOP OF THE RAIL AND THE DRAWER.
 *
 * It used to be the pill in the White top bar. The approved Home and Chat
 * design (9 Oct 2026) has no bar on desktop, and search is still the only way
 * to find a form by a team member's name — the Forms Register filters by
 * follow-up state, not by text — so it moved here, where it is on every route
 * and every width. Same search, same window; only where it opens changed.
 *
 * Choosing a result closes the window, and the drawer with it on a phone.
 */
function SearchLauncher({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const name = `Search ${ACTIVE_BRAND.productName}`;

  const trigger = (
    <DialogTrigger asChild>
      <button
        type="button"
        aria-label={name}
        className={cn(
          "mb-4 flex w-full items-center gap-3 rounded-[var(--radius-sm)] border border-rail-border text-[14px] font-medium text-sidebar-foreground transition-colors hover:bg-rail-hover",
          collapsed ? "justify-center px-0 py-2.5" : "px-3 py-[8px]",
        )}
      >
        <Search className="size-[18px] shrink-0" aria-hidden />
        {!collapsed ? <span className="truncate">Search</span> : null}
      </button>
    </DialogTrigger>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {collapsed ? (
        <Tooltip content="Search" side="right">
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}
      <DialogContent title={name} description="Documents, videos, forms, locations and screens." wide>
        <div
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a[href]")) {
              setOpen(false);
              onNavigate?.();
            }
          }}
        >
          <GlobalSearch />
        </div>
      </DialogContent>
    </Dialog>
  );
}
