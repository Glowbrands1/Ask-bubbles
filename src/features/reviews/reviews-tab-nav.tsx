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
      className="scroll-slim flex items-center gap-1 overflow-x-auto border-b border-border-strong bg-background px-5 sm:px-6"
    >
      {REVIEW_TABS.map((tab) => {
        const active = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={reviewsTabHref(tab.key)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-[3px] px-3.5 py-3.5 text-[10px] font-black tracking-[0.1em] whitespace-nowrap uppercase transition-colors",
              active
                ? "border-brand-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
