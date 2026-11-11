import { shiftDays, weekdayOf } from "@/lib/business-date";
import { centralToday } from "@/lib/google-reviews/goals";
import { COMPANY_LOCATIONS } from "@/lib/locations";
import type { DemoStoreWeek, ReportsSample } from "@/lib/reporting/demo-sample";

/**
 * ============================================================================
 * STORE REPORTING — INVENTED DEMO FIGURES
 * ============================================================================
 *
 * Demo builds only (named solely by `lib/demo/runtime.demo.ts`). Every sales,
 * labour and Makery figure here is INVENTED for the demo; no Buff City Soap
 * system was read. The stores are the roster's seven so the report reads like
 * the real thing, and the weeks are pinned to today: the latest week is always
 * the one that closed last Sunday.
 *
 * The demo accounts' areas (`data/demo/users.ts`) are not on the roster, so
 * this file also says which stores each demo area covers — the regional
 * manager sees all seven, the district manager the four Nebraska stores, and a
 * store-level account one store.
 */

/** Per store: typical weekly net sales, change on last year, average ticket, labour % of sales. */
const PROFILES: Record<string, { weekly: number; yoy: number; ticket: number; labor: number; makery: number }> = {
  "66": { weekly: 9400, yoy: 0.031, ticket: 33.8, labor: 0.226, makery: 14 },
  "67": { weekly: 11800, yoy: 0.058, ticket: 35.2, labor: 0.204, makery: 22 },
  "219": { weekly: 17600, yoy: 0.087, ticket: 38.9, labor: 0.181, makery: 41 },
  "225": { weekly: 14200, yoy: 0.044, ticket: 36.1, labor: 0.195, makery: 27 },
  "236": { weekly: 10300, yoy: -0.022, ticket: 34.4, labor: 0.219, makery: 16 },
  "264": { weekly: 15900, yoy: 0.066, ticket: 37.5, labor: 0.188, makery: 33 },
  "338": { weekly: 12100, yoy: 0.142, ticket: 36.6, labor: 0.211, makery: 24 },
};

const WEEKS = 13;
const WAGE = 15.75;

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Holiday lift: soap is a gift business, so sales climb from mid-November. */
function season(weekStart: string): number {
  const md = weekStart.slice(5);
  if (md >= "12-01" && md <= "12-24") return 1.55;
  if (md >= "11-15") return 1.22;
  if (md >= "02-07" && md <= "02-14") return 1.18;
  if (md >= "05-01" && md <= "05-12") return 1.15;
  return 1;
}

export function buildReportsSample(now: Date = new Date()): ReportsSample {
  const today = centralToday(now);
  const thisMonday = shiftDays(today, -((weekdayOf(today) + 6) % 7));
  const latest = shiftDays(thisMonday, -7);
  const weeks: DemoStoreWeek[] = [];

  for (const location of COMPANY_LOCATIONS) {
    const profile = PROFILES[location.code] ?? { weekly: 11000, yoy: 0.04, ticket: 35, labor: 0.2, makery: 20 };
    for (let i = 0; i < WEEKS; i++) {
      const weekStart = shiftDays(latest, -7 * i);
      const rand = seeded(Number(weekStart.replaceAll("-", "")) * 13 + Number(location.code));
      const swing = 0.9 + rand() * 0.2;
      const netSales = Math.round(profile.weekly * season(weekStart) * swing);
      const lastYearNetSales = Math.round((netSales / (1 + profile.yoy)) * (0.97 + rand() * 0.06));
      const ticket = profile.ticket * (0.95 + rand() * 0.1);
      const transactions = Math.round(netSales / ticket);
      const units = Math.round(transactions * (3.1 + rand() * 0.7));
      const laborCost = Math.round(netSales * profile.labor * (0.93 + rand() * 0.14));
      weeks.push({
        locationId: location.id,
        weekStart,
        netSales,
        lastYearNetSales,
        transactions,
        units,
        laborHours: Math.round(laborCost / WAGE),
        laborCost,
        makeryGuests: Math.round(profile.makery * (0.7 + rand() * 0.6) * (season(weekStart) > 1.3 ? 1.4 : 1)),
      });
    }
  }

  const id = (code: string) => COMPANY_LOCATIONS.find((l) => l.code === code)?.id;
  const ids = (codes: string[]) => codes.map(id).filter((v): v is string => Boolean(v));

  return {
    weeks,
    stores: COMPANY_LOCATIONS.map((l) => ({ id: l.id, name: l.name })),
    areas: {
      "reg-demo": { label: "Demo Region (Midwest)", locationIds: COMPANY_LOCATIONS.map((l) => l.id) },
      "dist-demo": { label: "Demo District (Nebraska)", locationIds: ids(["66", "67", "236", "264"]) },
      "loc-demo-1": { label: "Omaha, NE (West Dodge Rd)", locationIds: ids(["264"]) },
    },
    periodEnd: shiftDays(latest, 6),
    refreshedAt: new Date(Date.parse(`${thisMonday}T12:10:00Z`)).toISOString(),
  };
}
