import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import rows from "@/test/fixtures/jba-manual-production-151.json";
import { manualChunkFromRow, type ManualChunkRow as ChunkRow } from "@/lib/knowledge/full-manual-load";

import { cleaningIncidentPhrase, readCaPolicy } from "./ca-policy";
import { describedManualSection } from "./named-policy-section";
import type { ManualChunk } from "./official-policy-manual";

vi.mock("server-only", () => ({}));

/**
 * ============================================================================
 * sf-s15: CLEANING LEFT UNDONE IS CARE AND CLEANING, CHOSEN BY THE CODE
 * (POLICY_CLEANING_INCIDENT_ENABLED; port from Ask Sunny)
 * ============================================================================
 *
 * QA's overnight scan, 4 Nov 2026, sf-s15, in the manager's exact words (the
 * person invented): "Write me a CA for Isolde Brannock for failing to complete
 * opening duties. Isolde did not complete daily cleaning duties. on november
 * 2, 2026". The card must cite Care and Cleaning of Equipment and Facilities
 * (p.21), not Late Opening, Attendance or the Standards of Conduct catch-all.
 * Until now the code never chose that section here; only the model could.
 *
 * Flag off: no cleaning reading and no described section (as on main). Flag
 * on: the code reads the cleaning, the task reading gives way, and the
 * manual's own Care and Cleaning heading is the section.
 */

const CHUNKS = (rows.chunks as ChunkRow[]).map(manualChunkFromRow) as unknown as readonly ManualChunk[];
const CARE = "Care and Cleaning of Equipment and Facilities";
const SF_S15 = "Write me a CA for Isolde Brannock for failing to complete opening duties. Isolde did not complete daily cleaning duties. on november 2, 2026";

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => vi.stubEnv("POLICY_CLEANING_INCIDENT_ENABLED", ""));
const on = () => vi.stubEnv("POLICY_CLEANING_INCIDENT_ENABLED", "true");

describe("sf-s15 (POLICY_CLEANING_INCIDENT_ENABLED)", () => {
  it("flag off: no cleaning reading, no Care and Cleaning section (main)", () => {
    expect(cleaningIncidentPhrase(SF_S15)).toBeNull();
    expect(describedManualSection({ text: SF_S15, chunks: CHUNKS })?.section.heading ?? null).not.toBe(CARE);
  });

  it("flag on: QA's wording is Care and Cleaning of Equipment and Facilities, p.21", () => {
    on();
    expect(cleaningIncidentPhrase(SF_S15)).toBe("did not complete daily cleaning");
    const reading = readCaPolicy(SF_S15);
    expect(reading.stated).toBeNull();
    expect(reading.topics).not.toContain("task");
    const described = describedManualSection({ text: SF_S15, chunks: CHUNKS });
    expect(described?.section.heading).toBe(CARE);
    expect(described?.section.page).toBe(21);
  });

  it("flag on: duties that are not cleaning stay the Standards of Conduct task reading", () => {
    on();
    const text = "Isolde Brannock's opening checklist didn't get done on 11-2-26.";
    expect(cleaningIncidentPhrase(text)).toBeNull();
    expect(readCaPolicy(text).topics).toContain("task");
  });

  it("flag on: a denial is not an incident", () => {
    on();
    expect(cleaningIncidentPhrase("Isolde Brannock never left the restrooms dirty; she was late on 11-2-26.")).toBeNull();
  });

  it("flag on: a policy the manager names still wins", () => {
    on();
    const text = "Write a CA for Isolde Brannock under the Standards of Conduct. She did not complete daily cleaning duties on 11-2-26.";
    expect(describedManualSection({ text, chunks: CHUNKS })?.section.heading ?? null).not.toBe(CARE);
  });
});
