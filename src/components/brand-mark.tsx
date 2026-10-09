import Image from "next/image";

import { cn } from "@/lib/utils/cn";
import { ACTIVE_BRAND } from "@/lib/brand";

/**
 * BrandMark — the Ask Bubbles product mark.
 * ---------------------------------------------------------------------------
 * The bubble mark plus the "ASK BUBBLES" wordmark in hand-lettered caps
 * (approved 9 Oct 2026, option B): the lettering face with each letter set a
 * little off the line, in the spirit of the Buff City Soap logo without
 * copying its letters. No official Ask Bubbles logo exists and none is
 * invented here. Every word comes from the brand config
 * (src/config/company/brand.ts).
 *
 *   default   on White or Pure Cotton: Charcoal lead, Dark Tokyo Green trail
 *             (Tokyo Green itself is never text on a light ground)
 *   onDark    on the Charcoal rail: White lead, Tokyo Green trail (5.71:1)
 *   onBand    on the Tokyo Green band (the phone top bar on Home and Chat):
 *             Charcoal lettering (5.71:1) and the white-bubble mark — Tokyo
 *             Green or White lettering would vanish into the band
 *   stacked   "ASK" over "BUBBLES" — the rail's lockup, as approved
 *
 * The letters are split into spans for the bounce, so the visual word is
 * hidden from assistive technology and the name is given once as text.
 */
export function BrandMark({
  size = "md",
  className,
  showMark = true,
  onDark = false,
  onBand = false,
  stacked = false,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  showMark?: boolean;
  /** Rendered on the Charcoal rail rather than on a light ground. */
  onDark?: boolean;
  /** Rendered on the Tokyo Green band. */
  onBand?: boolean;
  /** Lead word above the trail word, for the rail's lockup. */
  stacked?: boolean;
}) {
  const text = stacked
    ? { sm: "text-[18px]", md: "text-[28px]", lg: "text-[32px]" }[size]
    : { sm: "text-[15px]", md: "text-[19px]", lg: "text-[25px]" }[size];
  const markSize = stacked
    ? { sm: "size-8", md: "size-[46px]", lg: "size-14" }[size]
    : { sm: "size-5", md: "size-7", lg: "size-9" }[size];
  const leadInk = onBand ? "text-band-foreground" : onDark ? "text-sidebar-foreground" : "text-foreground";
  const trailInk = onBand ? "text-band-foreground" : onDark ? "text-brand-accent" : "text-primary";

  return (
    <span className={cn("relative inline-flex items-center gap-2.5", stacked && "gap-3", className)}>
      {showMark ? (
        <BubbleMark className={cn("relative", markSize)} onDark={onDark && !onBand} onBrand={onBand} />
      ) : null}
      <span className="sr-only">{`${ACTIVE_BRAND.wordmark.lead} ${ACTIVE_BRAND.wordmark.trail}`}</span>
      <span aria-hidden className={cn("wordmark relative", text, stacked && "flex flex-col")}>
        <span className={leadInk}>
          <Lettered word={ACTIVE_BRAND.wordmark.lead} />
        </span>
        {stacked ? null : " "}
        <span className={trailInk}>
          <Lettered word={ACTIVE_BRAND.wordmark.trail} />
        </span>
      </span>
    </span>
  );
}

/** One span per letter, for the hand-lettered bounce (`.wordmark-letter`). */
function Lettered({ word }: { word: string }) {
  return (
    <>
      {Array.from(word).map((letter, index) => (
        <span key={index} className="wordmark-letter">
          {letter}
        </span>
      ))}
    </>
  );
}

/**
 * The official Buff City Soap stacked logo.
 *
 * One file per approved colour (Tokyo Green, White, Charcoal) — the logo is
 * never tinted in CSS, boxed, outlined or shadowed (2023 guidelines, logo
 * "Don't"). Size it by HEIGHT through `className`; the width follows the
 * artwork's own proportions, so it cannot be squashed or stretched.
 */
export function BuffCitySoapLogo({
  tone = "tokyoGreen",
  className,
  priority = false,
}: {
  tone?: keyof typeof ACTIVE_BRAND.logo.stacked;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={ACTIVE_BRAND.logo.stacked[tone]}
      alt={ACTIVE_BRAND.brandName}
      width={ACTIVE_BRAND.logo.width}
      height={ACTIVE_BRAND.logo.height}
      priority={priority}
      className={cn("h-12 w-auto shrink-0 select-none", className)}
      draggable={false}
    />
  );
}

/**
 * The bubble mark — three circles, a real vector, never an emoji (an emoji
 * renders differently on every OS and cannot take the brand colours).
 *
 *   default   on a light ground: Tokyo Green, Dark Tokyo Green, Charcoal
 *   onDark    on the Charcoal rail: Tokyo Green with White bubbles
 *   onBrand   ON a Tokyo Green disc (the answer avatar): a White bubble with
 *             Dark Tokyo Green and Charcoal, so the mark does not vanish into
 *             its own ground
 */
export function BubbleMark({
  className,
  onDark = false,
  onBrand = false,
}: {
  className?: string;
  onDark?: boolean;
  onBrand?: boolean;
}) {
  const main = onBrand ? "var(--surface)" : onDark ? "var(--brand-accent)" : "var(--accent)";
  const second = onDark ? "var(--surface)" : "var(--primary)";
  const third = onDark ? "var(--brand-accent-soft)" : "var(--foreground)";
  return (
    <svg viewBox="0 0 32 32" className={cn("shrink-0", className)} aria-hidden focusable="false">
      <circle cx="13" cy="17" r="10" fill={main} />
      <circle cx="24" cy="9" r="5.5" fill={second} />
      <circle cx="25.5" cy="22.5" r="3.5" fill={third} />
      {/* The highlight that makes a circle read as a bubble. */}
      <circle
        cx="10"
        cy="14"
        r="3"
        fill={onBrand ? "var(--brand-accent)" : "var(--surface)"}
        fillOpacity={0.7}
      />
    </svg>
  );
}
