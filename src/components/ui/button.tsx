"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] font-semibold transition-[background-color,color,border-color,box-shadow,transform] duration-150 disabled:pointer-events-none [&_svg]:shrink-0 active:translate-y-px",
  {
    variants: {
      variant: {
        /*
         * THE PRIMARY ACTION IS DARK TOKYO GREEN with white text (4.67:1).
         * Tokyo Green itself cannot carry white text (1.98:1), which is why the
         * fill is the darker official green. Hover and press step darker
         * through derived shades, so the control never fades toward the page.
         *
         * DISABLED FILLS GO FLAT: Cotton-grey with a muted label, rather than a
         * translucent primary that still reads as pressable.
         */
        primary:
          "bg-primary text-primary-foreground shadow-soft hover:bg-primary-hover active:bg-primary-active disabled:bg-surface-muted disabled:text-placeholder-foreground disabled:shadow-none",
        /*
         * INK: Charcoal, for the one decisive action on a photographic ground —
         * the sign-in panels, as in the approved login. Generic "selected"
         * colour, so it carries no category meaning.
         */
        ink: "bg-selected text-selected-foreground shadow-soft hover:bg-primary active:bg-primary-active disabled:bg-surface-muted disabled:text-placeholder-foreground disabled:shadow-none",
        secondary:
          "bg-surface text-foreground border border-border-strong shadow-soft hover:border-primary hover:bg-hover-surface disabled:opacity-50",
        /* THE BRAND FILL: Tokyo Green with Charcoal text (5.71:1). */
        accent:
          "bg-accent text-accent-foreground shadow-soft hover:bg-accent-hover disabled:bg-surface-muted disabled:text-placeholder-foreground disabled:shadow-none",
        soft: "bg-primary-soft text-primary-soft-foreground hover:bg-accent-hover disabled:opacity-50",
        ghost:
          "text-muted-foreground hover:bg-hover-surface hover:text-foreground disabled:opacity-50",
        outline:
          "border border-border-strong bg-transparent text-foreground hover:border-primary hover:bg-hover-surface disabled:opacity-50",
        /*
         * DESTRUCTIVE is the derived Love Potion ink with white text (5.48:1):
         * the status-failed colour, not the follow-up colour, so pressing never
         * looks like an overdue alarm.
         */
        destructive:
          "bg-status-failed text-surface shadow-soft hover:bg-[color-mix(in_srgb,var(--status-failed)_82%,var(--foreground))] disabled:bg-surface-muted disabled:text-placeholder-foreground disabled:shadow-none",
        link: "text-primary underline underline-offset-4 decoration-1 hover:text-primary-hover hover:decoration-2 p-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-[13px] [&_svg]:size-3.5",
        md: "h-10 px-4 text-sm [&_svg]:size-4",
        lg: "h-12 px-6 text-[15px] [&_svg]:size-4",
        icon: "h-9 w-9 [&_svg]:size-4",
        iconSm: "h-8 w-8 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        type={asChild ? undefined : (type ?? "button")}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
