import { ShieldCheck } from "lucide-react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { ScrollTable, SectionHeader } from "@/components/ui/layout";
import type { LocationMappingRow, PositionMappingRow } from "@/lib/employees/woven/view-types";
import { LocationReviewForm, PositionReviewForm } from "./mapping-forms";
import { label, when } from "./format";

/**
 * MAPPINGS — Woven location → Ask Bubbles location, Woven position → role and scope.
 *
 * Reviewed here, APPLIED NOWHERE in phase one. A confirmed location labels the
 * directory and the change feed with a location; a confirmed, ranked position
 * lets a position change be called a confirmed promotion or demotion. Neither
 * changes a login, a role, a scope level, a primary location or location access.
 */

const LOCATION_TONE: Record<LocationMappingRow["status"], BadgeTone> = { mapped: "ready", unmapped: "attention", ignored: "neutral" };

export function MappingReview({
  locations,
  positions,
  actionsDisabled,
}: {
  locations: LocationMappingRow[];
  positions: PositionMappingRow[];
  actionsDisabled: boolean;
}) {
  const unmappedLocations = locations.filter((l) => l.status === "unmapped").length;
  const unmappedPositions = positions.filter((p) => p.status === "unmapped").length;

  return (
    <section aria-label="Mappings" className="flex flex-col gap-6">
      <Notice tone="primary" icon={<ShieldCheck />} title="Mappings are reviewed here and applied nowhere in this phase">
        A confirmed match is stored and used to label the directory and the change feed. No login, role, scope level, primary
        location or location access changes because of it.
      </Notice>

      <div>
        <SectionHeader
          title="Woven location → Ask Bubbles location"
          description={`${unmappedLocations} unmapped of ${locations.length}. A suggestion is an exact match of Woven's Number to a location number, leading zeros included — a person confirms every one.`}
        />
        {locations.length === 0 ? (
          <EmptyState title="No Woven locations seen yet" description="Locations are queued here by the first sync." />
        ) : (
          <ScrollTable>
            <table className="w-full text-left text-[12.5px]">
              <thead className="bg-surface-muted text-[11px] tracking-wide text-muted-foreground uppercase">
                <tr>
                  {["Woven location", "Number", "Woven district / region", "Employees", "Suggested location", "Mapped location", "Status", "Review"].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {locations.map((row) => (
                  <tr key={row.wovenLocationId} className="align-top">
                    <td className="px-3 py-2">
                      <span className="font-semibold text-foreground">{row.name ?? row.displayName ?? row.wovenLocationId}</span>
                      <br />
                      <span className="font-mono text-[11px] text-muted-foreground">{row.wovenLocationId}</span>
                      {row.isNonLocation ? <Badge tone="outline" size="sm" className="ml-1">non-location</Badge> : null}
                      {row.isClosed ? <Badge tone="outline" size="sm" className="ml-1">closed</Badge> : null}
                    </td>
                    <td className="px-3 py-2 font-mono">{row.number ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[row.districtName, row.regionName].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.employeeCount}</td>
                    <td className="px-3 py-2">
                      {row.isNonLocation && row.status === "unmapped"
                        ? "Suggest ignore"
                        : row.suggestedLocationCode
                          ? `${row.suggestedLocationCode} · ${row.suggestedLocationName ?? ""}`
                          : <span className="text-muted-foreground">No exact number match</span>}
                    </td>
                    <td className="px-3 py-2">{row.locationCode ? `${row.locationCode} · ${row.locationName ?? ""}` : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Badge tone={LOCATION_TONE[row.status]} size="sm">
                        {row.status}
                      </Badge>
                      {row.reviewedBy ? (
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {row.reviewedBy} · {when(row.reviewedAt)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <LocationReviewForm row={row} disabled={actionsDisabled} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        )}
      </div>

      <div>
        <SectionHeader
          title="Woven position → Ask Bubbles role and scope"
          description={`${unmappedPositions} unmapped of ${positions.length}. A position change is a confirmed promotion or demotion only when both positions are confirmed here with ranks; higher is more senior.`}
        />
        {positions.length === 0 ? (
          <EmptyState title="No Woven positions seen yet" description="Positions are queued here by the first sync; Woven has no positions list of its own." />
        ) : (
          <ScrollTable>
            <table className="w-full text-left text-[12.5px]">
              <thead className="bg-surface-muted text-[11px] tracking-wide text-muted-foreground uppercase">
                <tr>
                  {["Woven position", "Active employees", "Ask Bubbles role", "Scope level", "Rank", "Status", "Review"].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {positions.map((row) => (
                  <tr key={row.wovenPositionId} className="align-top">
                    <td className="px-3 py-2">
                      <span className="font-semibold text-foreground">{row.name ?? row.wovenPositionId}</span>
                      <br />
                      <span className="font-mono text-[11px] text-muted-foreground">{row.wovenPositionId}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.employeeCount}</td>
                    <td className="px-3 py-2">{row.role ? label(row.role) : "—"}</td>
                    <td className="px-3 py-2">{row.scopeLevel ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{row.hierarchyRank ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Badge tone={row.isConfirmed ? "ready" : row.status === "ignored" ? "neutral" : "attention"} size="sm">
                        {row.isConfirmed ? "confirmed" : row.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <PositionReviewForm row={row} disabled={actionsDisabled} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        )}
      </div>
    </section>
  );
}
