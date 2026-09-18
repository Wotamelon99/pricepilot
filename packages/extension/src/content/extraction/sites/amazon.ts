import { findPriceInDom } from "../price.js";
import type { SiteExtractionResult, SiteExtractor } from "./types.js";

/**
 * Amazon.de extractor.
 *
 * The ASIN is Amazon's own product identifier - it is not a GTIN/EAN, but
 * it is extremely reliable to extract (present in the URL and in a stable
 * `data-asin` attribute on the buy box), which is why it sits above plain
 * title-scraping in the matching hierarchy. Amazon pages generally also
 * carry JSON-LD/OpenGraph data (see jsonld.ts / opengraph.ts), which is
 * tried first; these selectors are the fallback for when that's missing.
 *
 * NOTE: Amazon's DOM structure changes fairly often and varies by category
 * and A/B test cohort. The selectors below target the long-standing,
 * widely-documented element IDs (#productTitle, #priceblock_ourprice and
 * successors, [data-asin]) but should be spot-checked against the live
 * site periodically and adjusted if Amazon changes markup.
 */

const ASIN_URL_PATTERN = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i;

function extractAsin(doc: Document, url: URL): string | undefined {
  const fromUrl = url.pathname.match(ASIN_URL_PATTERN)?.[1];
  if (fromUrl) return fromUrl.toUpperCase();

  const withAttr = doc.querySelector<HTMLElement>("[data-asin]:not([data-asin=''])");
  const attrValue = withAttr?.getAttribute("data-asin");
  if (attrValue) return attrValue.toUpperCase();

  const inputAsin = doc.querySelector<HTMLInputElement>("input#ASIN");
  if (inputAsin?.value) return inputAsin.value.toUpperCase();

  return undefined;
}

const TITLE_SELECTORS = ["#productTitle", 'h1[data-testid="product-title"]', "h1#title"];

const PRICE_SELECTORS = [
  "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
  "#priceblock_ourprice",
  "#priceblock_dealprice",
  ".a-price .a-offscreen",
];

const BRAND_SELECTORS = ["#bylineInfo", "a#bylineInfo"];

function extractTitle(doc: Document): string | undefined {
  for (const selector of TITLE_SELECTORS) {
    const text = doc.querySelector(selector)?.textContent?.trim();
    if (text) return text;
  }
  return undefined;
}

/** Finds a product-details table row by its (German) label text, e.g. "Marke". `:contains()` is a jQuery-only extension, not valid CSS, so this walks rows manually instead. */
function extractTableValueByLabel(doc: Document, labelPattern: RegExp): string | undefined {
  const rows = doc.querySelectorAll("#productDetails_techSpec_section_1 tr, #detailBullets_feature_div li, table.a-keyvalue tr");
  for (const row of rows) {
    const label = row.querySelector("th, .a-text-bold")?.textContent?.trim();
    if (label && labelPattern.test(label)) {
      const value = row.querySelector("td")?.textContent?.trim();
      if (value) return value;
    }
  }
  return undefined;
}

function extractBrand(doc: Document): string | undefined {
  for (const selector of BRAND_SELECTORS) {
    const text = doc.querySelector(selector)?.textContent?.trim();
    if (text) return text.replace(/^(Marke:|Besuche den Store von|Store)/i, "").trim();
  }
  return extractTableValueByLabel(doc, /^Marke\b/i);
}

export const amazonExtractor: SiteExtractor = {
  siteId: "amazon",
  hostnames: ["www.amazon.de"],
  extract(doc: Document, url: URL): SiteExtractionResult {
    return {
      title: extractTitle(doc),
      asin: extractAsin(doc, url),
      brand: extractBrand(doc),
      priceAmount: findPriceInDom(doc, PRICE_SELECTORS),
      priceCurrency: "EUR",
    };
  },
};
