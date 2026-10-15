import Link from "next/link";

import { cn } from "@/lib/utils/cn";
import { REVIEW_TABS, reviewsTabHref, type ReviewsTab } from "./reviews-tabs";

/**
 * THE FOUR VIEWS OF THE GOOGLE REVIEWS PAGE — ordinary links, so each view is a
 * real URL, Back and refresh work, and the page stays server-rendered. The
 * strip scrolls sideways on a phone rather than wrapping or moving the page.
 */
export function ReviewsTabNav({ current }: { current: ReviewsTab }) {
  return (
    <nav
      aria-label="Google Reviews views"
      className="scroll-slim flex items-center gap-1.5 overflow-x-auto border-b border-border-strong bg-background px-5 py-2.5 sm:px-6"
    >
      {REVIEW_TABS.map((tab) => {
        const active = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={reviewsTabHref(tab.key)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-[22px] px-4 py-2 text-[10px] font-black tracking-[0.1em] whitespace-nowrap uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent",
              active
                ? "bg-selected text-selected-foreground shadow-soft"
                : "text-muted-foreground hover:bg-brand-accent-soft hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
