import type { SinkMetadata } from "../ports";
import { CONTENT_TYPE_LABEL, type ContentType, type ManifestItem } from "../types";

/**
 * How a Woven item is filed in Ask Bubbles' library. The category decides which
 * shelf it sits on; the tags mark its origin so it is recognisable in the
 * Knowledge Base screen and in search filters.
 */
const CATEGORY: Record<ContentType, string> = {
  policy: "policies_compliance",
  handbook: "policies_compliance",
  procedure: "operations",
  file_library: "other",
  knowledge_element: "training",
  course: "training",
  communication: "other",
};

const SINGULAR: Record<ContentType, string> = {
  policy: "Policy",
  handbook: "Handbook",
  procedure: "Procedure",
  file_library: "File Library document",
  knowledge_element: "Knowledge Element",
  course: "Course",
  communication: "Communication",
};

export function describeWovenItem(item: ManifestItem): SinkMetadata {
  const updated = item.sourceUpdatedAt ? ` Last updated in Woven ${item.sourceUpdatedAt.slice(0, 10)}.` : "";
  return {
    title: item.title.trim() || `${SINGULAR[item.contentType]} from Woven`,
    description: `${SINGULAR[item.contentType]} synced from Woven (${CONTENT_TYPE_LABEL[item.contentType]}).${updated}`.slice(0, 1000),
    category: CATEGORY[item.contentType],
    tags: ["woven", `woven-${item.contentType.replace("_", "-")}`],
  };
}
