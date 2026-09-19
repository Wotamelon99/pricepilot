import { findPriceInDom } from "../price.js";
import type { SiteExtractionResult, SiteExtractor } from "./types.js";

/**
 * Saturn.de extractor - Saturn and MediaMarkt share the same commerce
 * platform (Ceconomy), so this mirrors mediamarkt.ts's selectors. Kept as
 * a separate module (rather than one extractor with two hostnames) so the
 * two can diverge independently once real-site differences are found.
 */

const SKU_URL_PATTERN = /\/(\d{7,})(?:\/|$|\?)/;

// No bare "h1" fallback - that would match any heading on any page
// (homepage, category listing), misdetecting a product where there is
// none. Only this product-page-specific selector counts.
const TITLE_SELECTORS = ['h1[data-test="product-title"]'];

const PRICE_SELECTORS = ['[data-test="branded-price-whole-price"]', ".price", '[itemprop="price"]'];

function extractSku(url: URL): string | undefined {
  return url.pathname.match(SKU_URL_PATTERN)?.[1];
}

export const saturnExtractor: SiteExtractor = {
  siteId: "saturn",
  hostnames: ["www.saturn.de"],
  extract(doc: Document, url: URL): SiteExtractionResult {
    let title: string | undefined;
    for (const selector of TITLE_SELECTORS) {
      title = doc.querySelector(selector)?.textContent?.trim();
      if (title) break;
    }

    return {
      title,
      sku: extractSku(url),
      priceAmount: findPriceInDom(doc, PRICE_SELECTORS),
      priceCurrency: "EUR",
    };
  },
};
