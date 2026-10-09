"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { BrandMark, BuffCitySoapLogo } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoginScreen } from "@/features/auth/login-screen";
import { useSession } from "@/lib/session/session-context";
import { cn } from "@/lib/utils/cn";
import { usePreference, writePreference } from "@/lib/utils/client-store";
import { SidebarNav } from "./sidebar";
import { backdropForPath, chromeForPath } from "./backdrop";
import { ACTIVE_BRAND } from "@/lib/brand";
import { defaultLandingForRole } from "@/lib/permissions";

const COLLAPSE_KEY = "ask-bubbles:sidebar-collapsed";

export function AppShell({
  children,
  /**
   * Overdue follow-ups, counted on the server by the layout so the rail badge
   * cannot disagree with the page it links to. Zero hides it.
   */
  overdueFollowUps = 0,
  /** Administrators only, decided on the server by the layout. */
  showAppSwitcher = false,
}: {
  children: ReactNode;
  overdueFollowUps?: number;
  showAppSwitcher?: boolean;
}) {
  const { hydrated, signedIn, demoMode, role } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const band = chromeForPath(pathname) === "band";
  const backdrop = backdropForPath(pathname);

  // Escape closes the mobile drawer, as it closes every other overlay.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Read straight from the external store — no effect, no cascading render.
  const collapsed = usePreference("local", COLLAPSE_KEY, "0") === "1";

  const toggleCollapse = () => {
    writePreference("local", COLLAPSE_KEY, collapsed ? "0" : "1");
  };

  // Before hydration we cannot know whether a demo session exists, so show a
  // neutral splash rather than flashing the login screen.
  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <BrandMark size="lg" />
          <p className="text-[13px] text-muted-foreground">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  // Not signed in: render the login experience inline. No redirect, so there is
  // no navigation race between hydration and the auth check.
  if (!signedIn) return <LoginScreen />;

  return (
    <div className={cn("flex min-h-dvh", backdrop === "band" ? "bg-chat-canvas" : "bg-background")}>
      {/*
        THE BRAND BACKGROUND, behind everything: fixed to the viewport, faded
        toward the bottom-right, and absent on chat and the form editor. The
        page column below sits above it (z-[1]), and every card, table and
        field in it is opaque, so it only shows in the gaps. Decoration only.
      */}
      <div aria-hidden className="canvas-pattern" data-backdrop={backdrop} />
      {/*
        THE RAIL RUNS THE FULL HEIGHT, led by the Ask Bubbles logo — the
        approved layout. It is Charcoal, the darker of the two shell surfaces,
        so the white top bar beside it reads as part of the page.
      */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 transition-[width] duration-200 lg:block",
          collapsed ? "w-[68px]" : "w-64",
        )}
      >
        <SidebarNav
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          overdueFollowUps={overdueFollowUps}
          showAppSwitcher={showAppSwitcher}
        />
      </aside>

      {/*
        On the band pages the column sits on the soft-tint canvas, so its grey
        text takes the darker body ink there (`data-canvas`, globals.css).
      */}
      <div
        className="relative z-[1] flex min-w-0 flex-1 flex-col"
        data-canvas={backdrop === "band" ? "band" : undefined}
      >
        {/*
          THE SHARED TOP BAR, owned by the shell rather than any one page.

          ON HOME AND CHAT ("band", approved 9 Oct 2026) the page itself opens
          with a Tokyo Green header that carries the Buff City Soap logo, so on
          desktop there is no bar at all. Below `lg` the rail is a drawer, so
          a Tokyo Green bar carries the menu button, the wordmark in Charcoal
          and the White logo, and runs straight into the page's header.

          EVERYWHERE ELSE ("plain") it is the slim White bar with a Cloud
          hairline and the official logo in Tokyo Green.

          Search is not in this bar any more: it opens from the top of the rail
          and the drawer (sidebar.tsx), on every route.
        */}
        <header
          className={cn(
            "sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-6",
            band
              ? "bg-band text-band-foreground lg:hidden"
              : "border-b border-chrome-border bg-chrome text-chrome-foreground",
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
            className={cn("lg:hidden", band && "text-band-foreground hover:bg-band-chip-surface")}
          >
            <Menu />
          </Button>

          <Link
            href={defaultLandingForRole(role)}
            aria-label={`${ACTIVE_BRAND.productName} — start`}
            className="shrink-0 lg:hidden"
          >
            <BrandMark size="sm" stacked onBand={band} />
          </Link>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            {demoMode ? (
              <Badge tone="primary" size="sm">
                Demo
              </Badge>
            ) : null}
            {/*
              THE PARENT BRAND, in an approved colour with no box around it —
              the logo rules forbid one. White on the band, Tokyo Green on
              White. Sized by height so the artwork keeps its proportions.
            */}
            <BuffCitySoapLogo
              priority
              tone={band ? "white" : "tokyoGreen"}
              className="h-10 sm:h-[50px]"
            />
          </div>
        </header>

        {/* Mobile drawer */}
        {drawerOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-[color-mix(in_srgb,var(--foreground)_45%,transparent)]"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="animate-in-fade absolute inset-y-0 left-0 w-[min(19rem,86vw)] shadow-float">
              <Button
                variant="ghost"
                size="iconSm"
                aria-label="Close navigation"
                className="absolute top-4 right-3 z-10 text-sidebar-foreground hover:bg-rail-hover hover:text-sidebar-foreground"
                onClick={() => setDrawerOpen(false)}
              >
                <X />
              </Button>
              <SidebarNav
                variant="drawer"
                onNavigate={() => setDrawerOpen(false)}
                overdueFollowUps={overdueFollowUps}
                showAppSwitcher={showAppSwitcher}
              />
            </div>
          </div>
        ) : null}

        {/* `overflow-x-clip` lets a band page header run full width without a sideways scroll. */}
        <main id="main" className="min-w-0 flex-1 overflow-x-clip">
          {children}
        </main>
      </div>
    </div>
  );
}
