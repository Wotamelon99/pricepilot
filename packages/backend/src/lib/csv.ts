/**
 * Minimal RFC 4180-style CSV parser: handles quoted fields (including
 * embedded commas, newlines, and escaped "" quotes) without pulling in an
 * external dependency. Returns an array of objects keyed by the header
 * row. Not a full CSV spec implementation, but sufficient for the
 * datafeed exports Awin (and similar affiliate networks) produce.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text);
  if (rows.length === 0) return [];

  const header = rows[0]!;
  const records: Record<string, string>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.length === 1 && row[0] === "") continue; // trailing blank line
    const record: Record<string, string> = {};
    for (let col = 0; col < header.length; col++) {
      record[header[col]!] = row[col] ?? "";
    }
    records.push(record);
  }

  return records;
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Normalize line endings so \r\n and \r are treated like \n.
  const input = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // Final field/row (files may or may not end with a trailing newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
