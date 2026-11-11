"use client";

import { attentionSummary, type FollowUpFilter } from "@/lib/forms/follow-up";
import { demoFormVisible } from "@/lib/demo/demo-scope";
import { useSession } from "@/lib/session/session-context";

import { MonitoringTable, type MonitoredForm, type MonitoringView } from "./monitoring-table";

/** A demo row, with the two facts the browser-side scope rule reads. */
export interface DemoMonitoredForm extends MonitoredForm {
  locationId: string | null;
  layoutFamily: string;
}

/**
 * DEMO BUILD ONLY. The previewed role is chosen in the browser and never reaches
 * a page render, so the invented Forms Register is scoped here, by the same rule
 * a live register applies on the server: the role's stores, and exit forms only
 * for a role that may create them. Then it is the real table.
 */
export function DemoFormsRegister({
  forms,
  active,
  view,
  followUp,
  today,
}: {
  /** The shelf being viewed, every store. */
  forms: DemoMonitoredForm[];
  /** The active shelf, every store — what the attention banner counts. */
  active: DemoMonitoredForm[];
  view: MonitoringView;
  followUp: FollowUpFilter;
  today: string;
}) {
  const { user, can } = useSession();
  const visible = (form: DemoMonitoredForm) => demoFormVisible(form, user.scope.level, can);
  return (
    <MonitoringTable
      forms={forms.filter(visible)}
      notice={null}
      view={view}
      followUp={followUp}
      today={today}
      attention={attentionSummary(active.filter(visible), today)}
      demo={{ deletable: 0, protected: 0 }}
    />
  );
}
