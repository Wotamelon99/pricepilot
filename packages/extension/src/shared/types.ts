/**
 * Types shared between the extension and the backend API contract.
 *
 * These are intentionally a hand-mirrored subset of
 * `packages/backend/src/providers/types.ts` and
 * `packages/backend/src/routes/search.ts`'s response shape - the extension
 * package has no runtime dependency on the backend package (it ships to
 * end users' browsers, the backend does not), so the two are kept in sync
 * by convention rather than a shared import. If a `packages/shared` library
 * package is introduced later, both sides should import from there instead.
 */

export interface Money {
  readonly amount: number;
  readonly currency: string;
}

export interface ProductIdentity {
  // Optional fields are typed `T | undefined` (not just `T`) so that code
  // building a ProductIdentity from several optional sources - see
  // content/extraction/identity.ts - can assign an `undefined`-valued
  // expression (e.g. `jsonLd?.gtin13 ?? og.gtin ?? siteResult?.ean`)
  // directly, which `exactOptionalPropertyTypes` otherwise rejects (a bare
  // `field?: T` means "may be omitted", not "may be explicitly undefined").
  readonly gtin?: string | undefined;
  readonly ean?: string | undefined;
  readonly upc?: string | undefined;
  readonly asin?: string | undefined;
  readonly brand?: string | undefined;
  readonly manufacturer?: string | undefined;
  readonly mpn?: string | undefined;
  readonly sku?: string | undefined;
  readonly title: string;
  readonly category?: string | undefined;
  readonly model?: string | undefined;
  readonly sourceUrl?: string | undefined;
}

export interface Offer {
  readonly offerId: string;
  readonly providerId: string;
  readonly merchantName: string;
  readonly productTitle: string;
  readonly identity: ProductIdentity;
  readonly price: Money;
  readonly shipping: Money;
  readonly totalPrice: Money;
  readonly inStock: boolean;
  readonly productUrl: string;
  readonly imageUrl?: string;
  readonly currency: string;
  readonly fetchedAt: string;
  readonly matchConfidence: number;
}

export interface SearchResultGroup {
  readonly product: {
    readonly title: string;
    readonly brand?: string;
    readonly category?: string;
    readonly model?: string;
  };
  readonly cheapestTotal: Money;
  readonly offers: Offer[];
}

export interface SearchResponse {
  readonly query: Record<string, unknown>;
  readonly resultCount: number;
  readonly results: SearchResultGroup[];
  readonly providerStatuses: Record<string, { status: string; error?: string }>;
}

/** The product signal the content script extracts from a merchant page. */
export interface DetectedProduct {
  readonly identity: ProductIdentity;
  /** The merchant's own displayed price for this page, if found (for reference only; the backend result is authoritative). */
  readonly displayedPrice?: Money;
  readonly detectedAt: string;
  readonly pageUrl: string;
}
