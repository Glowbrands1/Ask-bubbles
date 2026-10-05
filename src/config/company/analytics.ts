import type { ActivityCategory } from "@/lib/analytics/taxonomy";

/**
 * ============================================================================
 * WHAT PEOPLE ASK ABOUT — the topic vocabulary for adoption analytics
 * ============================================================================
 *
 * Company configuration. Used ONLY to label a chat turn for the Analytics
 * screen when nothing stronger (a proposed form, a report context, the cited
 * documents' own categories) says what it was about. The question text is
 * read transiently and never stored.
 *
 * Neutral retail vocabulary until Buff City Soap's own topics are known.
 * Longest phrase wins, so "return policy" is policy rather than operations.
 */
export const COMPANY_TOPIC_TERMS: Readonly<Partial<Record<ActivityCategory, readonly string[]>>> = {
  team_guidance: [
    "coaching", "coach", "feedback", "conversation with", "difficult conversation",
    "performance", "recognition", "recognize", "motivate", "one on one",
  ],
  policy_question: [
    "policy", "handbook", "dress code", "attendance", "time off", "pto", "call out",
    "return policy", "refund", "exchange", "code of conduct",
  ],
  store_operations: [
    "open the store", "close the store", "opening", "closing", "register", "cash drawer",
    "inventory", "shipment", "receiving", "merchandising", "display", "schedule", "scheduling",
  ],
  equipment_procedures: ["equipment", "maintenance", "broken", "repair", "cleaning", "procedure"],
  training: ["training", "onboard training", "learn", "course", "module", "certification"],
  guest_experience: [
    "guest", "customer", "complaint", "upsell", "recommend", "loyalty", "gift card", "ingredient",
    "allergy", "fragrance", "product",
  ],
  pay_benefits: ["pay", "payroll", "paycheck", "bonus", "commission", "benefits", "overtime"],
  safety_compliance: ["safety", "injury", "incident", "sds", "chemical", "lye", "spill", "osha"],
  hiring_onboarding: ["hiring", "hire", "interview", "candidate", "new hire", "onboarding", "applicant"],
};
