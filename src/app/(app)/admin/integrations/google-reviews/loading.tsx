import { Skeleton, SkeletonCard, SkeletonRows } from "@/components/ui/feedback";
import { PageShell } from "@/components/ui/layout";

export default function Loading() {
  return (
    <PageShell aria-busy="true" aria-label="Loading Google Reviews">
      <Skeleton className="mb-6 h-10 w-64" />
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((n) => (
          <SkeletonCard key={n} lines={2} />
        ))}
      </div>
      <SkeletonRows rows={7} />
    </PageShell>
  );
}
