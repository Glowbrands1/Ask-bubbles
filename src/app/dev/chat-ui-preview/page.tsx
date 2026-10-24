import { notFound } from "next/navigation";

import { ChatUiPreview } from "./preview";

/** Review page for the flagged chat controls. Absent unless CHAT_UI_PREVIEW=1. */
export default function ChatUiPreviewPage() {
  if (process.env.CHAT_UI_PREVIEW !== "1") notFound();
  return <ChatUiPreview />;
}
