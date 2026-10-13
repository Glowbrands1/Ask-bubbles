import { SkeletonCard } from "@/components/ui/feedback";

export default function ReviewsLoading() {
  return (
    <div className="flex flex-col gap-4 px-5 py-5 sm:px-6" aria-busy="true">
      <SkeletonCard lines={2} />
      <SkeletonCard lines={4} />
    </div>
  );
}
