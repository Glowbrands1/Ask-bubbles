/*
 * THE EXIT FORM'S 25 NOV 2026 CHANGES ARE MADE IN BOTH APPS (Pau: "Is written notice uploaded to the employee file?",
 * Permanent Address as a complete mailing address on its own line, the notice dates locked until Submitted & Fulfilled
 * Notice is ticked). The reference snapshot predates them, so the comparison puts the exit seed back to that layout
 * and wording; `exit-form-nov25-requests.test.ts` checks the changes themselves. Nothing else is set aside.
 */
const NOV25_FROM_MANAGER_DATE = "Filled only from a date the manager stated in the conversation. Left blank otherwise.";
export function withoutSharedNov25ExitChanges(key: string, document: unknown): unknown {
  if (key !== "resignation-exit" || !document || typeof document !== "object") return document;
  type Field = { key: string; help?: string; [k: string]: unknown };
  type Block = { kind: string; key?: string; label?: string; field?: Field; fields?: Field[]; [k: string]: unknown };
  const doc = JSON.parse(JSON.stringify(document)) as { blocks: Block[] };
  const out: Block[] = [];
  for (let index = 0; index < doc.blocks.length; index++) {
    const block = doc.blocks[index]!;
    const next = doc.blocks[index + 1];
    if (block.kind === "field" && block.field?.key === "permanent_address" && next?.kind === "field" && next.field?.key === "last_day_worked") {
      const address: Field = { ...block.field };
      delete address.help;
      out.push({ kind: "field_row", fields: [address, next.field] });
      index++;
      continue;
    }
    if (block.kind === "field_row") {
      for (const field of block.fields ?? []) {
        if (field.key === "notice_given_date" || field.key === "notice_fulfilled_date") field.help = NOV25_FROM_MANAGER_DATE;
      }
    }
    if (block.kind === "checkbox_group" && block.key === "written_notice_attached") block.label = "Written notice attached?";
    out.push(block);
  }
  return { ...doc, blocks: out };
}

