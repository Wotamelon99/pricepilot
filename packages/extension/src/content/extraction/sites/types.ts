export interface SiteExtractionResult {
  // `T | undefined` (not just `T`) on every optional field: each per-site
  // extractor (amazon.ts, otto.ts, mediamarkt.ts, saturn.ts) assigns these
  // directly from helper calls / loop variables that can themselves be
  // `undefined`, which `exactOptionalPropertyTypes` rejects against a bare
  // `field?: T`.
  readonly title?: string | undefined;
  readonly asin?: string | undefined;
  readonly ean?: string | undefined;
  readonly gtin?: string | undefined;
  readonly mpn?: string | undefined;
  readonly sku?: string | undefined;
  readonly brand?: string | undefined;
  readonly priceAmount?: number | undefined;
  readonly priceCurrency?: string | undefined;
}

export interface SiteExtractor {
  readonly siteId: string;
  /** Hostnames this extractor applies to (matched by exact host or suffix, e.g. "www.amazon.de"). */
  readonly hostnames: readonly string[];
  extract(doc: Document, url: URL): SiteExtractionResult;
}
