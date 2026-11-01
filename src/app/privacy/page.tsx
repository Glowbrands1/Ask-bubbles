import type { Metadata } from "next";
import Link from "next/link";

import { PublicPage, PublicSection } from "@/features/public/public-page";

/**
 * PRIVACY POLICY — public, read by Google when the OAuth app is published.
 *
 * Keep every statement here TRUE OF THE CODE. In particular: disconnecting
 * Google (`/api/admin/google-reviews/disconnect`) revokes the grant and stops
 * syncing but KEEPS stored reviews, so this page promises deletion of review
 * data on request, not automatically on disconnect. Change the two together.
 */
export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Ask Bubbles uses Google Business Profile data.",
};

const EFFECTIVE_DATE = "November 1, 2026";
const PRIVACY_CONTACT = "paulyne.camacho@glowbrands.com";

export default function PrivacyPage() {
  return (
    <PublicPage eyebrow={`Effective ${EFFECTIVE_DATE}`} title="Privacy Policy">
      <PublicSection title="Who we are">
        <p>
          Ask Bubbles is an internal team app operated by Glowbrands, the company behind Sun Tan City
          and Buff City Soap. It is used only by Glowbrands staff and is not offered to the public.
        </p>
      </PublicSection>

      <PublicSection title="Google data we use">
        <p>
          When a Glowbrands administrator connects a Google account, Ask Bubbles requests the{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[13px]">business.manage</code> scope for
          the Google Business Profile APIs. We use it only to <b>read</b>:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Google Business Profile reviews (rating, review text, reviewer display name, date and any owner reply), and</li>
          <li>location information (business name, address and store code),</li>
        </ul>
        <p>
          and only for locations managed by Glowbrands. Ask Bubbles does not post, edit or delete reviews or
          replies, and does not read any other Google data such as Gmail, Drive or Contacts.
        </p>
      </PublicSection>

      <PublicSection title="How we use it">
        <p>
          The data is used solely to display and analyze reviews in the internal Ask Bubbles dashboard, so
          store and district managers can see how their locations are doing. We do not sell this data, share
          it with third parties, or use it for advertising.
        </p>
      </PublicSection>

      <PublicSection title="Storage and security">
        <p>
          Review and location data is stored in our Supabase database, which is encrypted at rest. OAuth
          tokens are stored server-side only: the long-lived refresh token is additionally encrypted by the
          app before it is saved, short-lived access tokens are held in memory for a single sync, and no
          token is ever sent to a browser. Access to the dashboard requires a Glowbrands staff sign-in.
        </p>
      </PublicSection>

      <PublicSection title="Retention and deletion">
        <p>
          We keep review data only while it is needed for the dashboard. When an administrator disconnects
          Google in Ask Bubbles, we ask Google to revoke our access and all syncing stops. To have
          previously imported review and location data deleted, email{" "}
          <a href={`mailto:${PRIVACY_CONTACT}`} className="text-primary underline">
            {PRIVACY_CONTACT}
          </a>{" "}
          and we will delete it.
        </p>
        <p>
          You can also revoke Ask Bubbles&apos; access at any time from your Google Account: go to{" "}
          <a
            href="https://myaccount.google.com/permissions"
            className="text-primary underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            myaccount.google.com/permissions
          </a>
          , select Ask Bubbles and choose <b>Remove access</b>. Syncing stops as soon as access is removed.
        </p>
      </PublicSection>

      <PublicSection title="Google API Services User Data Policy">
        <p>
          Ask Bubbles&apos; use of information received from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="text-primary underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </PublicSection>

      <PublicSection title="Contact">
        <p>
          Questions or requests about this policy:{" "}
          <a href={`mailto:${PRIVACY_CONTACT}`} className="text-primary underline">
            {PRIVACY_CONTACT}
          </a>
          . See also <Link href="/about" className="text-primary underline">About Ask Bubbles</Link>.
        </p>
      </PublicSection>
    </PublicPage>
  );
}
