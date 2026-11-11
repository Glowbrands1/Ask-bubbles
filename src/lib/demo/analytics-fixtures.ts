import { businessToday, shiftDays } from "@/lib/business-date";
import {
  locationFilterFor,
  resolveWindow,
  bucketFor,
  type AnalyticsFilters,
} from "@/lib/analytics/filters";
import {
  statusesFor,
  FEEDBACK_PAGE_SIZE,
  type FeedbackFilters,
} from "@/lib/analytics/feedback-filters";
import type {
  AnalyticsSnapshot,
  AnalyticsTotals,
  BreakdownRow,
  LeaderRow,
  LocationRow,
  TrendPoint,
} from "@/lib/analytics/queries";
import type {
  FeedbackItem,
  FeedbackPage,
  FeedbackSnapshot,
  FeedbackSummary,
  SurfaceRow,
  TopicRow,
  WhenRow,
} from "@/lib/analytics/feedback-queries";
import {
  CATEGORY_FEATURE,
  type ActivityCategory,
  type ActivitySurface,
} from "@/lib/analytics/taxonomy";
import type { FeedbackOutcome, FeedbackStatus } from "@/lib/feedback/types";
import { COMPANY_DISTRICTS, COMPANY_LOCATIONS, locationById, locationByCode } from "@/lib/locations";
import type { Role } from "@/types";

/**
 * ============================================================================
 * ANALYTICS — AN INVENTED YEAR OF USE, FOR DEMO BUILDS ONLY
 * ============================================================================
 *
 * A deterministic event log (seeded pseudo-random, so every render agrees with
 * the last) for an invented set of store leaders across the configured stores,
 * aggregated here the way the database functions aggregate it live. Because
 * the aggregation runs over the log, every filter on the screen — range,
 * custom window, store, role, leader, inactive only — works as it does live.
 *
 * The leaders are invented people. Nothing is read from or written to a
 * database; moderating a comment is kept in this server process only.
 */

interface DemoLeader {
  id: string;
  name: string;
  role: Role;
  /** Home store code, or null for an area leader. */
  store: string | null;
  /** Average events on a working day. */
  rate: number;
  /** Days ago this leader went quiet, if they did. */
  quietFor?: number;
}

const LEADERS: DemoLeader[] = [
  { id: "a1d5e0c2-1111-4a10-9000-000000000001", name: "Harriet Vale", role: "location_manager", store: "264", rate: 5.2 },
  { id: "a1d5e0c2-1111-4a10-9000-000000000002", name: "Desmond Okonjo", role: "assistant_manager", store: "264", rate: 2.6 },
  { id: "a1d5e0c2-1111-4a10-9000-000000000003", name: "Marguerite Ellery", role: "location_manager", store: "67", rate: 4.1 },
  { id: "a1d5e0c2-1111-4a10-9000-000000000004", name: "Rafferty Quill", role: "assistant_manager", store: "67", rate: 1.4 },
  { id: "a1d5e0c2-1111-4a10-9000-000000000005", name: "Ottoline Prescott", role: "location_manager", store: "66", rate: 3.3 },
  { id: "a1d5e0c2-1111-4a10-9000-000000000006", name: "Linus Abernathy", role: "assistant_manager", store: "66", rate: 1.1, quietFor: 41 },
  { id: "a1d5e0c2-1111-4a10-9000-000000000007", name: "Constance Iwu", role: "location_manager", store: "236", rate: 3.8 },
  { id: "a1d5e0c2-1111-4a10-9000-000000000008", name: "Ambrose Kettering", role: "assistant_manager", store: "236", rate: 2.0 },
  { id: "a1d5e0c2-1111-4a10-9000-000000000009", name: "Seraphina Mott", role: "location_manager", store: "219", rate: 4.6 },
  { id: "a1d5e0c2-1111-4a10-9000-000000000010", name: "Gideon Fairweather", role: "assistant_manager", store: "219", rate: 1.8 },
  { id: "a1d5e0c2-1111-4a10-9000-000000000011", name: "Philippa Darrow", role: "location_manager", store: "225", rate: 0.9, quietFor: 19 },
  { id: "a1d5e0c2-1111-4a10-9000-000000000012", name: "Torin Blackwood", role: "assistant_manager", store: "225", rate: 0.5, quietFor: 64 },
  { id: "a1d5e0c2-1111-4a10-9000-000000000013", name: "Esmé Hollingsworth", role: "location_manager", store: "338", rate: 3.0 },
  { id: "a1d5e0c2-1111-4a10-9000-000000000014", name: "Barnaby Lowe", role: "assistant_manager", store: "338", rate: 1.6 },
  { id: "a1d5e0c2-1111-4a10-9000-000000000015", name: "Cordelia Ashby", role: "district_manager", store: null, rate: 6.4 },
  { id: "a1d5e0c2-1111-4a10-9000-000000000016", name: "Montague Reyes", role: "district_manager", store: null, rate: 4.9 },
  { id: "a1d5e0c2-1111-4a10-9000-000000000017", name: "Isolde Fennimore", role: "regional_manager", store: null, rate: 3.1 },
  { id: "a1d5e0c2-1111-4a10-9000-000000000018", name: "Augustin Pryce", role: "owner", store: null, rate: 1.2 },
];

/** Stores an area leader works across when they ask from a store. */
const AREA_STORES: Record<string, string[]> = {
  "a1d5e0c2-1111-4a10-9000-000000000015": ["264", "67", "66", "236"],
  "a1d5e0c2-1111-4a10-9000-000000000016": ["219", "225", "338"],
  "a1d5e0c2-1111-4a10-9000-000000000017": ["264", "67", "66", "236", "219", "225", "338"],
  "a1d5e0c2-1111-4a10-9000-000000000018": ["264", "219"],
};

const CATEGORY_WEIGHTS: [ActivityCategory, number][] = [
  ["policy_question", 18],
  ["team_guidance", 14],
  ["store_operations", 12],
  ["form_created", 10],
  ["guest_experience", 9],
  ["equipment_procedures", 7],
  ["training", 7],
  ["general_guidance", 6],
  ["hiring_onboarding", 5],
  ["pay_benefits", 4],
  ["safety_compliance", 4],
  ["document_search", 4],
  ["form_request", 3],
  ["reporting", 3],
  ["report_analysis", 3],
  ["report_upload", 1],
  ["document_upload", 1],
  ["unclassified", 1],
];

const COMMENTS: { rating: number; outcome: FeedbackOutcome; text: string; category: ActivityCategory }[] = [
  { rating: 5, outcome: "yes", text: "Exactly the steps I needed for the closing count. Saved me a call.", category: "store_operations" },
  { rating: 5, outcome: "yes", text: "The corrective action came out ready to sign — just had to add the date.", category: "form_created" },
  { rating: 4, outcome: "yes", text: "Good answer on the dress code, would like the page number shown bigger.", category: "policy_question" },
  { rating: 2, outcome: "partially", text: "It found the attendance policy but not the part about no-call no-shows.", category: "policy_question" },
  { rating: 1, outcome: "no", text: "Asked about holiday pay for part-timers and it said it didn't know.", category: "pay_benefits" },
  { rating: 4, outcome: "yes", text: "Helpful coaching wording for a new soap maker.", category: "team_guidance" },
  { rating: 3, outcome: "partially", text: "Answer was right but too long to read on the floor.", category: "guest_experience" },
  { rating: 5, outcome: "yes", text: "Used it to plan interview questions, worked great.", category: "hiring_onboarding" },
  { rating: 2, outcome: "no", text: "Picked the wrong store for the form, I had to change it.", category: "form_created" },
  { rating: 5, outcome: "yes", text: "Clear answer on the batch labeling steps.", category: "equipment_procedures" },
  { rating: 4, outcome: "partially", text: "Good start on the follow-up, it missed one of the expectations we agreed.", category: "form_created" },
  { rating: 3, outcome: "partially", text: "Training checklist was fine but not the newest version.", category: "training" },
];

interface DemoEvent {
  id: number;
  at: string;
  /** 0 Sunday … 6 Saturday, in the business timezone. */
  dow: number;
  hour: number;
  userId: string;
  role: Role;
  locationId: string | null;
  category: ActivityCategory;
  surface: ActivitySurface;
  succeeded: boolean;
  ack: boolean;
}

interface DemoRating {
  id: string;
  eventIndex: number;
  rating: number;
  outcome: FeedbackOutcome | null;
  comment: string;
  status: FeedbackStatus;
  resolutionNote: string | null;
  hidden: boolean;
}

/** Mulberry32: tiny, deterministic, good enough to look like people. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, weighted: [T, number][]): T {
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of weighted) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return weighted[weighted.length - 1]![0];
}

function storeId(code: string): string {
  return locationByCode(code)?.id ?? `loc-${code}`;
}

/** Central time is UTC-6 (CST) for the demo's window; close enough to place an hour. */
const UTC_OFFSET_HOURS = 6;
const HISTORY_DAYS = 400;

interface DemoLog {
  today: string;
  events: DemoEvent[];
  ratings: DemoRating[];
}

let cached: DemoLog | null = null;

function demoLog(today: string): DemoLog {
  if (cached?.today === today) return cached;
  const random = prng(20261111);
  const events: DemoEvent[] = [];
  for (let daysAgo = HISTORY_DAYS; daysAgo >= 0; daysAgo -= 1) {
    const day = shiftDays(today, -daysAgo);
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    // Adoption grew over the year: a quarter of today's use a year ago.
    const growth = 0.25 + 0.75 * (1 - daysAgo / HISTORY_DAYS);
    const weekday = dow === 0 ? 0.35 : dow === 6 ? 0.7 : 1;
    for (const leader of LEADERS) {
      if (leader.quietFor !== undefined && daysAgo < leader.quietFor) continue;
      const expected = leader.rate * growth * weekday;
      const count = Math.floor(expected + random());
      for (let n = 0; n < count; n += 1) {
        const hour = 7 + Math.floor(random() * random() * 14) + (random() < 0.4 ? 2 : 0);
        const minute = Math.floor(random() * 60);
        const utcHour = hour + UTC_OFFSET_HOURS;
        const utcDay = utcHour >= 24 ? shiftDays(day, 1) : day;
        const at = `${utcDay}T${String(utcHour % 24).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
        const stores = leader.store ? [leader.store] : (AREA_STORES[leader.id] ?? []);
        const store = leader.store ?? (random() < 0.7 ? stores[Math.floor(random() * stores.length)] : null);
        const category = pick(random, CATEGORY_WEIGHTS);
        events.push({
          id: events.length,
          at,
          dow,
          hour: Math.min(23, hour),
          userId: leader.id,
          role: leader.role,
          locationId: store ? storeId(store) : null,
          category,
          surface:
            CATEGORY_FEATURE[category] === "reports"
              ? "report"
              : pick(random, [
                  ["main_chat", 84],
                  ["overview", 12],
                  ["unknown", 2],
                ] as [ActivitySurface, number][]),
          succeeded: random() > 0.025,
          ack: random() < 0.14,
        });
      }
    }
  }

  const ratings: DemoRating[] = [];
  for (const event of events) {
    if (CATEGORY_FEATURE[event.category] === "knowledge" || random() > 0.07) continue;
    const daysAgo = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(event.at)) / 86_400_000);
    const withComment = random() < 0.35;
    const comment = withComment ? COMMENTS[Math.floor(random() * COMMENTS.length)]! : null;
    const rating = comment ? comment.rating : pick(random, [[5, 46], [4, 30], [3, 12], [2, 7], [1, 5]] as [number, number][]);
    const status: FeedbackStatus = !comment
      ? daysAgo < 21
        ? "pending"
        : "resolved"
      : daysAgo < 6
        ? "pending"
        : daysAgo < 14
          ? pick(random, [["pending", 1], ["in_review", 2]] as [FeedbackStatus, number][])
          : pick(random, [["resolved", 4], ["dismissed", 1]] as [FeedbackStatus, number][]);
    if (comment) event.category = comment.category;
    ratings.push({
      id: `f00dbacc-0000-4000-8000-${String(event.id).padStart(12, "0")}`,
      eventIndex: event.id,
      rating,
      outcome: comment ? comment.outcome : random() < 0.6 ? (rating >= 4 ? "yes" : rating === 3 ? "partially" : "no") : null,
      comment: comment?.text ?? "",
      status,
      resolutionNote:
        status === "resolved" && comment ? "Added to the knowledge base review list." : null,
      hidden: false,
    });
  }

  cached = { today, events, ratings };
  return cached;
}

/* --------------------------------------------------- moderation (demo) --- */

interface RatingChange {
  status?: FeedbackStatus;
  resolutionNote?: string | null;
  hidden?: boolean;
  deleted?: boolean;
  at?: string;
}
const CHANGES_KEY = "__askBubblesDemoFeedbackChanges";
function changes(): Map<string, RatingChange> {
  const holder = globalThis as unknown as Record<string, Map<string, RatingChange> | undefined>;
  holder[CHANGES_KEY] ??= new Map();
  return holder[CHANGES_KEY]!;
}

export function isDemoFeedbackId(id: string): boolean {
  return /^f00dbacc-0000-4000-8000-\d{12}$/.test(id);
}

export function moderateDemoFeedback(id: string, change: Omit<RatingChange, "at">): void {
  changes().set(id, { ...changes().get(id), ...change, at: new Date().toISOString() });
}

function currentRatings(log: DemoLog): DemoRating[] {
  return log.ratings
    .filter((rating) => !changes().get(rating.id)?.deleted)
    .map((rating) => {
      const change = changes().get(rating.id);
      if (!change) return rating;
      return {
        ...rating,
        status: change.status ?? rating.status,
        resolutionNote: change.resolutionNote !== undefined ? change.resolutionNote : rating.resolutionNote,
        hidden: change.hidden ?? rating.hidden,
      };
    });
}

/* --------------------------------------------------------- aggregation --- */

function inWindow(event: DemoEvent, from: string, to: string): boolean {
  return event.at >= from && event.at < to;
}

function matches(event: DemoEvent, filters: AnalyticsFilters): boolean {
  const locations = locationFilterFor(filters);
  if (locations && (!event.locationId || !locations.includes(event.locationId))) return false;
  if (filters.role && event.role !== filters.role) return false;
  if (filters.actorId && event.userId !== filters.actorId) return false;
  return true;
}

function select(log: DemoLog, filters: AnalyticsFilters, from: string, to: string): DemoEvent[] {
  return log.events.filter((event) => inWindow(event, from, to) && matches(event, filters));
}

function totalsOf(events: DemoEvent[]): AnalyticsTotals {
  const counted = events.filter((event) => !event.ack);
  return {
    events: counted.length,
    activeUsers: new Set(counted.map((event) => event.userId)).size,
    activeLocations: new Set(counted.map((event) => event.locationId).filter(Boolean)).size,
    forms: counted.filter((event) => event.category === "form_created").length,
    documents: counted.filter((event) => event.category === "document_upload").length,
    reports: counted.filter((event) => event.category === "report_upload" || event.category === "report_analysis").length,
    chatEvents: counted.filter((event) => CATEGORY_FEATURE[event.category] === "chat").length,
    failures: counted.filter((event) => !event.succeeded).length,
  };
}

function breakdown(events: DemoEvent[], keyOf: (event: DemoEvent) => string): BreakdownRow[] {
  const groups = new Map<string, DemoEvent[]>();
  for (const event of events) {
    if (event.ack) continue;
    const key = keyOf(event);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return [...groups.entries()]
    .map(([key, rows]) => ({
      key,
      events: rows.length,
      activeUsers: new Set(rows.map((row) => row.userId)).size,
      activeLocations: new Set(rows.map((row) => row.locationId).filter(Boolean)).size,
    }))
    .sort((a, b) => b.events - a.events);
}

function topCategory(events: DemoEvent[]): string | null {
  return breakdown(events, (event) => event.category)[0]?.key ?? null;
}

function lastAt(events: DemoEvent[]): string | null {
  return events.reduce<string | null>((latest, event) => (latest && latest > event.at ? latest : event.at), null);
}

function bucketStart(at: string, bucket: "day" | "week" | "month"): string {
  const local = new Date(Date.parse(at) - UTC_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
  if (bucket === "day") return local;
  if (bucket === "month") return `${local.slice(0, 8)}01`;
  const dow = new Date(`${local}T12:00:00Z`).getUTCDay();
  return shiftDays(local, -((dow + 6) % 7));
}

function trendOf(events: DemoEvent[], from: string, to: string, days: number): TrendPoint[] {
  const bucket = bucketFor(days);
  const points = new Map<string, DemoEvent[]>();
  // Every bucket in the window, empty ones included, as the SQL's generate_series does.
  const first = bucketStart(new Date(Date.parse(from) + UTC_OFFSET_HOURS * 3_600_000).toISOString(), "day");
  const last = bucketStart(new Date(Date.parse(to) - 3_600_000).toISOString(), "day");
  for (let day = first; day <= last; day = shiftDays(day, 1)) {
    points.set(bucketStart(`${day}T12:00:00.000Z`, bucket), []);
  }
  for (const event of events) {
    if (event.ack) continue;
    const key = bucketStart(event.at, bucket);
    points.set(key, [...(points.get(key) ?? []), event]);
  }
  return [...points.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => ({ date, events: rows.length, activeUsers: new Set(rows.map((row) => row.userId)).size }));
}

function leadersOf(events: DemoEvent[], filters: AnalyticsFilters): LeaderRow[] {
  const locations = locationFilterFor(filters);
  return LEADERS.filter((leader) => {
    if (filters.role && leader.role !== filters.role) return false;
    if (filters.actorId && leader.id !== filters.actorId) return false;
    if (locations) {
      const theirs = leader.store ? [storeId(leader.store)] : (AREA_STORES[leader.id] ?? []).map(storeId);
      if (!theirs.some((id) => locations.includes(id))) return false;
    }
    return true;
  })
    .map((leader) => {
      const mine = events.filter((event) => event.userId === leader.id && !event.ack);
      const home = leader.store ? locationByCode(leader.store) : undefined;
      return {
        userId: leader.id,
        displayName: leader.name,
        role: leader.role,
        status: "active",
        locationId: home?.id ?? null,
        locationName: home?.name ?? null,
        district: home?.districtName ?? null,
        events: mine.length,
        forms: mine.filter((event) => event.category === "form_created").length,
        documents: mine.filter((event) => event.category === "document_upload").length,
        chatEvents: mine.filter((event) => CATEGORY_FEATURE[event.category] === "chat").length,
        topCategory: topCategory(mine),
        lastActive: lastAt(events.filter((event) => event.userId === leader.id)),
      };
    })
    .sort((a, b) => b.events - a.events || a.displayName.localeCompare(b.displayName));
}

function locationsOf(events: DemoEvent[], filters: AnalyticsFilters): LocationRow[] {
  const filter = locationFilterFor(filters);
  return COMPANY_LOCATIONS.filter((location) => filter === null || filter.includes(location.id))
    .map((location) => {
      const here = events.filter((event) => event.locationId === location.id && !event.ack);
      return {
        locationId: location.id,
        locationCode: location.code,
        locationName: location.name,
        district: location.districtName,
        events: here.length,
        activeLeaders: new Set(here.map((event) => event.userId)).size,
        assignedLeaders: LEADERS.filter((leader) => leader.store === location.code).length,
        forms: here.filter((event) => event.category === "form_created").length,
        reports: here.filter((event) => event.category === "report_upload" || event.category === "report_analysis").length,
        topCategory: topCategory(here),
        lastActive: lastAt(here),
      };
    })
    .sort((a, b) => b.events - a.events || a.locationName.localeCompare(b.locationName));
}

export function demoAnalyticsSnapshot(
  filters: AnalyticsFilters,
  today: string = businessToday(),
): AnalyticsSnapshot {
  const log = demoLog(today);
  const window = resolveWindow(filters, today);
  const current = select(log, filters, window.from, window.to);
  const previous = select(log, filters, window.previousFrom, window.previousTo);
  return {
    window,
    totals: totalsOf(current),
    previous: totalsOf(previous),
    trend: trendOf(current, window.from, window.to, window.days),
    byRole: breakdown(current, (event) => event.role),
    byCategory: breakdown(current, (event) => event.category),
    byFeature: breakdown(current, (event) => CATEGORY_FEATURE[event.category]),
    leaders: leadersOf(current, filters),
    locations: locationsOf(current, filters),
    districts: COMPANY_DISTRICTS.map((district) => ({ id: district.id, label: district.name })),
    locationOptions: COMPANY_LOCATIONS.map((location) => ({
      id: location.id,
      name: location.name,
      districtId: location.districtId,
      district: location.districtName,
    })),
    roster: [...LEADERS]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((leader) => ({ id: leader.id, name: leader.name, role: leader.role })),
  };
}

/* ------------------------------------------------------------ feedback --- */

function ratedIn(log: DemoLog, events: DemoEvent[]): { rating: DemoRating; event: DemoEvent }[] {
  const ids = new Set(events.map((event) => event.id));
  return currentRatings(log)
    .filter((rating) => ids.has(rating.eventIndex))
    .map((rating) => ({ rating, event: log.events[rating.eventIndex]! }));
}

/**
 * As live: the average, distribution and outcomes count OPEN feedback only
 * (pending, in review, not hidden); the queue line counts every status.
 */
function summaryOf(rated: { rating: DemoRating }[]): FeedbackSummary {
  const visible = rated.filter(({ rating }) => !rating.hidden);
  const shown = visible.filter(({ rating }) => rating.status === "pending" || rating.status === "in_review");
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as FeedbackSummary["distribution"];
  const outcomes = { yes: 0, partially: 0, no: 0 } as FeedbackSummary["outcomes"];
  const queue = { pending: 0, in_review: 0, resolved: 0, dismissed: 0 } as FeedbackSummary["queue"];
  for (const { rating } of shown) {
    distribution[rating.rating as 1 | 2 | 3 | 4 | 5] += 1;
    if (rating.outcome) outcomes[rating.outcome] += 1;
  }
  for (const { rating } of visible) queue[rating.status] += 1;
  return {
    responses: shown.length,
    averageRating:
      shown.length === 0 ? null : shown.reduce((sum, { rating }) => sum + rating.rating, 0) / shown.length,
    distribution,
    outcomes,
    queue,
    hidden: rated.length - visible.length,
  };
}

function topicsOf(events: DemoEvent[]): TopicRow[] {
  const groups = new Map<ActivityCategory, DemoEvent[]>();
  for (const event of events) {
    if (CATEGORY_FEATURE[event.category] !== "chat" && event.category !== "form_created") continue;
    groups.set(event.category, [...(groups.get(event.category) ?? []), event]);
  }
  return [...groups.entries()]
    .map(([category, rows]) => ({
      category,
      events: rows.filter((row) => !row.ack).length,
      activeUsers: new Set(rows.map((row) => row.userId)).size,
      acknowledgements: rows.filter((row) => row.ack).length,
      lastAsked: lastAt(rows),
    }))
    .sort((a, b) => b.events - a.events);
}

export function demoFeedbackSnapshot(
  filters: AnalyticsFilters,
  today: string = businessToday(),
): FeedbackSnapshot {
  const log = demoLog(today);
  const window = resolveWindow(filters, today);
  const current = select(log, filters, window.from, window.to);
  const previous = select(log, filters, window.previousFrom, window.previousTo);
  const rated = ratedIn(log, current);

  const surfaces: SurfaceRow[] = (["main_chat", "overview", "report", "unknown"] as ActivitySurface[])
    .map((surface) => {
      const here = current.filter((event) => event.surface === surface && !event.ack);
      const ratings = rated.filter(({ event, rating }) => event.surface === surface && !rating.hidden);
      return {
        surface,
        events: here.length,
        activeUsers: new Set(here.map((event) => event.userId)).size,
        rated: ratings.length,
        averageRating:
          ratings.length === 0 ? null : ratings.reduce((sum, { rating }) => sum + rating.rating, 0) / ratings.length,
      };
    })
    .filter((row) => row.events > 0);

  const when = new Map<string, WhenRow>();
  for (const event of current) {
    if (event.ack) continue;
    const key = `${event.dow}:${event.hour}`;
    const row = when.get(key) ?? { dayOfWeek: event.dow, hourOfDay: event.hour, events: 0 };
    row.events += 1;
    when.set(key, row);
  }

  const reportDays = current.filter((event) => event.category === "report_upload");
  const extraction = [
    { parserKey: "daily-sales-summary", share: 0.55, facts: 46 },
    { parserKey: "labor-hours-weekly", share: 0.3, facts: 112 },
    { parserKey: "inventory-count", share: 0.15, facts: 238 },
  ]
    .map((parser, index) => {
      const runs = Math.round(reportDays.length * parser.share);
      const failed = Math.round(runs * (index === 2 ? 0.08 : 0.02));
      return {
        parserKey: parser.parserKey,
        runs,
        succeeded: runs - failed,
        failed,
        withWarnings: Math.round(runs * 0.1),
        facts: (runs - failed) * parser.facts,
        locations: new Set(reportDays.map((event) => event.locationId).filter(Boolean)).size,
        lastRun: lastAt(reportDays),
      };
    })
    .filter((row) => row.runs > 0);

  return {
    window,
    summary: summaryOf(rated),
    previousSummary: summaryOf(ratedIn(log, previous)),
    surfaces,
    when: [...when.values()],
    topics: topicsOf(current),
    previousTopics: topicsOf(previous),
    extraction,
  };
}

export function demoFeedbackPage(
  filters: AnalyticsFilters,
  queue: FeedbackFilters,
  today: string = businessToday(),
): FeedbackPage {
  const log = demoLog(today);
  const window = resolveWindow(filters, today);
  const statuses = statusesFor(queue.status);
  const search = queue.search.trim().toLowerCase();
  const leaderName = new Map(LEADERS.map((leader) => [leader.id, leader.name]));
  const rows = ratedIn(log, select(log, filters, window.from, window.to))
    .filter(({ rating, event }) => {
      if (rating.hidden && !queue.includeHidden) return false;
      if (statuses && !statuses.includes(rating.status)) return false;
      if (queue.outcome && rating.outcome !== queue.outcome) return false;
      if (queue.rating && rating.rating !== queue.rating) return false;
      if (queue.surface && event.surface !== queue.surface) return false;
      if (search && !rating.comment.toLowerCase().includes(search)) return false;
      return true;
    })
    .sort((a, b) => b.event.at.localeCompare(a.event.at));

  const items: FeedbackItem[] = rows
    .slice((queue.page - 1) * FEEDBACK_PAGE_SIZE, queue.page * FEEDBACK_PAGE_SIZE)
    .map(({ rating, event }) => {
      const change = changes().get(rating.id);
      const location = locationById(event.locationId);
      const closed = rating.status === "resolved" || rating.status === "dismissed";
      return {
        id: rating.id,
        turnId: `demo-turn-${event.id}`,
        rating: rating.rating,
        gotWhatNeeded: rating.outcome,
        comment: rating.comment,
        status: rating.status,
        resolutionNote: rating.resolutionNote,
        resolvedAt: closed ? (change?.at ?? event.at) : null,
        resolvedByName: closed ? "Augustin Pryce" : null,
        hiddenAt: rating.hidden ? (change?.at ?? event.at) : null,
        hiddenByName: rating.hidden ? "Augustin Pryce" : null,
        createdAt: event.at,
        updatedAt: change?.at ?? event.at,
        occurredAt: event.at,
        surface: event.surface,
        category: event.category,
        succeeded: event.succeeded,
        role: event.role,
        displayName: leaderName.get(event.userId) ?? null,
        locationName: location?.name ?? null,
        district: location?.districtName ?? null,
      };
    });

  return { items, total: rows.length, page: queue.page, pageSize: FEEDBACK_PAGE_SIZE };
}
