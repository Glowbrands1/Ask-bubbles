"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Info, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldGroup, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { DEMO_SWITCHABLE_ROLES } from "@/config/company/access";
import { ACTIVE_BRAND } from "@/lib/brand";
import { supabasePublicConfigured } from "@/lib/config/runtime";
import { ROLE_DESCRIPTION, ROLE_LABEL, defaultLandingForRole } from "@/lib/permissions";
import { useSession } from "@/lib/session/session-context";
import type { Role } from "@/types";
import { AuthFrame } from "./auth-panel";
import { SignInForm } from "./sign-in-form";

/**
 * ============================================================================
 * THE SIGN-IN SCREEN, in whichever of three states this deployment is in.
 * ============================================================================
 *
 *   REAL AUTH CONFIGURED -> the working form. Email and password go to Supabase
 *   Auth; the server decides everything that follows. See `SignInForm`.
 *
 *   DEMO MODE -> the role switcher, unchanged. A presentation aid that handles
 *   no credential of any kind.
 *
 *   LIVE MODE, NOTHING CONFIGURED -> a notice naming what is missing. Not a
 *   dead form, and not a demo entry either: a deployment that asked for live
 *   mode and cannot authenticate anybody should say so rather than quietly
 *   offering a preview.
 *
 * The three are mutually exclusive and the order matters. Real auth is checked
 * FIRST, so a deployment that has it never shows a demo entry point.
 */
export function LoginScreen({
  /**
   * Set on the `/login` route so a successful sign-in navigates into the app.
   * The AppShell renders this component inline instead, where signing in simply
   * flips session state and the app appears — no navigation needed.
   */
  navigateOnSignIn,
}: {
  navigateOnSignIn?: boolean;
} = {}) {
  const { demoMode, signInAsDemo, role } = useSession();
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<Role>(role);

  /*
   * The same condition `getAuthProvider()` uses on the server, through the same
   * helper — so the screen cannot offer a form the server would refuse to
   * authenticate, or hide one it would accept. `supabasePublicConfigured()`
   * reads only NEXT_PUBLIC_ variables, which Next inlines, so it gives the same
   * answer in the browser as it does on the server.
   */
  const realAuth = !demoMode && supabasePublicConfigured();

  const handlePreview = () => {
    signInAsDemo(selectedRole);
    if (navigateOnSignIn) router.push(defaultLandingForRole(selectedRole));
  };

  /*
   * THE APPROVED BUFF CITY SOAP LOGIN — see `AuthFrame`. The circle holds
   * exactly one of the three states below; the not-configured notice is too
   * long for a circle, so that state uses the rounded card.
   */
  return (
    <AuthFrame
      title="Sign in"
      subtitle={
        <>
          to <b className="font-semibold text-foreground">{ACTIVE_BRAND.productName}</b> ·{" "}
          {ACTIVE_BRAND.tagline}
        </>
      }
      shape={realAuth || demoMode ? "circle" : "card"}
      footer={
        realAuth ? null : (
          <>
            Preview build. Content shown throughout the app is seeded demo data — it is not
            real company policy or real location performance.
          </>
        )
      }
    >
      {realAuth ? (
        /*
         * `SignInForm` reads `useSearchParams`, so it needs a Suspense
         * boundary — without one this whole route would be forced to render
         * dynamically at the framework's insistence rather than at ours.
         */
        <Suspense fallback={<div className="h-64" aria-hidden />}>
          <SignInForm />
        </Suspense>
      ) : demoMode ? (
        /*
         * DEMO MODE: the role picker, and only the role picker. The disabled
         * email and password fields this state used to show alongside it do
         * nothing here and would not fit the circle; real sign-in is unaffected.
         */
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold text-foreground">Preview the demo</p>
            <Badge tone="primary">Demo mode</Badge>
          </div>
          <FieldGroup label="Sign in as" htmlFor="demo-role">
            <Select
              id="demo-role"
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value as Role)}
            >
              {DEMO_SWITCHABLE_ROLES.map((demoRole) => (
                <option key={demoRole} value={demoRole}>
                  {ROLE_LABEL[demoRole]}
                </option>
              ))}
            </Select>
          </FieldGroup>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {ROLE_DESCRIPTION[selectedRole]}
          </p>
          <Button
            variant="ink"
            size="lg"
            className="w-full tracking-[0.08em] uppercase"
            onClick={handlePreview}
          >
            Preview demo
            <ArrowRight />
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <form
            className="space-y-3"
            onSubmit={(event) => event.preventDefault()}
            aria-describedby="auth-note"
          >
            <FieldGroup label="Work email" htmlFor="login-email">
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                disabled
              />
            </FieldGroup>

            <FieldGroup label="Password" htmlFor="login-password">
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••"
                disabled
              />
            </FieldGroup>

            <Button type="submit" variant="ink" size="lg" className="w-full tracking-[0.08em] uppercase" disabled>
              <Lock />
              Sign in
            </Button>

            <p id="auth-note" className="text-xs leading-relaxed text-muted-foreground">
              Sign-in is not configured for this deployment, so these fields
              are disabled. No password is stored, checked or transmitted
              anywhere.
            </p>
          </form>
          <Notice tone="neutral" icon={<Info />} title="Sign-in is not configured">
            This deployment asked for live mode but has no identity provider,
            so nobody can sign in. Set{" "}
            <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to enable
            Supabase Auth, or <code>NEXT_PUBLIC_DEMO_MODE=true</code> for
            preview access.
          </Notice>
        </div>
      )}
    </AuthFrame>
  );
}
