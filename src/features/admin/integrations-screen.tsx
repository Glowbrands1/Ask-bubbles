"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpen, Info, Settings2, Star, Users } from "lucide-react";

import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { PageHeader, PageShell, SectionHeader } from "@/components/ui/layout";
import { Dialog, DialogActions, DialogClose, DialogContent } from "@/components/ui/overlays";
import { BROWSER_STORAGE_INTEGRATION } from "@/data/integrations";
import { IntegrationCard } from "./integration-card";
import { ACTIVE_BRAND } from "@/lib/brand";
import { isDemoMode } from "@/lib/config/runtime";
import { useAppStore } from "@/lib/store/app-store";
import type { Integration } from "@/types";
import { ServiceStatusPanel } from "./service-status";

const CATEGORY_LABEL: Record<Integration["category"], string> = {
  ai: "Assistant",
  documents: "Documents",
  reporting: "Reporting",
  reviews: "Reviews",
  communication: "Communication",
  storage: "Storage",
};

/**
 * DEMO BUILDS ONLY: the two integrations the demo shows as connected, each
 * backed by the demo runtime's labelled sample (see the screens they open).
 * A live build lists neither here; their status there is measured on their
 * own screens.
 */
const DEMO_CONNECTED: readonly (Integration & { href: string })[] = [
  {
    id: "int-demo-google-reviews",
    name: "Google Reviews",
    vendor: "Google Business Profile",
    description: "All seven approved Business Profiles linked. Reviews sync every six hours, read-only.",
    status: "connected",
    unlocks: "The Google Reviews dashboard: monthly goal progress, the store leaderboard, rating mix and every review.",
    category: "reviews",
    iconKey: "star",
    notes: "Demo: the connection, sync history and reviews are invented. Nothing is read from Google.",
    href: "/admin/integrations/google-reviews",
  },
  {
    id: "int-demo-reporting",
    name: "Store reporting",
    vendor: "Weekly store figures",
    description: "Weekly sales, labor and Makery figures for every store, refreshed each Monday.",
    status: "connected",
    unlocks: "The Store Sales and Labor & Productivity reports, scoped to each manager's stores.",
    category: "reporting",
    iconKey: "bar-chart-3",
    notes: "Demo: every figure in Reports is invented. No store system is read.",
    href: "/reports",
  },
];

export function IntegrationsScreen() {
  const { storageAvailable } = useAppStore();
  const [selected, setSelected] = useState<Integration | null>(null);

  /*
   * ONE REAL CARD, AND ITS STATUS IS MEASURED. Everything else on this screen
   * that described a connection was a roadmap; this is the browser's own
   * storage, reported from `storageAvailable`.
   */
  const connected: Integration[] = isDemoMode()
    ? [...DEMO_CONNECTED, BROWSER_STORAGE_INTEGRATION]
    : [BROWSER_STORAGE_INTEGRATION];
  const openHref = (integration: Integration) => DEMO_CONNECTED.find((entry) => entry.id === integration.id)?.href ?? null;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Admin"
        title="Integrations"
        description={`What ${ACTIVE_BRAND.productName} connects to, and the live status of each connection. Nothing on this page is faked.`}
      />

      {/* Live configuration first: it is the section an administrator actually
          needs, and it reflects this deployment rather than the roadmap. */}
      <ServiceStatusPanel />

      <Notice tone="accent" icon={<Users />} className="mb-6">
        <span className="font-semibold">Woven</span> employee sync keeps an observe-only copy of
        who works where, and what changed.{" "}
        <Link
          href="/admin/integrations/woven"
          className="font-semibold underline underline-offset-4"
        >
          Open the Woven Employee Sync screen
        </Link>{" "}
        for the directory, changes, sync history, mappings and access preview.
      </Notice>

      <Notice tone="accent" icon={<BookOpen />} className="mb-6">
        <span className="font-semibold">Woven</span> knowledge sync keeps the knowledge base&apos;s policies,
        handbooks and training current from Woven, every week.{" "}
        <Link
          href="/admin/integrations/woven-knowledge"
          className="font-semibold underline underline-offset-4"
        >
          Open the Woven Knowledge Sync screen
        </Link>{" "}
        to set it up or check on it.
      </Notice>

      <Notice tone="accent" icon={<Star />} className="mb-6">
        <span className="font-semibold">Google Reviews</span> reads reviews for Buff City Soap&apos;s seven
        approved Business Profiles, read-only.{" "}
        <Link
          href="/admin/integrations/google-reviews"
          className="font-semibold underline underline-offset-4"
        >
          Open the Google Reviews screen
        </Link>{" "}
        to connect Google and see reviews by store.
      </Notice>

      <SectionHeader
        title="Connected"
        description="Working today, with no account or paid service required."
      />
      <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {connected.map((integration) => (
          <IntegrationCard
            key={integration.id}
            integration={{
              ...integration,
              status:
                integration.id === BROWSER_STORAGE_INTEGRATION.id
                  ? storageAvailable
                    ? "connected"
                    : "not_connected"
                  : integration.status,
            }}
            onOpen={setSelected}
          />
        ))}
      </div>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        {selected ? (
          <DialogContent
            title={selected.name}
            description={`${selected.vendor} · ${CATEGORY_LABEL[selected.category]}`}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                tone={selected.status === "connected" ? "ready" : "neutral"}
                size="sm"
              >
                <StatusDot />
                {selected.status === "connected" ? "Connected" : "Not connected"}
              </Badge>
            </div>

            <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
              {selected.description}
            </p>

            <div className="mt-4 rounded-[var(--radius-sm)] border border-border bg-surface-muted px-3.5 py-3">
              <p className="eyebrow">What connecting unlocks</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">
                {selected.unlocks}
              </p>
            </div>

            {selected.notes ? (
              <Notice tone="neutral" icon={<Info />} className="mt-4">
                {selected.notes}
              </Notice>
            ) : null}

            <DialogActions>
              <DialogClose asChild>
                <Button variant="ghost">Close</Button>
              </DialogClose>
              {openHref(selected) ? (
                <Button asChild>
                  <Link href={openHref(selected)!}>
                    <Settings2 />
                    Open
                  </Link>
                </Button>
              ) : (
                <Button disabled={selected.status === "connected"}>
                  <Settings2 />
                  {selected.status === "connected"
                    ? "Already connected"
                    : "Configure (coming later)"}
                </Button>
              )}
            </DialogActions>
          </DialogContent>
        ) : null}
      </Dialog>
    </PageShell>
  );
}
