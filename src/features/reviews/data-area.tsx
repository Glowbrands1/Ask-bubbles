import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";
import {
  NOT_CONFIGURED_MESSAGE,
  NOT_CONNECTED_MESSAGE,
  type ReviewsIntegrationStatus,
} from "./integration-status";

/** The disconnected message, sized for a tile value, a table row or a panel. */
export function NotConnected({
  size = "panel",
  className,
  message = NOT_CONNECTED_MESSAGE,
}: {
  size?: "value" | "panel";
  className?: string;
  message?: string;
}) {
  return (
    <p
      data-testid="not-connected"
      className={cn(
        size === "value"
          ? "display-figure text-[20px] leading-tight text-muted-foreground"
          : "py-7 text-center text-[13px] font-bold text-muted-foreground",
        className,
      )}
    >
      {message}
    </p>
  );
}

/**
 * ONE SLOT FOR ONE KIND OF DATA. Not connected: the message. Connected: the
 * children, which is where a real snapshot will be rendered later. Every
 * unavailable area on the page goes through here, so the wording and the
 * look are identical everywhere.
 */
export function DataArea({
  status,
  size,
  className,
  children,
}: {
  status: ReviewsIntegrationStatus;
  size?: "value" | "panel";
  className?: string;
  children?: ReactNode;
}) {
  if (status === "not_connected")
    return <NotConnected size={size} className={className} />;
  if (status === "not_configured")
    return <NotConnected size={size} className={className} message={NOT_CONFIGURED_MESSAGE} />;
  return <>{children}</>;
}
