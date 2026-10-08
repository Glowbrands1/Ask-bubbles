import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MULTI_BRAND_MANUAL_TITLES, POLICY_MANUAL_BRAND_SCOPE } from "@/config/company/knowledge";
import { WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW } from "@/config/company/woven";
import { chunkSegments } from "@/lib/ingestion/chunking";
import { extractDocument } from "@/lib/ingestion/extract";
import { isMultiBrandManual, readManualForBrand } from "@/lib/knowledge/brand-sections";
import { findManualSection, manualDisplayTitle } from "@/lib/forms/official-policy-manual";
import { manualGroundedPolicies, policyFieldValue } from "@/lib/forms/policy-citation";

import { readWovenKnowledgeConfig } from "../config";
import { WovenTeamClient } from "../http";
import { createWovenKnowledgeConnector } from "../sync";

/**
 * ============================================================================
 * THE REAL JBA HANDBOOK, VERIFIED BEFORE RELEASE — READ-ONLY, FROM A TERMINAL
 * ============================================================================
 *
 * Skipped unless JBA_HANDBOOK_LIVE_VERIFY=1. Reads the one confirmed handbook
 * from Buff City Soap's own Woven company through the production connector
 * (sign-in, company guard, manage page, version download), then reads the
 * file IN MEMORY through the real extractor, chunker, brand reading, section
 * lookup and citation. WRITES NOTHING: no Supabase client is created, nothing
 * is stored, and Woven receives only the reads the sync itself makes.
 *
 * Needs Buff City Soap's Woven credentials in the shell (see
 * `live-dry-run.dry-run.test.ts`) and network access to `app.woven.team` and
 * `*.blob.core.windows.net`. Writes its report to JBA_HANDBOOK_VERIFY_OUT if
 * set: identity, size, SHA-256, the comparison with the approved copy, and the
 * check results — never a cookie, token, password or signed URL.
 */

const enabled = process.env.JBA_HANDBOOK_LIVE_VERIFY === "1";

/** The confirmed handbook. */
const HANDBOOK_ID = WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW.confirmedEntityIds[0]!;
const TITLE = "2025 JBA Policy Manual - Edited 5-2025";

/**
 * THE APPROVED COPY: the reference platform's Woven copy of the "Edited
 * 5.2025" manual — 712,866 bytes, this SHA-256 of its bytes (the same file the
 * reference platform's handbook and its policy attachment both carry).
 */
const APPROVED = { sizeBytes: 712_866, sha256: "7eaa18c063824dcc943567663c0face187247f035901475295bea4da79cdc080" } as const;

describe.skipIf(!enabled)("the confirmed JBA handbook, read-only", () => {
  it("is Buff City Soap's, the approved edition, and reads as Buff City Soap with page-cited sections", { timeout: 300_000 }, async () => {
    const report: Record<string, unknown> = { handbookId: HANDBOOK_ID };
    const finish = () => {
      if (process.env.JBA_HANDBOOK_VERIFY_OUT) writeFileSync(process.env.JBA_HANDBOOK_VERIFY_OUT, JSON.stringify(report, null, 1));
    };
    try {
      const config = readWovenKnowledgeConfig({ ...process.env, WOVEN_KNOWLEDGE_SYNC_ENABLED: "true" });
      expect(config.problems, "configuration problems").toEqual([]);
      const client = new WovenTeamClient({ baseUrl: config.baseUrl, deadlineAt: Date.now() + 280_000 });
      const connector = createWovenKnowledgeConnector(config, client);

      /* 1. SOURCE: Buff City Soap's own company, proved by Company ID. */
      const connection = await connector.connect();
      report.company = connection;
      expect(connection.companyVerified).toBe(true);

      /* 2. THE RECORD: listed, published, its current version. */
      const listing = await connector.list("handbook");
      if (!listing.ok) throw new Error(`handbook listing failed: ${listing.code}`);
      const record = listing.records.find((entry) => entry.entityId.toLowerCase() === HANDBOOK_ID.toLowerCase());
      expect(record, "the confirmed handbook is listed").toBeDefined();
      report.record = { title: record!.title, status: record!.status, publication: record!.publication, audience: record!.audience, updatedAt: record!.updatedAt, versionId: record!.versionId };
      expect(record!.title).toBe(TITLE);
      expect(record!.publication).toBe("published");
      const part = record!.parts[0]!;
      expect(part.retrieval.kind).toBe("available");

      /* 3. THE FILE, by the production download path. */
      const file = await connector.fetchPart({
        source: "woven",
        contentType: "handbook",
        entityId: record!.entityId,
        partKey: part.partKey,
        title: record!.title,
        locator: (part.retrieval as { locator: Record<string, string> }).locator,
        fileName: part.fileName,
        mimeType: part.mimeType,
      } as never);
      const sha256 = createHash("sha256").update(file.bytes).digest("hex");
      report.file = { fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.bytes.length, sha256 };
      report.identicalToApproved = file.bytes.length === APPROVED.sizeBytes && sha256 === APPROVED.sha256;

      /* 4. THE EDITION, read off the document itself. */
      const extracted = await extractDocument("pdf", file.bytes);
      const text = extracted.segments.map((segment) => segment.text).join("\n");
      report.pages = extracted.pageCount ?? null;
      report.editionMarkers = ["Edited 5.2025", "Edited 5-2025", "5/2025", "2025 JBA Policy Manual"].filter((marker) => text.includes(marker) || record!.title.includes(marker));

      /* 5. AS BUFF CITY SOAP READS IT — the same reading the provider applies. */
      const chunks = chunkSegments(extracted.segments);
      expect(isMultiBrandManual(record!.title, MULTI_BRAND_MANUAL_TITLES)).toBe(true);
      const read = readManualForBrand(chunks.map((chunk) => ({ content: chunk.content, headings: chunk.sections.map((section) => section.heading) })), POLICY_MANUAL_BRAND_SCOPE);
      const kept = read.join("\n");
      const otherBrandRules = kept
        .split("\n")
        .filter((line) => /Sun Tan City|\bSTC\b|Crunch/.test(line))
        .filter((line) => !/hired through Sun Tan|City, Crunch Fitness, and Buff City Soap|Group Fitness/.test(line));
      report.brandReading = {
        chunks: chunks.length,
        keptChunks: read.filter(Boolean).length,
        buffCitySoapBlocks: (kept.match(/^Buff City Soap:/gm) ?? []).length,
        officeBlocks: (kept.match(/^JB & Associates Office:/gm) ?? []).length,
        otherBrandLinesLeft: otherBrandRules.length,
        clientTanningChapterLeft: /Client Tanning Policies|Protecting the Client from Overexposing|One Tanner per Room/.test(kept),
      };
      expect(otherBrandRules, "other brands' rules left after the brand reading").toEqual([]);

      /* 6. A FORM'S CITATION: the dress code, verbatim, with the page the manual prints. */
      const manualChunks = chunks
        .map((chunk, index) => ({ chunkIndex: chunk.index, chunkId: `live-${chunk.index}`, locator: chunk.locator, page: chunk.page, printedPage: chunk.printedPage, section: chunk.section, sections: chunk.sections, content: read[index]! }))
        .filter((chunk) => chunk.content !== "");
      const section = findManualSection(manualChunks, ["Dress Code for The Company"]);
      expect(section, "the dress code section is found").not.toBeNull();
      const value = policyFieldValue(manualGroundedPolicies({ documentId: "live", documentTitle: record!.title, chunks: manualChunks }, [section!]))!;
      const [wording, source] = value.split("\n\nSource: ");
      report.citation = { displayTitle: manualDisplayTitle(record!.title), source, wordingStartsWith: wording!.slice(0, 90), verbatim: text.replace(/\s+/g, " ").includes(wording!.replace(/\s+/g, " ").trim()) };
      expect((report.citation as { verbatim: boolean }).verbatim).toBe(true);
      expect(source).toMatch(/^JBA Policy Manual — Dress Code for The Company, p\. \d+$/);
    } finally {
      finish();
    }
  });
});
