/**
 * Core domain types shared by every provider implementation.
 *
 * These types are the contract between the matching engine, the API
 * layer, and each retailer-specific provider (Amazon, Awin, Demo, ...).
 * Providers never expose their own vendor-specific shapes outside of
 * this file's types.
 */

/** Identity signals used to match the same physical product across retailers. */
export interface ProductIdentity {
  // Optional fields are typed `T | undefined` (not just `T`) so that code
  // building a ProductIdentity from several optional sources (e.g.
  // routes/search.ts's request-body mapping) can assign an
  // `undefined`-valued expression directly, which `exactOptionalPropertyTypes`
  // otherwise rejects against a bare `field?: T`.
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

/** Distinguishing attributes that must match for two offers to be the "same" product. */
export interface ProductVariant {
  readonly storageGb?: number;
  readonly ramGb?: number;
  readonly color?: string;
  readonly condition?: "new" | "refurbished" | "used";
}

export type ProviderStatus = "OK" | "CONFIGURATION_REQUIRED" | "ERROR" | "RATE_LIMITED";

export interface Money {
  readonly amount: number; // in the smallest currency-neutral decimal form, e.g. 499.99
  readonly currency: string; // ISO 4217, e.g. "EUR"
}

export interface Offer {
  readonly offerId: string;
  readonly providerId: string;
  readonly merchantName: string;
  readonly productTitle: string;
  readonly identity: ProductIdentity;
  readonly variant?: ProductVariant;
  readonly price: Money;
  readonly shipping: Money;
  /** price + shipping, in the same currency; the canonical sort key. */
  readonly totalPrice: Money;
  readonly inStock: boolean;
  readonly productUrl: string;
  readonly imageUrl?: string;
  readonly currency: string;
  readonly fetchedAt: string; // ISO timestamp
  /** Confidence (0-1) that this offer matches the queried product. */
  readonly matchConfidence: number;
}

export interface ProviderSearchResult {
  readonly status: ProviderStatus;
  readonly providerId: string;
  readonly offers: Offer[];
  readonly error?: string;
}

export interface ProductSearchQuery {
  readonly text?: string;
  readonly gtin?: string;
  readonly ean?: string;
  readonly asin?: string;
  readonly mpn?: string;
  readonly sku?: string;
  readonly brand?: string;
  readonly category?: string;
}

/**
 * Shared interface every retailer/affiliate-network integration must
 * implement. The core application depends only on this interface, never
 * on a concrete provider - this is what keeps retailers as isolated,
 * swappable modules (see architecture principle: "Independent provider
 * architecture").
 */
export interface PriceProvider {
  readonly providerId: string;
  readonly displayName: string;

  /** Whether credentials/config required for this provider are present. */
  isConfigured(): boolean;

  /** Search for offers matching the given product query. */
  searchProduct(query: ProductSearchQuery): Promise<ProviderSearchResult>;

  /** Fetch a single offer/product by this provider's own offer id. */
  getProduct(offerId: string): Promise<Offer | undefined>;

  /** Build the outbound affiliate URL for a given offer's underlying product URL. */
  generateAffiliateUrl(offer: Offer): string;
}
