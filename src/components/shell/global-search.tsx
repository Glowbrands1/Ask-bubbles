"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileStack, FileText, LayoutDashboard } from "lucide-react";

import { Input } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/feedback";
import { KNOWLEDGE_CATEGORY_LABEL } from "@/data/knowledge-taxonomy";
import { ACTIVE_BRAND } from "@/lib/brand";
import { useAppStore } from "@/lib/store/app-store";

import { NAV_SECTIONS } from "./navigation";

/**
 * Search across what this browser already holds: the screens on the rail,
 * the knowledge library the store loaded for this person, and their forms.
 * It sends nothing anywhere — every result is something the person could
 * already open.
 */
interface Hit {
  id: string;
  label: string;
  detail: string;
  href: string;
  kind: "screen" | "document" | "form";
}

const ICON = {
  screen: LayoutDashboard,
  document: FileText,
  form: FileStack,
};

const KIND_LABEL = {
  screen: "Screen",
  document: "Document",
  form: "Form",
};

export function GlobalSearch() {
  const { documents, forms } = useAppStore();
  const [query, setQuery] = useState("");

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const screens: Hit[] = NAV_SECTIONS.flatMap((section) =>
      section.items.map((item) => ({
        id: `screen-${item.href}`,
        label: item.label,
        detail: section.label,
        href: item.href,
        kind: "screen" as const,
      })),
    );

    const docHits: Hit[] = documents.map((doc) => ({
      id: `doc-${doc.id}`,
      label: doc.title,
      detail: KNOWLEDGE_CATEGORY_LABEL[doc.category],
      href: `/knowledge/document/${encodeURIComponent(doc.id)}`,
      kind: "document" as const,
    }));

    const formHits: Hit[] = forms.map((form) => ({
      id: `form-${form.id}`,
      label: `${form.employeeName} — ${form.templateName}`,
      detail: form.locationName,
      href: `/forms/monitoring?form=${form.id}`,
      kind: "form" as const,
    }));

    return [...screens, ...docHits, ...formHits]
      .filter(
        (hit) => hit.label.toLowerCase().includes(q) || hit.detail.toLowerCase().includes(q),
      )
      .slice(0, 24);
  }, [query, documents, forms]);

  return (
    <div>
      <Input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search screens, documents and forms…"
        aria-label={`Search ${ACTIVE_BRAND.productName}`}
      />

      <div className="mt-4">
        {query.trim().length < 2 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            Type at least two characters to search.
          </p>
        ) : hits.length === 0 ? (
          <EmptyState
            compact
            title="No matches"
            description={`Nothing in the screens, knowledge base or forms matches "${query.trim()}".`}
          />
        ) : (
          <ul className="space-y-1">
            {hits.map((hit) => {
              const Icon = ICON[hit.kind];
              return (
                <li key={hit.id}>
                  <Link
                    href={hit.href}
                    className="flex items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 transition-colors hover:bg-surface-muted"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-surface-muted text-muted-foreground">
                      <Icon className="size-3.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {hit.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{hit.detail}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-subtle-foreground">
                      {KIND_LABEL[hit.kind]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
