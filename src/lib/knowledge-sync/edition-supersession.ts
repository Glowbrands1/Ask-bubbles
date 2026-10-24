import { manualDisplayTitle } from "@/lib/forms/official-policy-manual";

/**
 * Which older Woven edition a newly published one replaces.
 *
 * A revised handbook or policy arrives as its own knowledge document. The
 * older edition stays in the library — nothing is deleted — and is marked
 * superseded so retrieval, which already requires `status = indexed`, cites
 * only the current edition.
 *
 * TWO WAYS A PAIR IS THE SAME DOCUMENT, both taken from data Woven already
 * sent. A shared title family uses the same revision stripping the citation
 * title uses (`manualDisplayTitle`): "2025 JBA Policy Manual - Edited
 * 5-2025" and "2026 JBA Policy Manual" are one family. A shared Woven policy
 * id (the source entity id, or a locator policy id) is the other. The part
 * slot stays in the key, so a policy's text and its PDF are not editions of
 * each other. An attachment is the same document as another attachment only
 * when the title family matches as well, so two different files on one
 * policy are left alone.
 *
 * THE NEWEST EDIT DATE WINS, and only when every edition in the family has
 * one and exactly one of them is strictly newest. A missing or tied date
 * supersedes nothing.
 */

export interface EditionDocument {
  readonly documentId: string;
  readonly title: string;
  readonly contentType: string;
  /** Woven's stable id for the record. For a policy this is the policy id. */
  readonly entityId: string;
  /** Locator policy id when the part records one. Null when Woven did not send one. */
  readonly policyId: string | null;
  readonly partKey: string;
  /** Woven's edit time for this edition. ISO-8601. */
  readonly editedAt: string | null;
}

export interface EditionSupersession {
  readonly documentId: string;
  readonly supersededBy: string;
  /** The title family or policy id that put these editions together. */
  readonly family: string;
}

export interface EditionPlan {
  readonly supersede: readonly EditionSupersession[];
}

function partSlot(partKey: string): string {
  if (partKey === "content" || partKey === "current-version") return partKey;
  if (partKey.startsWith("attachment:")) return "attachment";
  return partKey;
}

function titleFamily(title: string): string {
  return manualDisplayTitle(title).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function editedTime(value: string | null): number | null {
  if (!value?.trim()) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function policyOf(doc: EditionDocument): string | null {
  const id = doc.policyId?.trim() || (doc.contentType === "policy" ? doc.entityId.trim() : "");
  return id || null;
}

interface IndexedEdition {
  readonly doc: EditionDocument;
  readonly slot: string;
  readonly family: string;
  readonly policyId: string | null;
}

/** Same document, said two ways. An attachment still needs the title family. */
function sameDocument(a: IndexedEdition, b: IndexedEdition): boolean {
  if (a.doc.documentId === b.doc.documentId) return false;
  if (a.doc.contentType !== b.doc.contentType || a.slot !== b.slot) return false;
  if (a.family !== "" && a.family === b.family) return true;
  if (a.slot === "attachment") return false;
  return Boolean(a.policyId && a.policyId === b.policyId);
}

class UnionFind {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    let cursor = index;
    while (this.parent[cursor] !== cursor) {
      this.parent[cursor] = this.parent[this.parent[cursor]!]!;
      cursor = this.parent[cursor]!;
    }
    return cursor;
  }

  union(left: number, right: number): void {
    const a = this.find(left);
    const b = this.find(right);
    if (a !== b) this.parent[b] = a;
  }
}

export function planEditionSupersession(documents: readonly EditionDocument[]): EditionPlan {
  const rows: IndexedEdition[] = documents.map((doc) => ({
    doc,
    slot: partSlot(doc.partKey),
    family: titleFamily(doc.title),
    policyId: policyOf(doc),
  }));
  const sets = new UnionFind(rows.length);
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      if (sameDocument(rows[left]!, rows[right]!)) sets.union(left, right);
    }
  }

  const groups = new Map<number, IndexedEdition[]>();
  rows.forEach((row, index) => {
    const root = sets.find(index);
    const group = groups.get(root) ?? [];
    group.push(row);
    groups.set(root, group);
  });

  const supersede: EditionSupersession[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const times = group.map((row) => editedTime(row.doc.editedAt));
    if (times.some((time) => time === null)) continue;
    const newest = Math.max(...(times as number[]));
    const leaders = group.filter((_, index) => times[index] === newest);
    if (leaders.length !== 1) continue;
    const keeper = leaders[0]!;
    const family = group.every((row) => row.family === keeper.family && keeper.family !== "")
      ? keeper.family
      : (keeper.policyId ?? keeper.doc.entityId);
    for (const row of group) {
      if (row.doc.documentId === keeper.doc.documentId) continue;
      supersede.push({
        documentId: row.doc.documentId,
        supersededBy: keeper.doc.documentId,
        family,
      });
    }
  }

  supersede.sort((a, b) => a.documentId.localeCompare(b.documentId));
  return { supersede };
}

/** Flag off: the plan is empty, so a sync run changes no edition. */
export function editionSupersessionsToApply(
  documents: readonly EditionDocument[],
  enabled: boolean,
): readonly EditionSupersession[] {
  if (!enabled) return [];
  return planEditionSupersession(documents).supersede;
}
