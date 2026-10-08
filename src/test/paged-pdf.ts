/**
 * A minimal, valid MULTI-PAGE PDF of plain text lines — for tests that need a
 * real PDF to go through the real extractor (`unpdf`). Helvetica, WinAnsi, one
 * line per text line, wrapped at a fixed width. Test-only.
 */

const WIN_ANSI: Record<string, number> = { "’": 0o222, "‘": 0o221, "“": 0o223, "”": 0o224, "–": 0o226, "—": 0o227, "®": 0o256, "•": 0o225 };

function pdfString(text: string): string {
  let out = "";
  for (const char of text) {
    if (char === "\\" || char === "(" || char === ")") out += `\\${char}`;
    else if (WIN_ANSI[char] !== undefined) out += `\\${WIN_ANSI[char]!.toString(8)}`;
    else if (char.charCodeAt(0) < 128) out += char;
    else out += "?";
  }
  return out;
}

function wrap(line: string, width: number): string[] {
  if (line.length <= width) return [line];
  const out: string[] = [];
  let current = "";
  for (const word of line.split(" ")) {
    if (current && (current + " " + word).length > width) {
      out.push(current);
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) out.push(current);
  return out;
}

/** Each page is a list of lines, top to bottom. */
export function pagedPdf(pages: readonly (readonly string[])[], options: { fontSize?: number; width?: number; pageWidth?: number } = {}): Uint8Array {
  const size = options.fontSize ?? 9;
  /* Wide enough that no line runs off the sheet: text past the edge is not extracted. */
  const pageWidth = options.pageWidth ?? 612;
  const leading = size + 2;
  const width = options.width ?? 110;
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) - 1 + 1;
  const catalog = add("");
  const pagesId = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  for (const lines of pages) {
    const wrapped = lines.flatMap((line) => wrap(line, width));
    const ops = [`BT /F1 ${size} Tf ${leading} TL 50 760 Td`, ...wrapped.map((line) => `(${pdfString(line)}) Tj T*`), "ET"].join("\n");
    const stream = add(`<< /Length ${Buffer.byteLength(ops, "latin1")} >>\nstream\n${ops}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}
