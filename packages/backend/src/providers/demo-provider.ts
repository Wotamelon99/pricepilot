import type {
  Offer,
  PriceProvider,
  ProductSearchQuery,
  ProviderSearchResult,
} from "./types.js";
import { config } from "../config/env.js";

interface DemoCatalogItem {
  readonly title: string;
  readonly brand: string;
  readonly manufacturer: string;
  readonly mpn: string;
  readonly ean: string;
  readonly category: string;
  readonly model: string;
  readonly imageUrl?: string;
  readonly offers: ReadonlyArray<{
    readonly merchantName: string;
    readonly price: number;
    readonly shipping: number;
    readonly inStock: boolean;
    readonly urlSlug: string;
  }>;
}

/**
 * Static, realistic German electronics/PC-hardware catalog used to power
 * the app end-to-end before any real affiliate credentials are configured.
 * Prices are illustrative EUR street prices as of early 2026, not live data.
 */
const DEMO_CATALOG: DemoCatalogItem[] = [
  {
    title: "NVIDIA GeForce RTX 5070 Founders Edition 12GB GDDR7",
    brand: "NVIDIA",
    manufacturer: "NVIDIA",
    mpn: "RTX5070-FE-12G",
    ean: "0810006812345",
    category: "Gaming Hardware",
    model: "RTX 5070",
    offers: [
      { merchantName: "Mindfactory", price: 599.0, shipping: 4.99, inStock: true, urlSlug: "nvidia-geforce-rtx-5070-fe" },
      { merchantName: "Alternate", price: 609.9, shipping: 0, inStock: true, urlSlug: "nvidia-rtx-5070-founders-edition" },
      { merchantName: "Amazon.de", price: 619.0, shipping: 0, inStock: true, urlSlug: "dp/B0DEMORTX5070" },
    ],
  },
  {
    title: "NVIDIA GeForce RTX 5060 Ti 16GB GDDR7",
    brand: "NVIDIA",
    manufacturer: "NVIDIA",
    mpn: "RTX5060TI-16G",
    ean: "0810006812369",
    category: "Gaming Hardware",
    model: "RTX 5060 Ti",
    offers: [
      { merchantName: "Mindfactory", price: 439.0, shipping: 4.99, inStock: true, urlSlug: "nvidia-geforce-rtx-5060-ti-16gb" },
      { merchantName: "Alternate", price: 429.9, shipping: 0, inStock: false, urlSlug: "nvidia-rtx-5060-ti-16gb" },
      { merchantName: "Amazon.de", price: 449.0, shipping: 0, inStock: true, urlSlug: "dp/B0DEMORTX5060TI" },
    ],
  },
  {
    title: "AMD Ryzen 7 9800X3D Prozessor (AM5, 8-Core, 3D V-Cache)",
    brand: "AMD",
    manufacturer: "AMD",
    mpn: "100-100001084WOF",
    ean: "0730143314935",
    category: "PC Hardware",
    model: "Ryzen 7 9800X3D",
    offers: [
      { merchantName: "Mindfactory", price: 479.0, shipping: 4.99, inStock: true, urlSlug: "amd-ryzen-7-9800x3d" },
      { merchantName: "Alternate", price: 469.0, shipping: 0, inStock: true, urlSlug: "amd-ryzen-7-9800x3d-box" },
      { merchantName: "Amazon.de", price: 489.99, shipping: 0, inStock: true, urlSlug: "dp/B0DEMO9800X3D" },
      { merchantName: "Cyberport", price: 474.0, shipping: 5.99, inStock: true, urlSlug: "amd-ryzen-7-9800x3d-cyberport" },
    ],
  },
  {
    title: "Samsung 990 Pro 2TB NVMe SSD PCIe 4.0",
    brand: "Samsung",
    manufacturer: "Samsung",
    mpn: "MZ-V9P2T0BW",
    ean: "8806094967747",
    category: "Computer Accessories",
    model: "990 Pro 2TB",
    offers: [
      { merchantName: "Mindfactory", price: 159.0, shipping: 4.99, inStock: true, urlSlug: "samsung-990-pro-2tb" },
      { merchantName: "Alternate", price: 154.9, shipping: 0, inStock: true, urlSlug: "samsung-ssd-990-pro-2tb" },
      { merchantName: "Amazon.de", price: 169.99, shipping: 0, inStock: true, urlSlug: "dp/B0DEMO990PRO2TB" },
      { merchantName: "Cyberport", price: 157.9, shipping: 0, inStock: true, urlSlug: "samsung-990-pro-2tb-cyberport" },
    ],
  },
  {
    title: "Kingston FURY Beast 32GB (2x16GB) DDR5-6000 CL30",
    brand: "Kingston",
    manufacturer: "Kingston",
    mpn: "KF560C30BBK2-32",
    ean: "0740617329902",
    category: "Computer Accessories",
    model: "FURY Beast DDR5 32GB 6000MHz",
    offers: [
      { merchantName: "Mindfactory", price: 89.9, shipping: 4.99, inStock: true, urlSlug: "kingston-fury-beast-32gb-ddr5-6000" },
      { merchantName: "Alternate", price: 84.9, shipping: 0, inStock: true, urlSlug: "kingston-fury-beast-32gb-6000mhz" },
      { merchantName: "Amazon.de", price: 94.99, shipping: 0, inStock: true, urlSlug: "dp/B0DEMOFURY32GB" },
    ],
  },
];

const CURRENCY = "EUR";

// Common short filler words that would otherwise dilute the match ratio
// below without adding any real matching signal.
const STOPWORDS = new Set(["der", "die", "das", "und", "für", "mit", "auf", "von", "im", "in", "zu"]);

/** Lowercases, strips punctuation Amazon/Otto/etc. titles use as separators, and drops filler tokens. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[,.;:()]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => token.length > 2 || /\d/.test(token))
    .filter((token) => !STOPWORDS.has(token));
}

// Pure capacity/speed/memory-type specs: safe to drop from what a query
// must contain, since a short query omitting them (e.g. "Kingston FURY
// Beast" without "32GB 6000MHz") isn't ambiguous *in this catalog* - only
// one capacity/speed variant of each item exists here. Unlike these, a
// word such as "Pro" or "Ti" is part of the *product's identity*, not a
// spec: "990" and "990 Pro" are different products at different prices,
// so that word must not be optional.
const SPEC_ONLY_TOKENS = new Set([
  "2tb", "1tb", "4tb", "500gb", "12gb", "16gb", "32gb", "6000mhz", "ddr5", "ddr4", "gddr7",
]);

/**
 * The subset of an item's model that actually identifies *which* product
 * this is, as opposed to which capacity/speed variant - see
 * SPEC_ONLY_TOKENS above.
 */
function requiredModelTokens(item: DemoCatalogItem): string[] {
  return tokenize(item.model).filter((token) => !SPEC_ONLY_TOKENS.has(token));
}

/**
 * Real product titles extracted from a merchant page (e.g. Amazon's,
 * which often run 100+ characters with marketing copy, dimensions, and
 * colour/variant text) essentially never contain this catalog's short
 * reference title verbatim, so matching can't require exact-string
 * agreement. But matching on *any* sufficient word overlap is also wrong:
 * a real "Samsung SSD 990" (the plain, cheaper model) shares enough
 * generic words with the catalog's "Samsung 990 Pro 2TB" (Samsung, SSD,
 * NVMe, PCIe, 4.0) to look like a match on overlap alone, even though
 * "Pro" - the one word that actually distinguishes them - is missing.
 * Requiring every *identity* word of the model (not just enough of them)
 * is what catches that: no "pro" in the query means no match.
 */
function slugMatches(query: string, item: DemoCatalogItem): boolean {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return false;

  const required = requiredModelTokens(item);
  return required.length > 0 && required.every((token) => queryTokens.has(token));
}

/**
 * DemoProvider: a complete, self-contained mock PriceProvider. It never
 * calls any external network and is always CONFIGURATION_REQUIRED == false
 * so the rest of the system (search, matching, click redirect) is fully
 * exercisable without any real affiliate credentials.
 */
export class DemoProvider implements PriceProvider {
  readonly providerId = "demo";
  readonly displayName = "PricePilot Demo Catalog";

  private readonly offersById = new Map<string, Offer>();

  constructor() {
    this.buildOfferIndex();
  }

  isConfigured(): boolean {
    return config.demoProviderEnabled;
  }

  private buildOfferIndex(): void {
    const now = new Date().toISOString();
    for (const item of DEMO_CATALOG) {
      for (const merchantOffer of item.offers) {
        // Deterministic, not random: search results get cached (see
        // routes/search.ts's Redis cache.wrap, config.cacheTtlSeconds),
        // and a service restart or redeploy creates a fresh DemoProvider
        // instance. A random id here would mean a cached search response
        // survives the restart with offer ids the new instance's
        // offersById map never generated - "Offer not found" on click,
        // even though the offer conceptually still exists. ean + the
        // per-merchant urlSlug are both static catalog data, so this id
        // is stable across restarts.
        const offerId = `demo_${item.ean}-${merchantOffer.urlSlug}`;
        const total = Math.round((merchantOffer.price + merchantOffer.shipping) * 100) / 100;
        const offer: Offer = {
          offerId,
          providerId: this.providerId,
          merchantName: merchantOffer.merchantName,
          productTitle: item.title,
          identity: {
            ean: item.ean,
            brand: item.brand,
            manufacturer: item.manufacturer,
            mpn: item.mpn,
            title: item.title,
            category: item.category,
            model: item.model,
          },
          price: { amount: merchantOffer.price, currency: CURRENCY },
          shipping: { amount: merchantOffer.shipping, currency: CURRENCY },
          totalPrice: { amount: total, currency: CURRENCY },
          inStock: merchantOffer.inStock,
          // A fabricated domain like "demo.pricepilot.local" doesn't
          // resolve to anything - a Chrome Web Store reviewer (or an
          // early real user) clicking a demo offer's click-through link
          // would just hit a DNS error, which reads as "broken
          // extension" rather than "this is demo data". Routing to our
          // own real, live site instead demonstrates the click-redirect
          // mechanism actually working end-to-end.
          productUrl: `https://wotamelon99.github.io/pricepilot/?demo_shop=${encodeURIComponent(
            merchantOffer.merchantName.toLowerCase().replace(/\s+/g, "-"),
          )}&demo_product=${encodeURIComponent(merchantOffer.urlSlug)}`,
          currency: CURRENCY,
          fetchedAt: now,
          matchConfidence: 1,
        };
        this.offersById.set(offerId, offer);
      }
    }
  }

  async searchProduct(query: ProductSearchQuery): Promise<ProviderSearchResult> {
    if (!this.isConfigured()) {
      return { status: "CONFIGURATION_REQUIRED", providerId: this.providerId, offers: [] };
    }

    const searchText = query.text ?? query.mpn ?? query.ean ?? query.brand ?? "";
    const matchedItems = DEMO_CATALOG.filter((item) => {
      if (query.ean && item.ean === query.ean) return true;
      if (query.mpn && item.mpn.toLowerCase() === query.mpn.toLowerCase()) return true;
      if (searchText) return slugMatches(searchText, item);
      return false;
    });

    const offers = [...this.offersById.values()].filter((offer) =>
      matchedItems.some((item) => item.ean === offer.identity.ean),
    );

    return { status: "OK", providerId: this.providerId, offers };
  }

  async getProduct(offerId: string): Promise<Offer | undefined> {
    return this.offersById.get(offerId);
  }

  generateAffiliateUrl(offer: Offer): string {
    // Demo offers are not real affiliate links; they resolve to a local
    // placeholder page so click-through logic can still be tested E2E.
    const url = new URL(offer.productUrl);
    url.searchParams.set("demo_ref", "pricepilot");
    return url.toString();
  }
}
