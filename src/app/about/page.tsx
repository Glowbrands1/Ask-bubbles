import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PublicPage, PublicSection } from "@/features/public/public-page";
import { ACTIVE_BRAND } from "@/lib/brand";

/**
 * ABOUT — the public homepage named on Google's OAuth consent screen. `/` stays
 * the signed-in Home; this is what a logged-out visitor (or Google's reviewer)
 * can read. See `features/public/public-page.tsx`.
 */
export const metadata: Metadata = {
  title: "About",
  description: ACTIVE_BRAND.description,
};

export default function AboutPage() {
  return (
    <PublicPage eyebrow="About" title={`${ACTIVE_BRAND.productName} — ${ACTIVE_BRAND.tagline}`}>
      <PublicSection title="What it is">
        <p>
          {ACTIVE_BRAND.description} It is an internal app for {ACTIVE_BRAND.brandName} staff, operated by
          Glowbrands. Signing in requires a company account.
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Chat answers grounded in company policies and knowledge.</li>
          <li>Guided forms, follow-ups and history for store teams.</li>
          <li>
            A reviews dashboard that reads Google Business Profile reviews for {ACTIVE_BRAND.brandName}{" "}
            stores, so managers can see and analyze guest feedback.
          </li>
        </ul>
      </PublicSection>

      <PublicSection title="Your data">
        <p>
          Read how we use Google data, how it is stored and how to revoke access in our{" "}
          <Link href="/privacy" className="text-primary underline">
            Privacy Policy
          </Link>
          .
        </p>
      </PublicSection>

      <div>
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    </PublicPage>
  );
}
