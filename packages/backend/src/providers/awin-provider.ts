import type {
  Offer,
  PriceProvider,
  ProductSearchQuery,
  ProviderSearchResult,
} from "./types.js";
import { config } from "../config/env.js";

/**
 * Awin affiliate network provider.
 *
 * Phase 2 scope: registered, reports CONFIGURATION_REQUIRED until an Awin
 * API token is set, and generates deep-linked affiliate URLs via Awin's
 * standard click-through format so the redirect pipeline is testable
 * end-to-end. Live product-feed ingestion (Awin Product Feeds / API) is
 * implemented in Phase 4.
 */
export class AwinProvider implements PriceProvider {
  readonly providerId = "awin";
  readonly displayName = "Awin Network";

  isConfigured(): boolean {
    return config.awin.isConfigured;
  }

  async searchProduct(_query: ProductSearchQuery): Promise<ProviderSearchResult> {
    if (!this.isConfigured()) {
      return { status: "CONFIGURATION_REQUIRED", providerId: this.providerId, offers: [] };
    }
    // Phase 4: query Awin product feeds / API, normalize results into Offer[].
    return { status: "OK", providerId: this.providerId, offers: [] };
  }

  async getProduct(_offerId: string): Promise<Offer | undefined> {
    if (!this.isConfigured()) return undefined;
    return undefined;
  }

  generateAffiliateUrl(offer: Offer): string {
    // Awin standard deep-link click-through format.
    const destination = encodeURIComponent(offer.productUrl);
    return `https://www.awin1.com/cread.php?awinmid=0&awinaffid=${config.awin.publisherId}&clickref=pricepilot&p=${destination}`;
  }
}
