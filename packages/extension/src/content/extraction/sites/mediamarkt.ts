import { findPriceInDom } from "../price.js";
import type { SiteExtractionResult, SiteExtractor } from "./types.js";

/**
 * MediaMarkt.de extractor.
 *
 * MediaMarkt (like Saturn - same parent company/platform, hence the very
 * similar selectors in saturn.ts) publishes SKU-like identifiers in the
 * URL slug (".../pdp/<SKU>") on many product pages. Title/price selectors
 * are a best-effort fallback behind JSON-LD/OpenGraph; verify against the
 * live DOM before production use, as with every per-site extractor here.
 */

const SKU_URL_PATTERN = /\/(\d{7,})(?:\/|$|\?)/;

const TITLE_SELECTORS = ['h1[data-test="product-title"]', "h1"];

const PRICE_SELECTORS = ['[data-test="branded-price-whole-price"]', ".price", '[itemprop="price"]'];

function extractSku(url: URL): string | undefined {
  return url.pathname.match(SKU_URL_PATTERN)?.[1];
}

export const mediaMarktExtractor: SiteExtractor = {
  siteId: "mediamarkt",
  hostnames: ["www.mediamarkt.de"],
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
