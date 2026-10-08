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
 * THE HOME SHORTCUTS — a quiet row of equal secondary buttons directly under
 * the Tokyo Green ask band, as in the approved design. Every one of them also
 * exists in the rail, so they are navigation, not calls to action: White with
 * a Charcoal-tint border, and no colour of their own, so they never compete
 * with the band above them.
 *
 * ONE TREATMENT FOR THE WHOLE ROW. No single highlighted chip: the row is a
 * set of equal shortcuts, and if one needs to lead it leads by being first.
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
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {DASHBOARD_QUICK_ACTIONS
        /*
          A SHORTCUT THAT NEEDS A PERMISSION IS NOT SHOWN WITHOUT IT. This is
          presentation and is not the boundary: every `href` is an authorized
          route that re-checks the same permission server-side.
        */
        .filter((action) => !action.permission || can(action.permission))
        .map((action) => {
        const Icon = QUICK_ACTION_ICONS[action.iconKey] ?? Sparkles;
        const className =
          "inline-flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-[12px] font-semibold text-foreground transition-colors hover:border-primary hover:bg-hover-surface";

        const content = (
          <>
            <Icon className="size-3.5 shrink-0 text-foreground" aria-hidden />
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
