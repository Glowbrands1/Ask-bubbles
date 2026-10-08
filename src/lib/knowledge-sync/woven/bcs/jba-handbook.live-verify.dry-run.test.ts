import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MULTI_BRAND_MANUAL_TITLES, POLICY_MANUAL_BRAND_SCOPE } from "@/config/company/knowledge";
import { WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW } from "@/config/company/woven";
import { chunkSegments } from "@/lib/ingestion/chunking";
import { extractDocument } from "@/lib/ingestion/extract";
import { hashChunks } from "@/lib/ingestion/pipeline";
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
 * 5.2025" manual — the same file its handbook and its policy attachment both
 * carry — as its storage and knowledge records describe it (read 8 Oct 2026).
 *
 * Bytes are compared first. A different record can carry the same edition
 * re-saved (different bytes, same text), so the TEXT is compared too: the
 * extractor and chunker here are the same code as there, so the same text
 * gives the same chunk hash, the same character count and the same pages.
 */
const APPROVED = {
  sizeBytes: 712_866,
  sha256: "7eaa18c063824dcc943567663c0face187247f035901475295bea4da79cdc080",
  pdfPages: 51,
  lastPrintedPage: 50,
  characterCount: 139_485,
  chunkCount: 166,
  chunkHash: "e6cfba82280ebfe346a2a75f2ab5ad940fd5af5ae123aaf69733ad998cb0dab1",
} as const;

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

      /* 4. THE EDITION, read off the document itself, and compared with the approved copy's. */
      const extracted = await extractDocument("pdf", file.bytes);
      const text = extracted.segments.map((segment) => segment.text).join("\n");
      const chunks = chunkSegments(extracted.segments);
      const printedPages = chunks.map((chunk) => chunk.printedPage).filter((page): page is number => typeof page === "number");
      report.edition = {
        pdfPages: extracted.pageCount ?? null,
        lastPrintedPage: printedPages.length > 0 ? Math.max(...printedPages) : null,
        characterCount: extracted.characterCount,
        chunkCount: chunks.length,
        chunkHash: hashChunks(chunks),
        markers: ["Edited 5.2025", "Edited 5-2025", "5/2025", "2025 JBA Policy Manual"].filter((marker) => text.includes(marker) || record!.title.includes(marker)),
      };
      const edition = report.edition as { pdfPages: number | null; lastPrintedPage: number | null; characterCount: number; chunkCount: number; chunkHash: string };
      report.comparedWithApproved = {
        sameBytes: report.identicalToApproved,
        samePageCount: edition.pdfPages === APPROVED.pdfPages && edition.lastPrintedPage === APPROVED.lastPrintedPage,
        sameText: edition.chunkHash === APPROVED.chunkHash && edition.characterCount === APPROVED.characterCount && edition.chunkCount === APPROVED.chunkCount,
      };
      /* The edition must match in pages and text; identical bytes are reported, and are the strongest result. */
      expect(edition.pdfPages, "PDF pages").toBe(APPROVED.pdfPages);
      expect(edition.lastPrintedPage, "last printed page number").toBe(APPROVED.lastPrintedPage);
      expect(edition.chunkHash, "the approved edition's text").toBe(APPROVED.chunkHash);

      /* 5. AS BUFF CITY SOAP READS IT — the same reading the provider applies. */
      expect(isMultiBrandManual(record!.title, MULTI_BRAND_MANUAL_TITLES)).toBe(true);
      const read = readManualForBrand(chunks.map((chunk) => ({ content: chunk.content, headings: chunk.sections.map((section) => section.heading) })), POLICY_MANUAL_BRAND_SCOPE);
      const kept = read.join("\n");
      /*
       * THE TABLE OF CONTENTS IS NOT POLICY. Its entries name every chapter,
       * the other brands' included ("Crunch Fitness Specific Dress Code ....
       * 15"), with dot leaders and a page number. They are counted and
       * reported, not treated as a rule that survived the brand reading.
       */
      const isContentsEntry = (line: string) => /\.{8,}/.test(line);
      const otherBrand = (line: string) => /Sun Tan City|\bSTC\b|Crunch/.test(line);
      const policyLines = kept.split("\n").filter((line) => !isContentsEntry(line));
      const otherBrandRules = policyLines
        .filter(otherBrand)
        .filter((line) => !/hired through Sun Tan|City, Crunch Fitness, and Buff City Soap|Group Fitness/.test(line));
      const tanningChapter = /Client Tanning Policies|Protecting the Client from Overexposing|One Tanner per Room/;
      report.brandReading = {
        chunks: chunks.length,
        keptChunks: read.filter(Boolean).length,
        buffCitySoapBlocks: (kept.match(/^Buff City Soap:/gm) ?? []).length,
        officeBlocks: (kept.match(/^JB & Associates Office:/gm) ?? []).length,
        otherBrandLinesLeft: otherBrandRules.length,
        clientTanningChapterLeft: policyLines.some((line) => tanningChapter.test(line)),
        contentsEntriesNamingOtherBrands: kept.split("\n").filter((line) => isContentsEntry(line) && (otherBrand(line) || tanningChapter.test(line))).length,
      };
      expect(otherBrandRules, "other brands' rules left after the brand reading").toEqual([]);
      expect((report.brandReading as { clientTanningChapterLeft: boolean }).clientTanningChapterLeft, "the client-tanning chapter").toBe(false);

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

      /*
       * 7. EVERY SECTION BUFF CITY SOAP KEEPS IS CITABLE, with the page the
       *    manual prints for that heading, and every line it quotes is the
       *    manual's own (other brands' lines between them are left out, so the
       *    quotation as a whole need not be one unbroken passage). A heading
       *    with no text of its own — a chapter title followed at once by its
       *    first sub-section, a brand label, a cover line — cites its source
       *    only; those are listed, not failed.
       */
      const flat = (value: string) => value.replace(/\s+/g, " ").trim();
      const wholeText = flat(text);
      const keptHeadings = new Map<string, number>();
      for (const chunk of manualChunks) {
        for (const entry of chunk.sections ?? []) {
          if (entry.heading !== "Table of Contents" && !keptHeadings.has(entry.heading)) keptHeadings.set(entry.heading, entry.page);
        }
      }
      const uncitable: string[] = [];
      const notVerbatim: string[] = [];
      const wrongPage: string[] = [];
      const headingOnly: string[] = [];
      for (const [heading, page] of keptHeadings) {
        const found = findManualSection(manualChunks, [heading]);
        if (!found) {
          uncitable.push(heading);
          continue;
        }
        const cited = policyFieldValue(manualGroundedPolicies({ documentId: "live", documentTitle: record!.title, chunks: manualChunks }, [found]))!;
        const parts = cited.split("\n\nSource: ");
        const body = parts.length > 1 ? parts[0]! : "";
        const line = parts.length > 1 ? parts[1]! : cited.replace(/^Source: /, "");
        if (body.trim() === "") headingOnly.push(heading);
        const foreign = body.split("\n").map(flat).filter((entry) => entry !== "" && !wholeText.includes(entry));
        if (foreign.length > 0) notVerbatim.push(`${heading}: ${foreign.length} line(s)`);
        if (line !== `JBA Policy Manual — ${heading}, p. ${page}`) wrongPage.push(`${heading}: "${line}" (expected p. ${page})`);
      }
      const otherBrandChapters = [
        "Crunch Fitness Specific Dress Code",
        "Buddy Passes (Sun Tan City Employees ONLY)",
        "Client Tanning Policies and Regulations (STC & Crunch ONLY)",
        "Protecting the Client from Overexposing",
      ];
      const otherBrandCitable = otherBrandChapters.filter((heading) => {
        const found = findManualSection(manualChunks, [heading]);
        if (!found) return false;
        const cited = policyFieldValue(manualGroundedPolicies({ documentId: "live", documentTitle: record!.title, chunks: manualChunks }, [found])) ?? "";
        return cited.split("\n\nSource: ")[0]!.trim() !== "";
      });
      report.allSections = { sectionsKept: keptHeadings.size, cited: keptHeadings.size - uncitable.length, withWording: keptHeadings.size - uncitable.length - headingOnly.length, headingOnly, uncitable, notVerbatim, wrongPage, otherBrandCitable };
      expect(uncitable, "kept sections that cannot be cited").toEqual([]);
      expect(notVerbatim, "citations that are not the manual's own words").toEqual([]);
      expect(wrongPage, "citations with the wrong page").toEqual([]);
      expect(otherBrandCitable, "other brands' chapters cited with their wording").toEqual([]);
    } finally {
      finish();
    }
  });
});
