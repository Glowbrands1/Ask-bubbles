import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { ACTIVE_BRAND, brandStyle } from "@/lib/brand";
import { pageAuthorizationEnforced, pageIdentity } from "@/lib/auth/page";
import { RECOVERY_FORWARD_SCRIPT } from "@/lib/auth/recovery-forward";
import { Providers } from "./providers";
import "./globals.css";

/**
 * TYPE — the Buff City Soap 2023 brand fonts, with TEMPORARY FALLBACKS.
 *
 *   Headlines      Supria Sans Black      fallback: Archivo (900, width axis)
 *   Sub + body     Avenir Next Regular    fallback: Figtree
 *
 * The licensed brand files are not in this repository yet (the guidelines link
 * a packaged-fonts folder on Buff City Soap's SharePoint, and web embedding
 * needs a web licence for each). Until they arrive, `globals.css` names the
 * brand face FIRST in every stack and these open-source faces second: a device
 * with the brand face installed uses it — macOS and iOS ship Avenir Next —
 * and everyone else gets the fallback below.
 *
 * TO SWITCH TO THE LICENSED FILES: load them with `next/font/local` under the
 * same two CSS variables and delete these two calls. Nothing else changes.
 *
 * Both are served from this origin, so there is no runtime request to a font
 * CDN. Since 15 Nov 2026 they are `next/font/local` with the files committed
 * under `src/app/font-files/` (Fontsource's latin variable fonts, each family's
 * OFL licence beside it): `next/font/google` downloaded them at build time, and
 * CI's build failed whenever GitHub's runners could not reach Google Fonts (QA,
 * ported from the sibling app). Same faces, axes, subset and CSS variables as before. Archivo is a headline face and is never used
 * for body copy, labels or table cells.
 *
 * LETTERING — Grandstander (OFL), approved on 9 October 2026 for the Ask
 * Bubbles wordmark and the two greeting headlines (Home and the empty chat).
 * It carries the rounded, hand-made feel of the Buff City Soap logo without
 * copying its letters. It is not a brand body or headline face and is used
 * nowhere else.
 */
const archivo = localFont({
  // The variable font with its width axis, as next/font/google loaded it (axes: ["wdth"]).
  src: "./font-files/archivo/archivo-latin-wdth-normal.woff2",
  weight: "100 900",
  style: "normal",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  variable: "--font-archivo",
  display: "swap",
});

const figtree = localFont({
  src: "./font-files/figtree/figtree-latin-wght-normal.woff2",
  weight: "300 900",
  style: "normal",
  variable: "--font-figtree",
  display: "swap",
});

const grandstander = localFont({
  src: "./font-files/grandstander/grandstander-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-grandstander",
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
  themeColor: "#f6f6f6",
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
      className={`${figtree.variable} ${archivo.variable} ${grandstander.variable}`}
      // Brand palette overrides from the BrandConfig are applied here.
      style={brandStyle(ACTIVE_BRAND)}
    >
      <body className="antialiased">
        {/* Sends a recovery link that landed on the wrong page (e.g. `/#access_token=…`)
            to /reset-password before anything renders. See lib/auth/recovery-forward.ts. */}
        <script dangerouslySetInnerHTML={{ __html: RECOVERY_FORWARD_SCRIPT }} />
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
