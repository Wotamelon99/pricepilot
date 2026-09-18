import { findPriceInDom } from "../price.js";
import type { SiteExtractionResult, SiteExtractor } from "./types.js";

/**
 * Otto.de extractor.
 *
 * Otto product pages generally publish good schema.org JSON-LD (tried
 * first, see jsonld.ts), so this is a lightweight fallback covering the
 * common `h1` product title and visible price display. As with all
 * per-site extractors, spot-check these selectors against the live site
 * before relying on them in production - retailer markup changes without
 * notice and cannot be verified from this environment.
 */

const TITLE_SELECTORS = ['h1[data-qa="pdp-product-name"]', "h1.pdp_title", "main h1"];

const PRICE_SELECTORS = [
  '[data-qa="pdp-price"]',
  ".pdp_price",
  '[itemprop="price"]',
  ".s-productcard-price",
];

export const ottoExtractor: SiteExtractor = {
  siteId: "otto",
  hostnames: ["www.otto.de"],
  extract(doc: Document): SiteExtractionResult {
    let title: string | undefined;
    for (const selector of TITLE_SELECTORS) {
      title = doc.querySelector(selector)?.textContent?.trim();
      if (title) break;
    }

    return {
      title,
      priceAmount: findPriceInDom(doc, PRICE_SELECTORS),
      priceCurrency: "EUR",
    };
  },
};
