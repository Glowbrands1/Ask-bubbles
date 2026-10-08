import type { ReactNode } from "react";
import Image from "next/image";

import { BuffCitySoapLogo } from "@/components/brand-mark";
import { ACTIVE_BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils/cn";

/**
 * ============================================================================
 * THE BRANDED FRAME EVERY CREDENTIAL SCREEN SHARES.
 * ============================================================================
 *
 * Sign-in, forgot-password, reset-password, invitation and recovery are the
 * same panel with a different title and a different form. Sharing it means a
 * change to the sign-in chrome cannot leave some of them looking like a
 * different product.
 *
 * THE APPROVED BUFF CITY SOAP LOGIN, after the brand's own printer-portal
 * login: authentic product photography under a soft Tokyo Green wash, two
 * photo circles ringed in Tokyo Green, and a translucent White circular panel
 * with a Tokyo Green ring holding the official stacked logo. Below `sm` the
 * circle becomes a rounded card so nothing is clipped on a phone.
 *
 * READABILITY OVER THE PHOTO: the panel is 90% White with a blur, so every
 * field and label sits at full contrast whatever is behind it.
 *
 * Purely presentational. It renders whatever form it is given and knows
 * nothing about authentication.
 */
export function AuthFrame({
  title,
  subtitle,
  children,
  footer,
  shape = "circle",
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** `card` for content too tall for the circle (the not-configured notice). */
  shape?: "circle" | "card";
}) {
  return (
    <main
      id="main"
      className="relative isolate grid min-h-dvh place-items-center overflow-hidden px-4 py-8 sm:py-12"
    >
      {/* Brand photography: the product is the hero (2023 guidelines). */}
      <Image
        src="/brand/login-soap-powder.jpg"
        alt=""
        aria-hidden
        fill
        priority
        sizes="100vw"
        className="-z-20 object-cover object-[center_40%]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(160deg,color-mix(in_srgb,var(--brand-accent)_30%,transparent),color-mix(in_srgb,var(--brand-accent)_8%,transparent)_45%,color-mix(in_srgb,var(--primary)_30%,transparent))]"
      />
      <PhotoOrb className="-bottom-[60px] -left-[70px] size-[180px] sm:bottom-[-50px] sm:left-[max(-60px,calc(50%-560px))] sm:size-[260px]" />
      <PhotoOrb
        position="object-[80%_30%]"
        className="top-10 right-[max(-30px,calc(50%-470px))] hidden size-[150px] sm:block"
      />

      <section
        aria-labelledby="auth-title"
        className={cn(
          "relative grid w-full max-w-[600px] place-items-center border-brand-accent bg-surface/90 shadow-float backdrop-blur-md",
          "rounded-[32px] border-[6px] px-5 py-7",
          shape === "circle"
            ? "sm:aspect-square sm:rounded-full sm:border-[10px] sm:px-[92px] sm:py-14"
            : "sm:rounded-[40px] sm:border-[10px] sm:px-14 sm:py-12",
        )}
      >
        <div className="grid w-full max-w-[340px] gap-3.5 text-center">
          <BuffCitySoapLogo priority className="mx-auto mb-0.5 h-[66px] sm:h-[77px]" />
          <h1
            id="auth-title"
            className="display text-[26px] tracking-[0.06em] text-foreground uppercase sm:text-[28px]"
          >
            {title}
          </h1>
          {subtitle ? (
            <p className="-mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{subtitle}</p>
          ) : null}
          <div className="text-left">{children}</div>
          {footer ? (
            <div className="text-[12px] leading-relaxed text-muted-foreground">{footer}</div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

/** A decorative circle of product photography, ringed in Tokyo Green. */
function PhotoOrb({ className, position = "object-[30%_50%]" }: { className?: string; position?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "absolute -z-10 overflow-hidden rounded-full border-8 border-brand-accent shadow-float",
        className,
      )}
    >
      <Image
        src="/brand/login-soap-loaves.jpg"
        alt=""
        fill
        sizes="260px"
        className={cn("object-cover", position)}
      />
    </div>
  );
}

/**
 * The forgot / reset / invitation / recovery screens. Same frame as sign-in,
 * with the product named under the title when no subtitle is given.
 */
export function AuthPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <AuthFrame title={title} subtitle={subtitle ?? productLine()}>
      {children}
    </AuthFrame>
  );
}

/** "Ask Bubbles · Answers, forms and know-how for your team" */
export function productLine(): ReactNode {
  return (
    <>
      <b className="font-semibold text-foreground">{ACTIVE_BRAND.productName}</b> ·{" "}
      {ACTIVE_BRAND.tagline}
    </>
  );
}
