"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, Search, X } from "lucide-react";

import { BrandMark, BuffCitySoapLogo } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlays";
import { LoginScreen } from "@/features/auth/login-screen";
import { useSession } from "@/lib/session/session-context";
import { cn } from "@/lib/utils/cn";
import { usePreference, writePreference } from "@/lib/utils/client-store";
import { SidebarNav } from "./sidebar";
import { GlobalSearch } from "./global-search";
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
}: {
  children: ReactNode;
  overdueFollowUps?: number;
}) {
  const { hydrated, signedIn, demoMode, role } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    <div className="flex min-h-dvh bg-background">
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
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          THE SHARED TOP BAR, owned by the shell rather than any one page:
          White with a Cloud hairline, search in the middle, and the official
          Buff City Soap logo on the right in Tokyo Green. On small screens it
          also carries the menu button and the product wordmark, because the
          rail that holds the Ask Bubbles logo is a drawer there.
        */}
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b border-chrome-border bg-chrome px-3 text-chrome-foreground sm:gap-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden"
          >
            <Menu />
          </Button>

          <Link
            href={defaultLandingForRole(role)}
            aria-label={`${ACTIVE_BRAND.productName} — start`}
            className="shrink-0 lg:hidden"
          >
            <BrandMark size="sm" />
          </Link>

          <DesktopSearchLauncher className="mx-auto" />

          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            {demoMode ? (
              <Badge tone="primary" size="sm">
                Demo
              </Badge>
            ) : null}
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Search ${ACTIVE_BRAND.productName}`}
                  className="lg:hidden"
                >
                  <Search />
                </Button>
              </DialogTrigger>
              <DialogContent
                title={`Search ${ACTIVE_BRAND.productName}`}
                description="Documents, videos, forms, locations and screens."
                wide
              >
                <GlobalSearch />
              </DialogContent>
            </Dialog>
            {/*
              THE PARENT BRAND, in its own approved colour on White, with no box
              around it — the logo rules forbid one. Sized by height so the
              artwork keeps its proportions.
            */}
            <BuffCitySoapLogo priority className="h-10 sm:h-[50px]" />
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
              />
            </div>
          </div>
        ) : null}

        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Desktop-only utility bar used on pages with a global search affordance. */
export function DesktopSearchLauncher({ className }: { className?: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "hidden h-10 w-full max-w-[460px] items-center gap-2.5 rounded-full border border-border bg-surface-muted px-4 text-left text-[14px] text-muted-foreground transition-colors hover:border-border-strong lg:flex",
            className,
          )}
        >
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="flex-1 truncate">
            Search documents, forms, locations and screens
            {/* Names the product for screen readers, after the visible words so
                the accessible name still begins with what a voice user reads. */}
            <span className="sr-only"> in {ACTIVE_BRAND.productName}</span>
          </span>
        </button>
      </DialogTrigger>
      <DialogContent
        title={`Search ${ACTIVE_BRAND.productName}`}
        description="Documents, videos, forms, locations and screens."
        wide
      >
        <GlobalSearch />
      </DialogContent>
    </Dialog>
  );
}
