import { crc32 } from "node:zlib";

import {
  FIXTURE_COACHING_ACKNOWLEDGEMENT,
  FIXTURE_COACHING_TOPICS,
  FIXTURE_COACHING_TYPES,
} from "./fixture-forms";
import { FORM_LETTERHEAD_BRAND } from "@/config/company/forms/letterhead";

/**
 * ============================================================================
 * SOURCE DOCUMENTS FOR THE INGESTION TESTS, BUILT IN MEMORY
 * ============================================================================
 *
 * The ingestion pipeline reads a business's own Word and PDF forms. Its tests
 * need REAL files — a genuine zip archive mammoth opens, a genuine PDF pdf.js
 * reads — rather than mocks, because a mock proves only that a mock returns
 * what it was told to. These are generated here from the fixture coaching
 * note (`fixture-forms.ts`), so no business document is checked in.
 *
 * Both are deliberately shaped like what Word produces for a form: the title
 * and brand in the page header, bold section lines, Word's own "Click or tap
 * here to enter text." placeholders, checkbox content controls (.docx) or box
 * glyphs (.pdf), and a flat PDF with no AcroForm fields at all.
 */

/* ------------------------------------------------------------- the zip --- */

/**
 * A zip of STORED (uncompressed) entries, built from the zip format alone so
 * there is nothing to go wrong in a compressor. A reader that can open a .docx
 * can open this; one that only pattern-matches bytes cannot.
 */
export function buildZip(entries: { name: string; content: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const sum = crc32(Buffer.from(data));

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint32(14, sum, true);
    local.setUint32(18, data.byteLength, true); // stored: sizes match
    local.setUint32(22, data.byteLength, true);
    local.setUint16(26, name.byteLength, true);
    locals.push(new Uint8Array(local.buffer), name, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true); // version made by
    central.setUint16(6, 20, true); // version needed
    central.setUint32(16, sum, true);
    central.setUint32(20, data.byteLength, true);
    central.setUint32(24, data.byteLength, true);
    central.setUint16(28, name.byteLength, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.byteLength + data.byteLength;
  }

  const directorySize = centrals.reduce((total, part) => total + part.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const total = parts.reduce((size, part) => size + part.byteLength, 0);
  const zip = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    zip.set(part, cursor);
    cursor += part.byteLength;
  }
  return zip;
}

/* ------------------------------------------------------------ the docx --- */

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const W14 = "http://schemas.microsoft.com/office/word/2010/wordml";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const run = (text: string, bold = false) =>
  `<w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

/** One paragraph of a Word body. */
export type DocxParagraph =
  | { text: string; bold?: boolean }
  /** A row of Word checkbox content controls, each followed by its label. */
  | { checkboxes: string[]; trailing?: string };

function paragraphXml(paragraph: DocxParagraph): string {
  if ("text" in paragraph) return `<w:p>${run(paragraph.text, paragraph.bold)}</w:p>`;
  const boxes = paragraph.checkboxes
    .map(
      (label) =>
        `<w:sdt><w:sdtPr><w14:checkbox><w14:checked w14:val="0"/></w14:checkbox></w:sdtPr>` +
        `<w:sdtContent>${run("☐")}</w:sdtContent></w:sdt>${run(` ${label} `)}`,
    )
    .join("");
  return `<w:p>${boxes}${paragraph.trailing ? run(paragraph.trailing) : ""}</w:p>`;
}

/**
 * A Word document: a body, and optionally a page header — which is where Word
 * keeps a form's title and brand, and which mammoth does not read.
 */
export function buildDocx(
  body: readonly (string | DocxParagraph)[],
  header: readonly string[] = [],
): Uint8Array {
  const paragraphs = body
    .map((entry) => paragraphXml(typeof entry === "string" ? { text: entry } : entry))
    .join("");
  const headerReference = header.length
    ? `<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/></w:sectPr>`
    : "";

  return buildZip([
    {
      name: "[Content_Types].xml",
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        (header.length
          ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
          : "") +
        "</Types>",
    },
    {
      name: "_rels/.rels",
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        "</Relationships>",
    },
    ...(header.length
      ? [
          {
            name: "word/_rels/document.xml.rels",
            content:
              '<?xml version="1.0" encoding="UTF-8"?>' +
              '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
              '<Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' +
              "</Relationships>",
          },
          {
            name: "word/header1.xml",
            content:
              '<?xml version="1.0" encoding="UTF-8"?>' +
              `<w:hdr xmlns:w="${W}">${header.map((line) => `<w:p>${run(line, true)}</w:p>`).join("")}</w:hdr>`,
          },
        ]
      : []),
    {
      name: "word/document.xml",
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        `<w:document xmlns:w="${W}" xmlns:w14="${W14}" xmlns:r="${R}">` +
        `<w:body>${paragraphs}${headerReference}</w:body></w:document>`,
    },
  ]);
}

/** The OLE2 compound-file header a Word 97-2003 .doc opens with. */
export function buildLegacyDoc({ word = true }: { word?: boolean } = {}): Uint8Array {
  const bytes = new Uint8Array(1024);
  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  // The directory records a stream name in UTF-16LE. Word's is `WordDocument`;
  // a workbook's is `Workbook`, which is how the two are told apart.
  const name = word ? "WordDocument" : "Workbook";
  let cursor = 512;
  for (const character of name) {
    bytes[cursor] = character.charCodeAt(0);
    bytes[cursor + 1] = 0;
    cursor += 2;
  }
  return bytes;
}

/* ------------------------------------------------------------- the pdf --- */

/** The box glyph a Word-exported PDF prints in front of each option. */
const BOX = "☐";

/**
 * A FLAT one-page PDF — no AcroForm, so every structure must be read from the
 * page text — carrying these lines. ASCII is drawn in Helvetica; each ☐ is
 * drawn from a second font whose ToUnicode map reads it back as U+2610, which
 * is how a Word export's box glyph comes out of a text extractor.
 */
export function buildFlatPdf(lines: readonly string[]): Uint8Array {
  const escape = (text: string) => text.replace(/[\\()]/g, (c) => `\\${c}`);
  let y = 740;
  const content = lines
    .map((text) => {
      y -= 16;
      const pieces = text
        .split(/(☐)/u)
        .filter((piece) => piece.length > 0)
        .map((piece) => (piece === BOX ? "/F2 11 Tf (o) Tj" : `/F1 11 Tf (${escape(piece)}) Tj`));
      return `BT 1 0 0 1 54 ${y} Tm ${pieces.join(" ")} ET`;
    })
    .join("\n");

  const cmap =
    "/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CMapName /FixtureBox def " +
    "/CMapType 2 def 1 begincodespacerange <00> <FF> endcodespacerange " +
    "1 beginbfchar <6F> <2610> endbfchar endcmap CMapName currentdict /CMap defineresource pop end end";

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /ToUnicode 7 0 R >>",
    `<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/* ----------------------------------------- the fixture coaching source --- */

const TEXT = "Click or tap here to enter text.";
const DATE = "Click or tap to enter a date.";

export const FIXTURE_COACHING_TITLE = "Fixture Coaching Note";
export const FIXTURE_COACHING_BRAND = FORM_LETTERHEAD_BRAND;

/** The topics as the page prints them: three to a row, Other last with its blank. */
function topicRows(): string[][] {
  const topics = FIXTURE_COACHING_TOPICS.filter((topic) => topic !== "Other");
  const rows: string[][] = [];
  for (let index = 0; index < topics.length; index += 3) rows.push(topics.slice(index, index + 3));
  return rows;
}

/**
 * The fixture coaching note's page text, as a flat PDF's text layer reads it.
 * One row runs a glyph into its label ("☐Handling"), as real exports do.
 */
export function fixtureCoachingPageText(): string[] {
  const rows = topicRows();
  const last = rows.pop()!;
  return [
    FIXTURE_COACHING_TITLE,
    FIXTURE_COACHING_BRAND,
    "Team Member Information",
    `Name: ${TEXT} Date: ${DATE}`,
    `Job Title: ${TEXT} Location: ${TEXT}`,
    "Type of Coaching",
    FIXTURE_COACHING_TYPES.map((label) => `☐ ${label}`).join(" "),
    "Topic of Coaching",
    ...rows.map((row, index) =>
      row.map((label, at) => (index === 1 && at === 1 ? `☐${label}` : `☐ ${label}`)).join(" "),
    ),
    `${last.map((label) => `☐ ${label}`).join(" ")} ☐ Other: ${TEXT}`,
    "Details of Coaching",
    TEXT,
    "Acknowledgement of Coaching",
    FIXTURE_COACHING_ACKNOWLEDGEMENT,
    `${TEXT} ${DATE}`,
    "Employee Signature Date",
    `${TEXT} ${DATE}`,
    "Supervisor Signature Date",
  ];
}

/** The fixture coaching note as a flat PDF. */
export function fixtureCoachingPdf(): Uint8Array {
  return buildFlatPdf(fixtureCoachingPageText());
}

/** The fixture coaching note as a Word document, title and brand in its header. */
export function fixtureCoachingDocx(): Uint8Array {
  const rows = topicRows();
  const last = rows.pop()!;
  return buildDocx(
    [
      { text: "Team Member Information", bold: true },
      `Name: ${TEXT} Date: ${DATE}`,
      `Job Title: ${TEXT} Location: ${TEXT}`,
      { text: "Type of Coaching", bold: true },
      { checkboxes: FIXTURE_COACHING_TYPES },
      { text: "Topic of Coaching", bold: true },
      ...rows.map((row) => ({ checkboxes: row })),
      { checkboxes: [...last, `Other: ${TEXT}`] },
      { text: "Details of Coaching", bold: true },
      TEXT,
      { text: "Acknowledgement of Coaching", bold: true },
      FIXTURE_COACHING_ACKNOWLEDGEMENT,
      `${TEXT} ${DATE}`,
      "Employee Signature Date",
      `${TEXT} ${DATE}`,
      "Supervisor Signature Date",
    ],
    [FIXTURE_COACHING_TITLE, FIXTURE_COACHING_BRAND],
  );
}
