import { NextResponse } from "next/server";

import { isDemoMode } from "@/lib/config/runtime";
import { parseFormVariants } from "@/lib/forms/document";
import { TEMPLATE_SEEDS } from "@/lib/forms/library";
import { pdfFileName, renderFormPdf } from "@/lib/forms/pdf-render";

import {
  DemoFormRefusal,
  demoArchive,
  demoDelete,
  demoFollowUpDone,
  demoMarkExported,
  demoSetFollowUp,
  findDemoForm,
} from "./forms-fixtures";

/**
 * DEMO BUILD ONLY — the Forms Register's buttons, answered from the invented
 * set in `forms-fixtures.ts` rather than the database. Each helper returns null
 * outside demo mode, so the live route below it runs exactly as before.
 */

type Verb =
  | { kind: "archive"; archived: boolean }
  | { kind: "delete" }
  | { kind: "follow-up-date"; date: string | undefined }
  | { kind: "follow-up"; action: string | undefined }
  | { kind: "pdf" };

function refusal(error: unknown): Response {
  if (error instanceof DemoFormRefusal) {
    const status = error.message.includes("not found") ? 404 : 409;
    return NextResponse.json({ error: error.message }, { status });
  }
  throw error;
}

export function demoFormsRoute(id: string, verb: Verb, actorName = "Demo user"): Response | null {
  if (!isDemoMode()) return null;
  try {
    switch (verb.kind) {
      case "archive":
        return NextResponse.json({ instance: demoArchive(id, verb.archived) });
      case "delete": {
        const deleted = demoDelete(id);
        return NextResponse.json({ deleted: { id: deleted.id, employeeName: deleted.employeeName } });
      }
      case "follow-up-date":
        if (!verb.date) return NextResponse.json({ error: "A follow-up date is required." }, { status: 400 });
        return NextResponse.json({ instance: demoSetFollowUp(id, verb.date) });
      case "follow-up":
        if (verb.action !== "complete" && verb.action !== "reopen") {
          return NextResponse.json({ error: "Unknown follow-up action." }, { status: 400 });
        }
        return NextResponse.json({ instance: demoFollowUpDone(id, actorName, verb.action === "complete") });
      case "pdf":
        return demoPdf(id);
    }
  } catch (error) {
    return refusal(error);
  }
}

/** The blank official layout of the form, with its header filled from the demo record. */
function demoPdf(id: string): Response {
  const form = findDemoForm(id);
  if (!form) throw new DemoFormRefusal("That form was not found.");
  const seed = TEMPLATE_SEEDS.find((entry) => entry.key === form.templateKey);
  if (!seed) throw new DemoFormRefusal("That form was not found.");
  const variants = parseFormVariants(seed.variants);
  const variant = variants.find((entry) => entry.key === form.variantKey) ?? null;
  const meta = {
    templateName: form.templateName,
    templateVersion: form.templateVersion,
    employeeName: form.employeeName,
    formDate: form.formDate,
    locationName: form.locationName,
    reference: form.id.slice(-8),
    status: form.status,
  };
  const values: Record<string, string> = {
    employee_name: form.employeeName,
    form_date: form.formDate,
    job_title: form.employeeRole ?? "",
    location: form.locationName ?? "",
  };
  const bytes = renderFormPdf(seed.document, variant, { values, checked: {} }, meta);
  demoMarkExported(id);
  return new Response(bytes as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${pdfFileName(meta)}"`,
      "cache-control": "no-store, private",
    },
  });
}
