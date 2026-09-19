import type {
  Offer,
  PriceProvider,
  ProductSearchQuery,
  ProviderSearchResult,
} from "./types.js";
import { config } from "../config/env.js";
import { pool } from "../db/pool.js";
import { logger } from "../lib/logger.js";

interface AwinProductRow {
  id: string;
  merchant_id: string;
  merchant_name: string;
  aw_product_id: string;
  product_name: string;
  brand_name: string | null;
  category_name: string | null;
  ean: string | null;
  mpn: string | null;
  currency: string;
  price_amount: string;
  delivery_cost: string;
  aw_deep_link: string;
  merchant_product_url: string | null;
  image_url: string | null;
  in_stock: boolean;
  synced_at: string;
}

const MAX_RESULTS = 20;

/** Builds an Awin cread.php tracked deep link around a raw destination URL. */
function buildCreadLink(advertiserId: string, destinationUrl: string): string {
  const destination = encodeURIComponent(destinationUrl);
  return `https://www.awin1.com/cread.php?awinmid=${advertiserId}&awinaffid=${config.awin.publisherId}&clickref=pricepilot&p=${destination}`;
}

/**
 * Awin affiliate network provider.
 *
 * Awin has no live, cross-advertiser product search API - a publisher can
 * only download bulk CSV datafeeds for the specific merchant programs
 * they've been accepted into (see src/lib/awin-feed-sync.ts). This
 * provider therefore searches the *local* `awin_products` table, which
 * the feed-sync job keeps populated, rather than calling Awin per-request.
 *
 * Practical consequence: coverage is limited to whichever merchants your
 * Awin publisher account (ID from AWIN_PUBLISHER_ID) has been approved
 * for, and only after `npm run sync:awin` has been run at least once.
 * "All products in Germany" isn't something any single API can offer -
 * this grows as you join more Awin merchant programs and keep the feed
 * sync running (e.g. nightly via a scheduled job).
 */
export class AwinProvider implements PriceProvider {
  readonly providerId = "awin";
  readonly displayName = "Awin Network";

  isConfigured(): boolean {
    return config.awin.isConfigured;
  }

  async searchProduct(query: ProductSearchQuery): Promise<ProviderSearchResult> {
    if (!this.isConfigured()) {
      return { status: "CONFIGURATION_REQUIRED", providerId: this.providerId, offers: [] };
    }

    try {
      const rows = await this.queryLocalCatalog(query);
      const offers = rows.map((row) => this.toOffer(row));
      return { status: "OK", providerId: this.providerId, offers };
    } catch (err) {
      logger.error({ err }, "awin provider search failed");
      return {
        status: "ERROR",
        providerId: this.providerId,
        offers: [],
        error: err instanceof Error ? err.message : "unknown error",
      };
    }
  }

  async getProduct(offerId: string): Promise<Offer | undefined> {
    // offerId for this provider is namespaced as "awin_<row-uuid>" (the
    // provider-id-then-underscore convention click.ts relies on - see
    // DemoProvider's `demo_${uuid}` offer ids for the same pattern).
    const id = offerId.startsWith("awin_") ? offerId.slice("awin_".length) : offerId;
    const result = await pool.query<AwinProductRow>(
      "SELECT * FROM awin_products WHERE id = $1",
      [id],
    );
    const row = result.rows[0];
    return row ? this.toOffer(row) : undefined;
  }

  generateAffiliateUrl(offer: Offer): string {
    // Real Awin datafeed rows carry Awin's own aw_deep_link as
    // offer.productUrl, which is already a full tracked
    // https://www.awin1.com/cread.php?... click-through URL - don't wrap
    // it in another layer of cread.php. Anything else (e.g. a generic
    // merchant URL that never went through a feed) gets the standard
    // Awin deep-link click-through format built around it.
    try {
      const existing = new URL(offer.productUrl);
      if (existing.hostname === "www.awin1.com" || existing.hostname === "awin1.com") {
        return offer.productUrl;
      }
    } catch {
      // Not a valid absolute URL - fall through to build one below.
    }

    // No known advertiser id for this offer (e.g. it didn't come from
    // our own awin_products table) - fall back to 0 rather than fail;
    // this path shouldn't be hit for real awin_products-sourced offers,
    // since toOffer() always builds a proper cread.php link above.
    return buildCreadLink("0", offer.productUrl);
  }

  private async queryLocalCatalog(query: ProductSearchQuery): Promise<AwinProductRow[]> {
    if (query.ean) {
      const result = await pool.query<AwinProductRow>(
        "SELECT * FROM awin_products WHERE ean = $1 ORDER BY price_amount ASC LIMIT $2",
        [query.ean, MAX_RESULTS],
      );
      if (result.rows.length > 0) return result.rows;
    }

    const searchText = [query.text, query.brand].filter(Boolean).join(" ").trim();
    if (!searchText) return [];

    const result = await pool.query<AwinProductRow>(
      `SELECT *, ts_rank(search_vector, websearch_to_tsquery('german', $1)) AS rank
       FROM awin_products
       WHERE search_vector @@ websearch_to_tsquery('german', $1)
       ORDER BY rank DESC, price_amount ASC
       LIMIT $2`,
      [searchText, MAX_RESULTS],
    );
    return result.rows;
  }

  private toOffer(row: AwinProductRow): Offer {
    const price = Number.parseFloat(row.price_amount);
    const shipping = Number.parseFloat(row.delivery_cost);
    const total = price + shipping;

    return {
      offerId: `awin_${row.id}`,
      providerId: this.providerId,
      merchantName: row.merchant_name,
      productTitle: row.product_name,
      identity: {
        title: row.product_name,
        ...(row.ean ? { ean: row.ean } : {}),
        ...(row.mpn ? { mpn: row.mpn } : {}),
        ...(row.brand_name ? { brand: row.brand_name } : {}),
        ...(row.category_name ? { category: row.category_name } : {}),
      },
      price: { amount: price, currency: row.currency },
      shipping: { amount: shipping, currency: row.currency },
      totalPrice: { amount: total, currency: row.currency },
      inStock: row.in_stock,
      // aw_deep_link, as stored by awin-feed-sync.ts, is the enhanced
      // feed's raw (non-trackable) product URL - build the actual
      // tracked cread.php deep link here, where row.merchant_id (the
      // real Awin advertiser id) is available.
      productUrl: buildCreadLink(row.merchant_id, row.aw_deep_link),
      ...(row.image_url ? { imageUrl: row.image_url } : {}),
      currency: row.currency,
      fetchedAt: row.synced_at,
      matchConfidence: 1,
    };
  }
}
