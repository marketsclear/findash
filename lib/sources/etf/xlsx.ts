import { unzipSync, strFromU8 } from "fflate";

/** Minimal .xlsx reader: returns rows of string cells for the given sheet index (1-based). */
export function readXlsxSheet(buf: Uint8Array, sheetIndex = 1): string[][] {
  const files = unzipSync(buf);
  const shared: string[] = [];
  const sst = files["xl/sharedStrings.xml"];
  if (sst) {
    const xml = strFromU8(sst);
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
    }
  }
  const sheet = files[`xl/worksheets/sheet${sheetIndex}.xml`];
  if (!sheet) throw new Error(`sheet${sheetIndex} not found in workbook`);
  const xml = strFromU8(sheet);
  const rows: string[][] = [];
  for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[2];
      const inner = c[3] ?? "";
      const type = attrs.match(/\bt="(\w+)"/)?.[1];
      let value = "";
      if (type === "s") {
        const idx = inner.match(/<v>(\d+)<\/v>/)?.[1];
        value = idx !== undefined ? shared[Number(idx)] ?? "" : "";
      } else if (type === "inlineStr") {
        value = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("");
      } else {
        value = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      }
      cells.push(decode(value));
    }
    rows.push(cells);
  }
  return rows;
}

function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
