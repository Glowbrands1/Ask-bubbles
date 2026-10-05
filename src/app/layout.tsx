import type { Metadata, Viewport } from "next";
import { Fredoka, Lato } from "next/font/google";

import { ACTIVE_BRAND, brandStyle } from "@/lib/brand";
import { pageAuthorizationEnforced, pageIdentity } from "@/lib/auth/page";
import { Providers } from "./providers";
import "./globals.css";

/**
 * TYPE: Fredoka for display headings and the wordmarks — rounded and friendly,
 * a temporary stand-in for Buff City Soap's brand face until a brand kit is
 * supplied — and Lato for everything else.
 *
 * Both through `next/font`: the files are downloaded at BUILD time and served
 * from this origin, so there is no runtime request to a font CDN. Fredoka is
 * a display face and is never used for body copy, labels or table cells.
 */
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-fredoka",
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-lato",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${ACTIVE_BRAND.productName} — ${ACTIVE_BRAND.tagline}`,
    template: `%s · ${ACTIVE_BRAND.productName}`,
  },
  description: ACTIVE_BRAND.description,
};

export const viewport: Viewport = {
  themeColor: "#fbf5ec",
  width: "device-width",
  initialScale: 1,
};

/**
 * WHY THE ROOT LAYOUT RESOLVES THE IDENTITY.
 *
 * The shell renders the person's name, their scope and their navigation, so
 * every route already depends on who is asking. Resolving it here means one
 * lookup per request feeds the whole tree, rather than each page passing its
 * own copy down or the client asking after the fact.
 *
 * The cost is that reading request headers opts every route into dynamic
 * rendering. That is the right trade for an authenticated application: there is
 * no useful static version of a page whose contents depend on the reader, and
 * the alternative is a shell that renders as a stranger and then corrects
 * itself.
 *
 * Only the PROFILE crosses into the client — no token, no session object. The
 * browser's Supabase session lives in an HTTP-only cookie it cannot read.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const productionAuth = pageAuthorizationEnforced();
  const identity = productionAuth ? await pageIdentity() : null;

  return (
    <html
      lang="en"
      className={`${lato.variable} ${fredoka.variable}`}
      // Brand palette overrides from the BrandConfig are applied here.
      style={brandStyle(ACTIVE_BRAND)}
    >
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-[var(--radius-sm)] focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-float"
        >
          Skip to main content
        </a>
        <Providers
          productionAuth={productionAuth}
          session={
            identity
              ? {
                  subject: identity.subject,
                  email: identity.email,
                  displayName: identity.displayName,
                  role: identity.role,
                  scope: identity.scope,
                }
              : null
          }
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
