import type {
  Offer,
  PriceProvider,
  ProductSearchQuery,
  ProviderSearchResult,
} from "./types.js";
import { config } from "../config/env.js";
import { logger } from "../lib/logger.js";
import {
  getItemsByAsin,
  searchItems,
  type CreatorsApiItem,
} from "./amazon-creators-client.js";

/**
 * Amazon provider (Germany marketplace), backed by the "Creators API".
 *
 * Amazon retired the older "Product Advertising API 5.0" (PA-API), which
 * this provider originally targeted - PA-API now returns HTTP 403 with
 * "deprecated, migrate to Creators API" for all requests. The Creators
 * API is OAuth2-based (see amazon-creators-client.ts) rather than
 * AWS-SigV4-based, and requires its own separate credentials.
 *
 * Getting real data flowing requires, in order:
 * 1. An Amazon Associates (PartnerNet) account approved for the DE
 *    marketplace - already the case, since AMAZON_PARTNER_TAG is set.
 * 2. Applying for Creators API access at
 *    https://affiliate-program.amazon.com/creatorsapi and generating a
 *    Credential ID + Secret there (distinct from any AWS IAM credentials).
 * 3. Setting AMAZON_CREDENTIAL_ID / AMAZON_CREDENTIAL_SECRET in the
 *    backend's environment.
 * Until all three are done, isConfigured() is false and this provider
 * reports CONFIGURATION_REQUIRED, same as before.
 */
export class AmazonProvider implements PriceProvider {
  readonly providerId = "amazon";
  readonly displayName = "Amazon.de";

  isConfigured(): boolean {
    return config.amazon.isConfigured;
  }

  async searchProduct(query: ProductSearchQuery): Promise<ProviderSearchResult> {
    if (!this.isConfigured()) {
      return { status: "CONFIGURATION_REQUIRED", providerId: this.providerId, offers: [] };
    }

    try {
      let items: CreatorsApiItem[];
      if (query.asin) {
        items = await getItemsByAsin([query.asin]);
      } else {
        const keywords = buildKeywords(query);
        if (!keywords) {
          return { status: "OK", providerId: this.providerId, offers: [] };
        }
        items = await searchItems(keywords);
      }

      const offers = items.map((item) => this.toOffer(item)).filter((o): o is Offer => o !== undefined);
      return { status: "OK", providerId: this.providerId, offers };
    } catch (err) {
      logger.error({ err }, "amazon provider search failed");
      return {
        status: "ERROR",
        providerId: this.providerId,
        offers: [],
        error: err instanceof Error ? err.message : "unknown error",
      };
    }
  }

  async getProduct(offerId: string): Promise<Offer | undefined> {
    if (!this.isConfigured()) return undefined;
    // offerId for this provider is namespaced as "amazon_<ASIN>" (the
    // provider-id-then-underscore convention click.ts relies on to route
    // /api/offers/:offerId/click back to the right provider - see
    // DemoProvider's `demo_${uuid}` offer ids for the same pattern).
    const asin = offerId.startsWith("amazon_") ? offerId.slice("amazon_".length) : offerId;
    try {
      const [item] = await getItemsByAsin([asin]);
      return item ? this.toOffer(item) : undefined;
    } catch (err) {
      logger.error({ err, asin }, "amazon provider getProduct failed");
      return undefined;
    }
  }

  generateAffiliateUrl(offer: Offer): string {
    // Creators API's detailPageUrl already embeds the partner tag when
    // returned from a search/getItems call; this is a defensive fallback
    // for any offer.productUrl that doesn't already carry one.
    const url = new URL(offer.productUrl);
    if (!url.searchParams.has("tag")) {
      url.searchParams.set("tag", config.amazon.partnerTag);
    }
    return url.toString();
  }

  private toOffer(item: CreatorsApiItem): Offer | undefined {
    const asin = item.asin;
    const title = item.itemInfo?.title?.displayValue;
    const listing = item.offers?.listings?.[0];
    const priceAmount = listing?.price?.amount;
    const productUrl = item.detailPageUrl;

    if (!asin || !title || priceAmount === undefined || !productUrl) {
      // Missing core fields (e.g. no current offer/listing) - skip rather
      // than fabricate a partial result.
      return undefined;
    }

    const currency = listing?.price?.currency ?? "EUR";
    const inStock = (listing?.availability?.type ?? "Now").toLowerCase() !== "outofstock";
    const ean = item.itemInfo?.externalIds?.eANs?.displayValues?.[0];

    const money = { amount: priceAmount, currency };

    return {
      offerId: `amazon_${asin}`,
      providerId: this.providerId,
      merchantName: "Amazon.de",
      productTitle: title,
      identity: {
        asin,
        title,
        ...(ean ? { ean } : {}),
        ...(item.itemInfo?.byLineInfo?.brand?.displayValue
          ? { brand: item.itemInfo.byLineInfo.brand.displayValue }
          : {}),
        ...(item.itemInfo?.byLineInfo?.manufacturer?.displayValue
          ? { manufacturer: item.itemInfo.byLineInfo.manufacturer.displayValue }
          : {}),
        ...(item.itemInfo?.classifications?.productGroup?.displayValue
          ? { category: item.itemInfo.classifications.productGroup.displayValue }
          : {}),
      },
      price: money,
      shipping: { amount: 0, currency }, // Amazon-fulfilled listings are shown shipping-inclusive.
      totalPrice: money,
      inStock,
      productUrl,
      ...(item.images?.primary?.medium?.url ? { imageUrl: item.images.primary.medium.url } : {}),
      currency,
      fetchedAt: new Date().toISOString(),
      matchConfidence: 1,
    };
  }
}

function buildKeywords(query: ProductSearchQuery): string | undefined {
  const parts = [query.text, query.brand, query.mpn].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(" ") : undefined;
}
