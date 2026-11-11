"use client";

import { asdNoFormMonitoringEnabled } from "@/lib/permissions";
import { useSession } from "@/lib/session/session-context";

/**
 * ASD_NO_FORM_MONITORING: whether this reader is kept out of the Forms
 * Register (the Assistant Manager with the flag on), so search offers neither
 * the screen nor the form hits that open it. Always false with the flag off.
 */
export function useHidesFormMonitoring(): boolean {
  const { can } = useSession();
  return asdNoFormMonitoringEnabled() && !can("view_form_monitoring");
}
