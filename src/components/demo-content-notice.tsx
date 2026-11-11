import { Notice } from "@/components/ui/feedback";

/**
 * DEMO BUILD ONLY. Said once, at the top of a live screen drawn over invented
 * figures, in the same words the Google Reviews demo uses: a demo deployment
 * never reads the database, so what follows is seeded, not real.
 */
export function DemoContentNotice({ screen, contents }: { screen: string; contents: string }) {
  return (
    <Notice tone="attention" title="Showing seeded content, not real records" className="mb-4">
      This is a demo deployment, and demo deployments never read the live database. The page below
      is the live {screen} screen; every {contents} on it is invented demo content.
    </Notice>
  );
}
