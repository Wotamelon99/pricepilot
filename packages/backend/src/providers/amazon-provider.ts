import type {
  Offer,
  PriceProvider,
  ProductSearchQuery,
  ProviderSearchResult,
} from "./types.js";
import { config } from "../config/env.js";

/**
 * Amazon PA-API (Product Advertising API, Germany marketplace) provider.
 *
 * Phase 2 scope: registered, reports CONFIGURATION_REQUIRED until PA-API
 * access/secret keys are set, and generates correctly-tagged affiliate
 * URLs so the click-redirect pipeline is testable end-to-end. The actual
 * signed PA-API request/response handling is implemented in Phase 4.
 */
export class AmazonProvider implements PriceProvider {
  readonly providerId = "amazon";
  readonly displayName = "Amazon.de";

  isConfigured(): boolean {
    return config.amazon.isConfigured;
  }

  async searchProduct(_query: ProductSearchQuery): Promise<ProviderSearchResult> {
    if (!this.isConfigured()) {
      return { status: "CONFIGURATION_REQUIRED", providerId: this.providerId, offers: [] };
    }
    // Phase 4: call PA-API SearchItems, normalize results into Offer[].
    return { status: "OK", providerId: this.providerId, offers: [] };
  }

  async getProduct(_offerId: string): Promise<Offer | undefined> {
    if (!this.isConfigured()) return undefined;
    // Phase 4: call PA-API GetItems by ASIN.
    return undefined;
  }

  generateAffiliateUrl(offer: Offer): string {
    const url = new URL(offer.productUrl);
    url.searchParams.set("tag", config.amazon.partnerTag);
    return url.toString();
  }
}
