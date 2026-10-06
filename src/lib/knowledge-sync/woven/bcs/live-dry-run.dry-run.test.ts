import { describe, expect, it } from "vitest";

import { MemoryKnowledgeSink, MemoryKnowledgeSyncStore } from "../../memory-store";
import { readWovenKnowledgeConfig } from "../config";
import { WovenTeamClient } from "../http";
import { createWovenKnowledgeConnector, readOnlySink, runWovenKnowledgeSync } from "../sync";

/**
 * ============================================================================
 * BUFF CITY SOAP WOVEN KNOWLEDGE — LIVE DRY RUN FROM A TERMINAL
 * ============================================================================
 *
 * The Buff City Soap connector's dry run (`mode: "preview"`) against the real
 * Woven, from a developer's machine. Skipped unless WOVEN_KNOWLEDGE_LIVE_DRY_RUN=1.
 *
 * WRITES NOTHING, ANYWHERE: nothing to Woven (only verified reads), and no
 * Supabase at all — the manifest store is in memory and the knowledge sink
 * refuses every write. No knowledge document, embedding, storage file or
 * removal can result. File Library downloads stay OFF unless
 * WOVEN_BCS_FILE_LIBRARY_DOWNLOAD_ENABLED is set (do not set it for this run).
 *
 * Put the credentials in the SHELL, not in a file that could be committed,
 * and not on the command line where they would land in shell history:
 *
 *   read -r  WOVEN_BCS_USERNAME && export WOVEN_BCS_USERNAME
 *   read -rs WOVEN_BCS_PASSWORD && export WOVEN_BCS_PASSWORD
 *   export WOVEN_BCS_COMPANY_ID=55839F24-9241-418C-8405-37BAF9A42A87
 *   WOVEN_KNOWLEDGE_LIVE_DRY_RUN=1 WOVEN_KNOWLEDGE_SYNC_ENABLED=true npm run dry-run:woven-knowledge
 *
 * Prints the report and the dry-run plan: counts, titles, status labels and
 * reason codes. Never a cookie, token, password, signed URL or document text.
 */

const enabled = process.env.WOVEN_KNOWLEDGE_LIVE_DRY_RUN === "1";

describe.skipIf(!enabled)("live Buff City Soap Woven dry run (read-only)", () => {
  it("signs in, proves the company, reads every source, classifies — and writes nothing", { timeout: 600_000 }, async () => {
    const config = readWovenKnowledgeConfig();
    expect(config.problems, "configuration problems").toEqual([]);
    expect(config.missingCredentials, "variables missing").toEqual([]);
    expect(config.downloads, "downloads must stay off for the dry run").toEqual({ fileLibrary: false });

    const sink = new MemoryKnowledgeSink();
    const outcome = await runWovenKnowledgeSync(
      { mode: "preview", trigger: "manual", requestedBy: "cli:dry-run" },
      {
        config,
        store: new MemoryKnowledgeSyncStore(),
        sink: readOnlySink(sink),
        connector: createWovenKnowledgeConnector(config, new WovenTeamClient({ baseUrl: config.baseUrl, deadlineAt: Date.now() + 540_000 })),
      },
    );
    console.log(JSON.stringify(outcome, null, 2));
    expect(sink.ingestCalls + sink.metadataCalls + sink.retireCalls).toBe(0);
    expect(outcome.status, "dry run outcome").toMatch(/^succeeded/);
  });
});
