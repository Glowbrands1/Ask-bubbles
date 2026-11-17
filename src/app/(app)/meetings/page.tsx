import { notFound, redirect } from "next/navigation";

import { listMyMeetings } from "@/features/l10/data.server";
import { requireAuthenticatedPage } from "@/lib/auth/page";

export const dynamic = "force-dynamic";

/** /meetings: straight to the first meeting this person may open here (the BCS DM L10, else the BCS GM L10); nobody else has a page. */
export default async function MeetingsIndex() {
  await requireAuthenticatedPage();
  const [first] = await listMyMeetings();
  if (!first) notFound();
  redirect(`/meetings/${first.key}`);
}
