import { cn } from "@/lib/utils/cn";
import { ACTIVE_BRAND } from "@/lib/brand";

/**
 * BrandMark
 * ---------------------------------------------------------------------------
 * A text wordmark plus a small bubble mark drawn as SVG. No official Ask
 * Bubbles logo exists yet and none is invented here: the bubbles are a
 * geometric placeholder in the brand colours.
 *
 * When an official asset arrives, replace the contents of this component with
 * an <Image>. Nothing else in the app renders the wordmark. Every word comes
 * from the brand config (src/config/company/brand.ts).
 */
export function BrandMark({
  size = "md",
  className,
  showMark = true,
  onDark = false,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  showMark?: boolean;
  /** Rendered against the wine top bar rather than the cream canvas. */
  onDark?: boolean;
}) {
  const text = { sm: "text-[13px]", md: "text-[18px]", lg: "text-[22px]" }[size];
  const markSize = { sm: "size-4", md: "size-[30px]", lg: "size-9" }[size];

  return (
    <span className={cn("relative inline-flex items-center gap-3", className)}>
      {onDark ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 -left-3 size-16 -translate-y-1/2 rounded-full"
          style={{ backgroundImage: "var(--brand-glow)" }}
        />
      ) : null}
      {showMark ? <BubbleMark className={cn("relative", markSize)} onDark={onDark} /> : null}
      <span className={cn("wordmark relative", text)}>
        <span className={onDark ? "text-topbar-foreground" : "text-muted-foreground"}>
          {ACTIVE_BRAND.wordmark.lead}
        </span>
        <span className={onDark ? "text-brand-accent" : "text-foreground"}>
          {" "}
          {ACTIVE_BRAND.wordmark.trail}
        </span>
      </span>
    </span>
  );
}

/**
 * The parent-brand name, at the product mark's own size, behind a hairline.
 * A TYPE STAND-IN for the official Buff City Soap logo, which should replace
 * it once supplied; the name comes from the brand config.
 */
export function ParentBrandLockup({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <span aria-hidden className="h-[26px] w-px shrink-0 bg-band-border" />
      <span className="wordmark text-[18px] text-topbar-foreground">
        {ACTIVE_BRAND.brandName.replace(/ /g, " ")}
      </span>
    </span>
  );
}

/**
 * The bubble mark — three circles, a real vector, never an emoji (an emoji
 * renders differently on every OS and cannot take the brand colours).
 *
 *   default   on the canvas: orange and aqua outlines with a soft fill
 *   onDark    on the wine bar: solid orange and aqua bubbles
 *   onBrand   ON an orange disc (the answer avatar): the bubbles invert to the
 *             accent ink so the mark does not vanish into its own ground
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
  const main = onBrand ? "var(--brand-accent-foreground)" : "var(--brand-accent)";
  const second = onBrand ? "var(--brand-accent-foreground)" : "var(--accent)";
  const solid = onDark || onBrand;
  return (
    <svg viewBox="0 0 24 24" className={cn("shrink-0", className)} aria-hidden focusable="false">
      <circle
        cx="10"
        cy="13.5"
        r="7"
        fill={solid ? main : "var(--brand-accent-soft)"}
        stroke={main}
        strokeWidth={solid ? 0 : 1.6}
      />
      <circle
        cx="18"
        cy="7"
        r="4"
        fill={solid ? second : "var(--accent-soft)"}
        stroke={second}
        strokeWidth={solid ? 0 : 1.4}
      />
      <circle cx="19.5" cy="17" r="2" fill={second} />
      {/* The highlight that makes a circle read as a bubble. */}
      <path
        d="M6.6 11.2a4.4 4.4 0 0 1 3-2.9"
        fill="none"
        stroke={solid ? "var(--topbar)" : main}
        strokeOpacity={solid ? 0.55 : 0.8}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
