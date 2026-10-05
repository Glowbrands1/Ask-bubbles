/**
 * ============================================================================
 * FEATURE VISIBILITY (COMPANY CONFIGURATION)
 * ============================================================================
 *
 * Whole areas of the product this deployment shows. A feature that is off is
 * absent from navigation; its pages and routes still enforce their own
 * permissions, so turning a feature off is never the only thing protecting
 * it. Permissions decide WHO sees an enabled feature.
 */
export const COMPANY_FEATURES = {
  home: true,
  assistant: true,
  knowledge: true,
  forms: true,
  reports: true,
  history: true,
  analytics: true,
  aiUsage: true,
} as const;

export type CompanyFeature = keyof typeof COMPANY_FEATURES;

export function featureEnabled(feature: CompanyFeature): boolean {
  return COMPANY_FEATURES[feature];
}
