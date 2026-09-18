/**
 * Parses a German-formatted price string ("1.234,56 €", "39,99€", "€19.99")
 * into a plain number. Handles both German (dot thousands / comma decimal)
 * and, defensively, plain international formatting, since some merchant
 * pages mix formats across locales/components.
 */
export function parseGermanPrice(raw: string): number | undefined {
  const cleaned = raw
    .replace(/[^\d.,]/g, "") // strip currency symbols, spaces, "ab", etc.
    .trim();
  if (!cleaned) return undefined;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  let normalized = cleaned;
  if (hasComma && hasDot) {
    // Assume German format: '.' thousands separators, ',' decimal separator.
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    // "39,99" -> decimal comma.
    normalized = cleaned.replace(",", ".");
  }
  // else: plain digits or already dot-decimal ("19.99") - use as-is.

  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : undefined;
}

/** Finds the first element matching any of the given selectors and parses its text as a price. */
export function findPriceInDom(root: ParentNode, selectors: readonly string[]): number | undefined {
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    const text = el?.textContent?.trim();
    if (text) {
      const price = parseGermanPrice(text);
      if (price !== undefined) return price;
    }
  }
  return undefined;
}
