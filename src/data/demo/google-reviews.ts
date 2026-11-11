import { APPROVED_GOOGLE_STORES } from "@/config/company/google-reviews";
import { centralMidnight, centralToday, daysInMonthOf, previousMonth } from "@/lib/google-reviews/goals";
import type { GoogleReviewsSample, GoogleReviewsSampleReview } from "@/lib/google-reviews/sample-views";
import type { RunRow } from "@/lib/google-reviews/views";

/**
 * ============================================================================
 * GOOGLE REVIEWS — INVENTED DEMO SET
 * ============================================================================
 *
 * Demo builds only (named solely by `lib/demo/runtime.demo.ts`). Every review,
 * reviewer, reply and count here is INVENTED: reviewer names are a first name
 * and an initial chosen at random from a generic list, and the review text is
 * written for the demo. The seven stores are the approved Business Profiles,
 * so the screens read like the real integration, but none of these figures was
 * read from Google.
 *
 * GENERATED, NOT HAND-WRITTEN, and pinned to TODAY (Central) the way the sister
 * app's demo shifts its reviews: the current month always has a goal race in
 * progress, this week always has reviews in it, and the history runs two years
 * back. A seeded generator keeps it identical on every load of the same day.
 */

/** Per store: typical reviews a month, this month's qualifying pace (by day 10), rating skew, months open. */
const PROFILES: Record<string, { monthly: number; pace10: number; fiveStar: number; months: number }> = {
  "219": { monthly: 13, pace10: 11, fiveStar: 0.8, months: 24 },
  "225": { monthly: 9, pace10: 6, fiveStar: 0.74, months: 24 },
  "236": { monthly: 7, pace10: 4, fiveStar: 0.7, months: 24 },
  "264": { monthly: 11, pace10: 8, fiveStar: 0.78, months: 24 },
  "338": { monthly: 6, pace10: 3, fiveStar: 0.66, months: 14 },
  "66": { monthly: 5, pace10: 2, fiveStar: 0.72, months: 24 },
  "67": { monthly: 8, pace10: 5, fiveStar: 0.76, months: 24 },
};

const FIRST = [
  "Avery", "Brooke", "Caleb", "Dana", "Elena", "Felix", "Grace", "Hannah", "Isaac", "Jada", "Kendra", "Logan",
  "Maya", "Nolan", "Olivia", "Priya", "Quinn", "Rosa", "Sam", "Tessa", "Uma", "Violet", "Wes", "Xavier", "Yara", "Zoe",
  "Carmen", "Derek", "Ivy", "Marcus", "Nina", "Owen", "Paige", "Reed", "Sienna", "Trent",
];

const TEXT: Record<number, readonly string[]> = {
  5: [
    "The Makers were so friendly and walked us through every scent. Left with way more soap than planned!",
    "Best smelling store in town. The bath bombs are huge and the staff let my kids pick their own.",
    "Made our own sugar scrub at the scent bar — such a fun afternoon. Will be back for a birthday party.",
    "Love the laundry soap, it's the only thing that doesn't irritate my skin. Staff always remembers me.",
    "Clean, bright store and the team was genuinely helpful finding a gift. Wrapped it for me too.",
    "We booked a Makery class for my daughter's birthday and it was perfect from start to finish.",
    "Whipped soap is my new obsession. The Maker on shift had great recommendations.",
    "Quick in and out, great samples, and they had the seasonal scent I was looking for.",
    "Five stars for the customer service alone. They fixed an online order mix-up in two minutes.",
    "Everything is made right there in the store and you can tell. Smells amazing when you walk in.",
    "Fun gift shopping — the staff put together a little bundle for my mom on a budget.",
    "Friendly team, spotless store, and the plant-based soaps are fantastic.",
  ],
  4: [
    "Great products and a nice team. It was busy on Saturday so we waited a bit at the register.",
    "Love the soaps, a little pricey but they last a long time.",
    "Good selection. Wish they had more unscented options but staff was helpful.",
    "Nice store, fun Makery experience. Parking was a little tight.",
    "Staff was helpful and the bath bombs were great. Our favourite scent was sold out though.",
  ],
  3: [
    "Products are nice but the store felt understaffed when we visited.",
    "Okay experience. The scent I wanted was out of stock and nobody could say when it would be back.",
    "Decent, but the Makery class started late and felt rushed.",
  ],
  2: [
    "Waited a long time to check out and the line wasn't moving. Soap is good though.",
    "The bar I bought cracked after a week. Store was nice but I expected better.",
  ],
  1: [
    "Called ahead to check stock, was told yes, drove over and it was gone.",
    "Nobody greeted us and we couldn't find help. Left without buying anything.",
  ],
};

const REPLY: Record<"high" | "mid" | "low", readonly string[]> = {
  high: [
    "Thank you so much for visiting! We're so glad you loved it — see you next time.",
    "This made our day! Thanks for shopping with us and for the kind words about our Makers.",
    "Thanks for the review! We can't wait to see what you pick out next time.",
  ],
  mid: [
    "Thanks for the feedback! We're passing this along to the team and hope to see you again soon.",
    "We appreciate you stopping by and sharing this — we'll work on it.",
  ],
  low: [
    "We're sorry about your visit. Please ask for the store manager next time — we'd love to make it right.",
    "Thank you for letting us know. We've shared this with the team and would like the chance to do better.",
  ],
};

/** mulberry32: a tiny deterministic generator. */
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

const pick = <T,>(rand: () => number, list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function rating(rand: () => number, fiveStar: number): number {
  const x = rand();
  if (x < fiveStar) return 5;
  if (x < fiveStar + 0.14) return 4;
  if (x < fiveStar + 0.19) return 3;
  if (x < fiveStar + 0.22) return 2;
  return 1;
}

/** A store-opening-hours instant on a Central day. */
function instantOn(day: string, rand: () => number): number {
  return Date.parse(centralMidnight(day)) + (10 + rand() * 9.5) * HOUR;
}

export function buildGoogleReviewsSample(now: Date = new Date()): GoogleReviewsSample {
  const today = centralToday(now);
  const nowMs = now.getTime();
  const daySeed = Number(today.replaceAll("-", ""));
  const reviews: GoogleReviewsSampleReview[] = [];

  // Months back from this one: [current, previous, ...].
  const months: string[] = [today.slice(0, 7)];
  while (months.length < 24) months.push(previousMonth(months[months.length - 1]!));

  for (const store of APPROVED_GOOGLE_STORES) {
    const profile = PROFILES[store.code] ?? { monthly: 6, pace10: 4, fiveStar: 0.72, months: 24 };
    const rand = seeded(daySeed * 31 + Number(store.code));
    let n = 0;
    const add = (createdMs: number, stars: number) => {
      n += 1;
      const age = nowMs - createdMs;
      const comment = stars >= 4 && rand() < 0.22 ? null : pick(rand, TEXT[stars]!);
      // Older reviews are almost all answered; the last few days are the queue.
      const replied = age > 5 * DAY ? rand() < (stars <= 2 ? 0.98 : 0.9) : age > 2 * DAY && stars <= 2 ? true : rand() < 0.25;
      const replyMs = Math.min(createdMs + (0.3 + rand() * 2.5) * DAY, nowMs - HOUR);
      const created = new Date(createdMs).toISOString();
      reviews.push({
        id: `demo-${store.code}-${String(n).padStart(4, "0")}`,
        storeCode: store.code,
        starRating: stars,
        comment,
        reviewerName: rand() < 0.04 ? null : `${pick(rand, FIRST)} ${String.fromCharCode(65 + Math.floor(rand() * 26))}.`,
        createdAt: created,
        updatedAt: created,
        replyComment: replied && replyMs > createdMs ? pick(rand, REPLY[stars >= 4 ? "high" : stars === 3 ? "mid" : "low"]) : null,
        replyUpdatedAt: replied && replyMs > createdMs ? new Date(replyMs).toISOString() : null,
        removedAt: null,
      });
    };

    // THE CURRENT MONTH: a set pace of qualifying reviews, spread over the days so far, plus the odd low one.
    const dayOfMonth = Number(today.slice(8, 10));
    const elapsed = dayOfMonth - 1;
    const qualifying = elapsed < 10 ? Math.round((profile.pace10 * elapsed) / 10) : profile.pace10 + Math.round(((elapsed - 10) * profile.pace10) / 20);
    for (let i = 0; i < qualifying; i++) {
      // Weighted toward the start of the month, never later than an hour ago.
      const day = `${today.slice(0, 8)}${String(1 + Math.floor(((i + rand()) / Math.max(qualifying, 1)) * dayOfMonth)).padStart(2, "0")}`;
      const at = Math.min(instantOn(day > today ? today : day, rand), nowMs - HOUR * (1 + rand() * 3));
      add(at, rand() < 0.8 ? 5 : rand() < 0.75 ? 4 : 3);
    }
    if (elapsed >= 6 && rand() < 0.5) add(instantOn(`${today.slice(0, 8)}0${2 + Math.floor(rand() * 4)}`, rand), rand() < 0.5 ? 2 : 1);

    // EARLIER MONTHS: the store's usual volume with some month-to-month swing (December busiest).
    for (let m = 1; m < Math.min(profile.months, months.length); m++) {
      const month = months[m]!;
      const days = daysInMonthOf(`${month}-01`);
      const holiday = month.endsWith("-12") ? 1.6 : month.endsWith("-11") ? 1.25 : 1;
      const count = Math.max(1, Math.round(profile.monthly * holiday * (0.75 + rand() * 0.5)));
      for (let i = 0; i < count; i++) {
        const day = `${month}-${String(1 + Math.floor(rand() * days)).padStart(2, "0")}`;
        add(instantOn(day, rand), rating(rand, profile.fiveStar));
      }
    }
  }

  // Two old reviews Google stopped returning (shown only under "No longer returned").
  for (const [i, code] of ["225", "67"].entries()) {
    const index = reviews.findIndex((r, k) => k > 40 * (i + 1) && r.storeCode === code && r.starRating === 1);
    if (index >= 0) reviews[index] = { ...reviews[index]!, removedAt: new Date(Date.parse(reviews[index]!.createdAt) + 9 * DAY).toISOString() };
  }

  // Counting toward the monthly goal began six months ago (an administrator's reporting cutoff).
  let countMonth = months[0]!;
  for (let i = 0; i < 6; i++) countMonth = previousMonth(countMonth);
  const countFrom = centralMidnight(`${countMonth}-01`);

  // Scheduled sync every six hours; the latest finished a little after the last boundary.
  const runs: RunRow[] = [];
  const lastBoundary = Math.floor(nowMs / (6 * HOUR)) * 6 * HOUR;
  const live = reviews.filter((r) => r.removedAt === null);
  for (let i = 0; i < 10; i++) {
    const started = lastBoundary - i * 6 * HOUR + 2 * 60 * 1000;
    const fresh = live.filter((r) => Date.parse(r.createdAt) <= started && Date.parse(r.createdAt) > started - 6 * HOUR).length;
    runs.push({
      id: `demo-run-${i + 1}`,
      startedAt: new Date(started).toISOString(),
      finishedAt: new Date(started + (38 + ((i * 7) % 20)) * 1000).toISOString(),
      status: "succeeded",
      mode: "save",
      requestedBy: i === 4 ? "demo-owner@demo.invalid" : "cron:google-reviews",
      locationsAttempted: 7,
      locationsComplete: 7,
      reviewsFetched: live.filter((r) => Date.parse(r.createdAt) <= started).length,
      reviewsInserted: fresh,
      reviewsUpdated: i % 3 === 0 ? 1 : 0,
      reviewsMarkedRemoved: 0,
      errorCode: null,
    });
  }

  return {
    reviews,
    goals: APPROVED_GOOGLE_STORES.map((s) => ({ storeCode: s.code, monthlyTarget: 10, countFrom })),
    connection: {
      state: "active",
      connectedAt: new Date(Date.parse(countFrom) - 12 * DAY).toISOString(),
      connectedBy: "demo-owner@demo.invalid",
      lastUsedAt: runs[0]!.finishedAt,
    },
    runs,
    confirmedStores: ["338"],
  };
}
