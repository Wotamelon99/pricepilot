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
    /** The merchant's real, live product page - see the module comment. */
    readonly productUrl: string;
  }>;
}

/**
 * A small, hand-curated set of real German electronics/PC-hardware
 * products, used to power comparisons before any affiliate network has
 * approved this account for its real merchant programmes (see
 * awin-feed-sync.ts / daisycon-oauth.ts for that path, which scales
 * automatically once approvals land).
 *
 * Every price, EAN, MPN and product URL below was looked up by hand at
 * Alternate.de and Mindfactory.de (captured 2026-09-19) - this is
 * publicly-visible data a person read off the page, not scraped
 * automatically, and the links are plain, non-affiliate links: no
 * tracking parameters, no commission. That's the deliberate trade-off
 * here - showing a real price and a real, working link a user can
 * actually buy from is worth more than a technically-monetizable but
 * fabricated one, even before this account earns anything from it.
 *
 * The real trade-off to know about: unlike an automated feed, nobody
 * refreshes these prices on its own. They will drift out of date and
 * need a manual re-check periodically - this is a stopgap, not a
 * long-term data source.
 */
const DEMO_CATALOG: DemoCatalogItem[] = [
  {
    title: "ASUS GeForce RTX 5070 PRIME OC 12GB GDDR7",
    brand: "ASUS",
    manufacturer: "ASUS",
    mpn: "90YV0M10-M0NA00",
    ean: "4711387837825",
    category: "Gaming Hardware",
    model: "RTX 5070",
    offers: [
      {
        merchantName: "Alternate",
        price: 862.0,
        shipping: 0,
        inStock: true,
        productUrl: "https://www.alternate.de/ASUS/GeForce-RTX-5070-PRIME-OC-Grafikkarte/html/product/100117271",
      },
      {
        merchantName: "Mindfactory",
        price: 929.98,
        shipping: 0,
        inStock: true,
        productUrl:
          "https://www.mindfactory.de/product_info.php/search/true/12GB-Asus-GeForce-RTX-5070-Prime-OC-Aktiv-PCIe-5-0-x16--Ret_1615573.html",
      },
    ],
  },
  {
    title: "ASUS GeForce RTX 5060 Ti DUAL OC 16GB GDDR7",
    brand: "ASUS",
    manufacturer: "ASUS",
    mpn: "90YV0MH0-M0NA00",
    ean: "4711387994306",
    category: "Gaming Hardware",
    model: "RTX 5060 Ti",
    offers: [
      {
        // Aktionspreis (limited-time) when captured - re-check before
        // trusting this one for long, more likely than the others here
        // to have moved.
        merchantName: "Alternate",
        price: 659.0,
        shipping: 0,
        inStock: true,
        productUrl: "https://www.alternate.de/ASUS/GeForce-RTX-5060-Ti-DUAL-OC-16GB-Grafikkarte/html/product/100124310",
      },
      {
        // A different AIB card (Palit, not ASUS) - Mindfactory didn't have
        // the exact ASUS SKU in stock at capture time. Same GPU/VRAM class,
        // not the identical part number as the Alternate offer above.
        merchantName: "Mindfactory",
        price: 799.0,
        shipping: 0,
        inStock: true,
        productUrl:
          "https://www.mindfactory.de/product_info.php/search/true/16GB-Palit-GeForce-RTX-5060-Ti-Infinity-3-OC-Aktiv-PCIe-5-0_1616407.html",
      },
    ],
  },
  {
    title: "AMD Ryzen 7 9800X3D Prozessor (AM5, 8-Core, 3D V-Cache)",
    brand: "AMD",
    manufacturer: "AMD",
    mpn: "100-100001084WOF",
    ean: "0730143315289",
    category: "PC Hardware",
    model: "Ryzen 7 9800X3D",
    offers: [
      {
        merchantName: "Alternate",
        price: 404.0,
        shipping: 0,
        inStock: true,
        productUrl: "https://www.alternate.de/AMD/Ryzen-7-9800X3D-Prozessor/html/product/100093605",
      },
      {
        // "Tray (open Box)" - a cheaper packaging/condition variant, not
        // the identical retail-boxed unit as the Alternate offer above.
        merchantName: "Mindfactory",
        price: 399.0,
        shipping: 0,
        inStock: true,
        productUrl:
          "https://www.mindfactory.de/product_info.php/search/true/AMD-Ryzen-7-9800X3D-8x-4-70GHz-So-AM5-TRAY--open-Box-_1596199.html",
      },
    ],
  },
  {
    title: "Samsung 990 PRO 2TB NVMe SSD PCIe 4.0",
    brand: "Samsung",
    manufacturer: "Samsung",
    mpn: "MZ-V9P2T0BW",
    ean: "8806094215038",
    category: "Computer Accessories",
    model: "990 Pro 2TB",
    offers: [
      {
        merchantName: "Alternate",
        price: 369.0,
        shipping: 0,
        inStock: true,
        productUrl: "https://www.alternate.de/Samsung/990-PRO-2-TB-SSD/html/product/1864243",
      },
      {
        merchantName: "Mindfactory",
        price: 338.99,
        shipping: 0,
        inStock: true,
        productUrl:
          "https://www.mindfactory.de/product_info.php/search/true/2TB-Samsung-990-PRO-M-2-PCIe-4-0-3D-NAND-TLC--MZ-V9P2T0BW-_1473218.html",
      },
    ],
  },
  {
    title: "Kingston FURY Beast 32GB (2x16GB) DDR5-6000 CL30",
    brand: "Kingston",
    manufacturer: "Kingston",
    mpn: "KF560C30BBEK2-32",
    ean: "0740617342994",
    category: "Computer Accessories",
    model: "FURY Beast 32GB DDR5-6000",
    offers: [
      {
        merchantName: "Alternate",
        price: 593.0,
        shipping: 0,
        inStock: true,
        productUrl:
          "https://www.alternate.de/Kingston-FURY/DIMM-32-GB-DDR5-6000-2x-16-GB-Dual-Kit-Arbeitsspeicher/html/product/100052230",
      },
      {
        merchantName: "Mindfactory",
        price: 598.99,
        shipping: 0,
        inStock: true,
        productUrl:
          "https://www.mindfactory.de/product_info.php/search/true/32GB-Kingston-FURY-Beast-schwarz-DDR5-6000-DIMM-CL30-Dual-K_1532154.html",
      },
    ],
  },
];

const CURRENCY = "EUR";

// Common short filler words that would otherwise dilute the match ratio
// below without adding any real matching signal.
const STOPWORDS = new Set(["der", "die", "das", "und", "für", "mit", "auf", "von", "im", "in", "zu"]);

/** Lowercases, strips punctuation Amazon/Otto/etc. titles use as separators, and drops filler tokens. */
function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      // Real listings write capacity/speed with a space ("2 TB", "6000 MHz");
      // this catalog's own data doesn't ("2TB", "6000MHz"). Collapse the
      // space so both forms tokenize to the same word - otherwise a real
      // "2 TB" page would never satisfy a required "2tb" token, and the
      // capacity requirement below would just always fail on live pages.
      .replace(/(\d)\s+(tb|gb|mb|mhz|ghz)\b/g, "$1$2")
      .replace(/[,.;:()]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => token.length > 2 || /\d/.test(token))
      .filter((token) => !STOPWORDS.has(token))
  );
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
 * "Pro" is missing. The same problem shows up one level down: a real
 * "Samsung 990 PRO 1TB" page genuinely is a 990 Pro, but at a different
 * capacity - and therefore a different real price - than the catalog's
 * 990 Pro *2TB* entry, so "2TB" can't be optional either. There's no
 * reliable way to tell in general which words of a model name are
 * "just a spec" versus part of what actually distinguishes one real,
 * differently-priced product from another - so none of them are treated
 * as optional: every token of the catalog item's model must be present
 * in the query for it to count as a match.
 */
function slugMatches(query: string, item: DemoCatalogItem): boolean {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return false;

  const required = tokenize(item.model);
  return required.length > 0 && required.every((token) => queryTokens.has(token));
}

/**
 * DemoProvider: a small, hand-curated catalog of real products (see the
 * comment on DEMO_CATALOG above) rather than a live external API. It
 * never calls any external network at request time and is always
 * CONFIGURATION_REQUIRED == false, so the rest of the system (search,
 * matching, click redirect) is fully exercisable without any affiliate
 * network approval.
 */
export class DemoProvider implements PriceProvider {
  readonly providerId = "demo";
  readonly displayName = "PricePilot Curated Catalog";

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
        // merchant name are both static catalog data, so this id is
        // stable across restarts.
        const offerId = `demo_${item.ean}-${merchantOffer.merchantName.toLowerCase().replace(/\s+/g, "-")}`;
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
          productUrl: merchantOffer.productUrl,
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
    // These are real merchant product pages, but plain links - Alternate
    // and Mindfactory haven't approved this account's affiliate
    // application yet (see the Awin applications), so there's no
    // tracking parameter to legitimately add. Once that approval lands,
    // this is where the real Awin cread.php-style link would be built
    // instead (see AwinProvider.generateAffiliateUrl for that pattern).
    return offer.productUrl;
  }
}
