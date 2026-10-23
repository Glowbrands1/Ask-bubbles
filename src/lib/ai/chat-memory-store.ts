import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

import type { MemoryCue, MemoryFact } from "./chat-memory";

export async function recallMemory(userId: string): Promise<MemoryFact[]> {
  try {
    const admin = getSupabaseAdmin();
    const scoped = await admin
      .from("user_memory")
      .select("kind, key, value, source_conversation_id")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(12);
    const rows = !scoped.error && Array.isArray(scoped.data) ? scoped.data : null;
    const plain =
      rows ??
      (
        await admin
          .from("user_memory")
          .select("kind, key, value")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(12)
      ).data;
    if (!Array.isArray(plain)) return [];
    return plain
      .map((row) => ({
        kind: row.kind as MemoryFact["kind"],
        key: String(row.key ?? ""),
        value: String(row.value ?? ""),
        sourceConversationId:
          "source_conversation_id" in row ? ((row.source_conversation_id as string | null) ?? null) : null,
      }))
      .filter((row) => row.kind === "store" || row.kind === "employee" || row.kind === "preference");
  } catch {
    return [];
  }
}

export async function rememberFact(
  input: MemoryCue & { userId: string; sourceConversationId: string | null },
): Promise<void> {
  const { error } = await getSupabaseAdmin().from("user_memory").upsert(
    {
      user_id: input.userId,
      kind: input.kind,
      key: input.key,
      value: input.value,
      source_conversation_id: input.sourceConversationId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,kind,key" },
  );
  if (error) throw new Error("The memory note could not be saved.");
}
