"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  FilePlus2,
  LineChart,
  MessageCircle,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { DASHBOARD_QUICK_ACTIONS } from "@/data/quick-actions";
import { useSession } from "@/lib/session/session-context";
import { cn } from "@/lib/utils/cn";

export const QUICK_ACTION_ICONS: Record<string, LucideIcon> = {
  "message-circle": MessageCircle,
  "file-plus": FilePlus2,
  "line-chart": LineChart,
  "calendar-check": CalendarCheck,
};

/**
 * THE HOME SHORTCUTS — a row of branded buttons directly under the Tokyo Green
 * ask band (approved 9 Oct 2026). They read as buttons rather than labels on
 * the Cotton page:
 *
 *   first     solid Dark Tokyo Green, White text (4.67:1) — it leads by
 *             being first, as before
 *   the rest  Tokyo tint with a Dark Tokyo Green outline and Tokyo ink text
 *             (5.55:1; the outline is 4.32:1 against Cotton)
 *
 * Hover fills every one Dark Tokyo Green (the first steps darker); keyboard
 * focus adds a Charcoal ring that shows on Cotton and on the band alike. Flat:
 * no shadow, no 3D. Every one of them also exists in the rail.
 *
 * OVERVIEW ONLY. A permanent row on every screen would duplicate the rail. The
 * path check stays so the component is safe wherever it is placed.
 */
export function JumpToRow({ className }: { className?: string }) {
  const pathname = usePathname();
  const { can } = useSession();
  if (pathname !== "/") return null;

  return (
    <nav
      aria-label="Shortcuts"
      className={cn("flex flex-wrap items-center gap-3", className)}
    >
      {DASHBOARD_QUICK_ACTIONS
        /*
          A SHORTCUT THAT NEEDS A PERMISSION IS NOT SHOWN WITHOUT IT. This is
          presentation and is not the boundary: every `href` is an authorized
          route that re-checks the same permission server-side.
        */
        .filter((action) => !action.permission || can(action.permission))
        .map((action, index) => {
        const Icon = QUICK_ACTION_ICONS[action.iconKey] ?? Sparkles;
        const className = cn(
          "inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] border-[1.5px] border-primary px-4 text-[14px] font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foreground max-sm:w-full",
          index === 0
            ? "bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover"
            : "bg-primary-soft text-primary-soft-foreground hover:bg-primary hover:text-primary-foreground",
        );

        const content = (
          <>
            <Icon className="size-4 shrink-0" aria-hidden />
            {action.label}
          </>
        );

        return action.external ? (
          <a
            key={action.id}
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            className={className}
          >
            {content}
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          <Link key={action.id} href={action.href} className={className}>
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
