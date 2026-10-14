import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";
import { DataArea } from "./data-area";
import type { ReviewsIntegrationStatus } from "./integration-status";

/** The week / month marker printed on each goal tile. Words, not just colour. */
export function WindowTag({
  window,
  children,
}: {
  window: "week" | "month";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-[22px] px-2 py-[3px] text-[8.5px] font-black tracking-[0.1em] whitespace-nowrap uppercase",
        window === "week"
          ? "bg-surface-muted text-body-foreground"
          : "bg-selected text-selected-foreground",
      )}
    >
      {children}
    </span>
  );
}

/**
 * A SUMMARY TILE. The frame, label and explanation are layout and always show;
 * the figure is data and says "Not connected yet" until a source is connected.
 * The accent variant is the one-per-screen emphasis tile.
 */
export function GoalTile({
  status,
  tag,
  label,
  detail,
  accent,
  children,
}: {
  status: ReviewsIntegrationStatus;
  tag?: ReactNode;
  label: string;
  detail: string;
  accent?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "block rounded-[var(--radius-lg)] border p-[18px] shadow-raised",
        accent
          ? "border-brand-accent bg-brand-accent"
          : "border-border bg-surface",
      )}
    >
      {tag}
      <p
        className={cn("eyebrow mt-2", accent && "text-brand-accent-foreground")}
      >
        {label}
      </p>
      <div className="mt-2 min-h-[44px]">
        <DataArea
          status={status}
          size="value"
          className={cn("pt-2.5", accent && "text-brand-accent-foreground")}
        >
          {children}
        </DataArea>
      </div>
      <p
        className={cn(
          "mt-1.5 text-[10.5px] leading-snug",
          accent ? "text-brand-accent-foreground" : "text-muted-foreground",
        )}
      >
        {detail}
      </p>
    </div>
  );
}

/** A plain measure tile, as in the "holds" row. */
export function MeasureTile({
  status,
  label,
  detail,
  children,
}: {
  status: ReviewsIntegrationStatus;
  label: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <GoalTile status={status} label={label} detail={detail}>
      {children}
    </GoalTile>
  );
}

/** A framed section with a heading, for tables, charts and lists. */
export function Panel({
  title,
  controls,
  className,
  children,
}: {
  title?: string;
  controls?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-raised",
        className,
      )}
    >
      {title || controls ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border-hairline px-4 py-3.5">
          {title ? (
            <h3 className="mr-1 text-[13px] font-black text-foreground">
              {title}
            </h3>
          ) : null}
          {controls}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------- controls -- */
/*
 * THE FILTER CONTROLS ARE DRAWN, AND DISABLED. They keep the layout of the
 * connected page — search, district, status, rank-by — but with nothing to
 * search or filter they do nothing, and say so to assistive technology rather
 * than offering options (district names, counts) that would be invented.
 */

export function DisabledSearch({ label }: { label: string }) {
  return (
    <input
      type="search"
      disabled
      aria-label={label}
      placeholder={label}
      className="h-[34px] w-full min-w-0 rounded-[22px] border border-border-strong bg-surface px-3.5 text-[11.5px] text-foreground shadow-soft placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:w-56"
    />
  );
}

export function DisabledPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span
      aria-disabled="true"
      className="inline-flex cursor-not-allowed items-center gap-2 rounded-[22px] border border-border-strong bg-surface px-3.5 py-[7px] text-[11.5px] opacity-60 shadow-soft"
    >
      {label ? (
        <span className="eyebrow text-subtle-foreground">{label}</span>
      ) : null}
      <span className="font-bold whitespace-nowrap">{value}</span>
    </span>
  );
}

export function DisabledSegments({
  label,
  options,
}: {
  label: string;
  options: string[];
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-[22px] border border-border-strong bg-surface p-0.5 opacity-60 shadow-soft"
    >
      {options.map((option, index) => (
        <button
          key={option}
          type="button"
          disabled
          aria-pressed={index === 0}
          className={cn(
            "cursor-not-allowed rounded-[20px] px-3 py-[5px] text-[11.5px] font-bold whitespace-nowrap",
            index === 0
              ? "bg-selected text-selected-foreground"
              : "text-muted-foreground",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function DisabledChips({
  label,
  options,
}: {
  label: string;
  options: string[];
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option, index) => (
        <button
          key={option}
          type="button"
          disabled
          aria-pressed={index === 0}
          className={cn(
            "inline-flex cursor-not-allowed items-center rounded-[22px] border px-3 py-[5px] text-[11.5px] opacity-60",
            index === 0
              ? "border-selected bg-selected text-selected-foreground"
              : "border-border-strong bg-surface text-foreground",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/**
 * A table head with the not-connected message BELOW it, outside the scrolling
 * region. Inside the table the message sat in a row as wide as the columns and
 * was clipped off-screen on a phone.
 */
export function TableShell({
  label,
  columns,
  status,
}: {
  label: string;
  columns: { label: string; align?: "right" }[];
  status: ReviewsIntegrationStatus;
}) {
  return (
    <>
      <div className="scroll-slim relative w-full min-w-0 overflow-x-auto">
        <table
          aria-label={label}
          className="w-full min-w-[44rem] border-collapse text-left"
        >
          <thead>
            <tr className="border-b border-border bg-surface-muted">
              {columns.map((column) => (
                <th
                  key={column.label + (column.align ?? "")}
                  scope="col"
                  className={cn(
                    "px-4 py-2.5 text-[8px] font-black tracking-[0.14em] whitespace-nowrap text-subtle-foreground uppercase",
                    column.align === "right" && "text-right",
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>
      <DataArea status={status} />
    </>
  );
}

/**
 * THE FILTER STRIP UNDER THE TABS, as on the connected page: a "Filters" label
 * and the pills that narrow what is read. Drawn and disabled — see the note on
 * the disabled controls above.
 */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-hairline px-5 py-3 sm:px-6">
      <span className="eyebrow mr-1 text-subtle-foreground">Filters</span>
      {children}
    </div>
  );
}

/** The column heads of the ranking, drawn above its not-connected message. */
export function RankingHead() {
  return (
    <div
      aria-hidden
      className="hidden grid-cols-[3.5rem_minmax(0,1.6fr)_6rem_7rem_minmax(0,2fr)_8rem] gap-3 border-b border-border bg-surface-muted px-4 py-2.5 text-[8px] font-black tracking-[0.14em] text-subtle-foreground uppercase lg:grid"
    >
      <span>Rank</span>
      <span>Salon</span>
      <span className="text-right">This week</span>
      <span className="text-right">Month to date</span>
      <span>Progress toward target</span>
      <span>Status</span>
    </div>
  );
}

/** A footnote strip at the foot of a table or ranking. */
export function Footnote({ children }: { children: ReactNode }) {
  return (
    <p className="border-t border-border-hairline px-4 py-3 text-[11px] leading-snug text-muted-foreground">
      {children}
    </p>
  );
}

/** A legend entry: a swatch in the sister page's colours, and its words. */
export function LegendItem({
  swatch,
  children,
}: {
  swatch: string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden className={cn("h-2 w-3.5 rounded-[2px]", swatch)} />
      {children}
    </li>
  );
}
