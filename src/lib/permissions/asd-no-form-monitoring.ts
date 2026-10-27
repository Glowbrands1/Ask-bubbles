/**
 * NEXT_PUBLIC_ASD_NO_FORM_MONITORING_ENABLED (Pau, 26-27 Oct 2026; same flag in
 * both apps): the assistant role does not see the Forms Register. Here that is
 * the Assistant Manager (the sibling app's Assistant Salon Director). Read at
 * build time, so the browser and the server always agree; default off.
 *
 * Its own module because the company access matrix reads it and
 * `@/lib/permissions` reads that matrix.
 */
export function asdNoFormMonitoringEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_ASD_NO_FORM_MONITORING_ENABLED;
  return typeof raw === "string" && ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}
