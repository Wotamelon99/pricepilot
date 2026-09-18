import { extractJsonLdProduct } from "./jsonld.js";
import { extractOpenGraphProduct } from "./opengraph.js";
import { getSiteExtractor } from "./sites/registry.js";
import type { DetectedProduct, Money, ProductIdentity } from "../../shared/types.js";

/**
 * Merges the three extraction tiers - JSON-LD, OpenGraph/meta tags, and
 * per-site DOM selectors - into a single ProductIdentity, in priority
 * order (JSON-LD is the most structured/reliable, DOM selectors the most
 * brittle). Later tiers only fill in fields the earlier tiers left empty;
 * they never overwrite a value already found.
 *
 * This mirrors the backend's identifier priority (GTIN/EAN > MPN+Brand >
 * ASIN > SKU > title, see packages/backend/src/matching/matcher.ts) at the
 * extraction stage: we simply try to capture every identifier we can find
 * and let the backend's matching engine decide which one to trust.
 */
export function detectProduct(doc: Document = document, location: Location = window.location): DetectedProduct | undefined {
  const url = new URL(location.href);
  const siteExtractor = getSiteExtractor(url.hostname);
  const siteResult = siteExtractor?.extract(doc, url);

  const jsonLd = extractJsonLdProduct(doc);
  const og = extractOpenGraphProduct(doc);

  const title = jsonLd?.name ?? siteResult?.title ?? og.title;
  if (!title) {
    // Without at least a title we have nothing usable to search with.
    return undefined;
  }

  const identity: ProductIdentity = {
    title,
    ean: jsonLd?.gtin13 ?? jsonLd?.gtin ?? og.gtin ?? siteResult?.ean,
    gtin: jsonLd?.gtin14 ?? jsonLd?.gtin12 ?? jsonLd?.gtin8,
    asin: siteResult?.asin,
    brand: jsonLd?.brand ?? og.brand ?? siteResult?.brand,
    mpn: jsonLd?.mpn ?? og.mpn ?? siteResult?.mpn,
    sku: jsonLd?.sku ?? siteResult?.sku,
    category: jsonLd?.category,
    sourceUrl: url.toString(),
  };

  const priceAmount = jsonLd?.price ?? og.priceAmount ?? siteResult?.priceAmount;
  const priceCurrency = jsonLd?.priceCurrency ?? og.priceCurrency ?? siteResult?.priceCurrency ?? "EUR";

  const displayedPrice: Money | undefined =
    priceAmount !== undefined ? { amount: priceAmount, currency: priceCurrency } : undefined;

  return {
    identity: stripUndefined(identity),
    ...(displayedPrice ? { displayedPrice } : {}),
    detectedAt: new Date().toISOString(),
    pageUrl: url.toString(),
  };
}

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}
