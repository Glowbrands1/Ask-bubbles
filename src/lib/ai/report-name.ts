import { REPORT_REGISTRY } from "@/lib/reporting/registry";

/*
 * REPORT_NAME_NOT_A_PERSON_ENABLED (the sibling app's live QA, 1 Nov 2026):
 * "Show me the most recent <report> and what I need to focus on today." saved
 * the report's name as the conversation's employee there. This app's own report
 * names, read from the report registry (`config/company/reports.ts`), never a
 * list kept here, are never a person. The registry is empty today, so nothing
 * is matched until a report is added.
 */
function reportKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((word, index, words) => !(index === words.length - 1 && words.length > 1 && /^reports?$/.test(word)))
    .join(" ");
}

/** The whole candidate is one of the app's report names: "<Report>", "<Report> report". */
export function isReportName(name: string): boolean {
  const key = reportKey(name);
  if (key === "") return false;
  return REPORT_REGISTRY.some((report) => reportKey(report.label) === key);
}
