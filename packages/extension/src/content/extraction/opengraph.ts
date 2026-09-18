/**
 * Extracts OpenGraph / meta-tag product signals. Used as the second
 * priority tier: less structured than JSON-LD but far more standardized
 * (and reliable) than scraping visible page text.
 */

export interface OpenGraphProduct {
  // See JsonLdProduct in jsonld.ts for why these are `T | undefined`
  // rather than plain `T` under `exactOptionalPropertyTypes`.
  readonly title?: string | undefined;
  readonly image?: string | undefined;
  readonly priceAmount?: number | undefined;
  readonly priceCurrency?: string | undefined;
  readonly brand?: string | undefined;
  readonly gtin?: string | undefined;
  readonly mpn?: string | undefined;
}

function metaContent(doc: Document, selector: string): string | undefined {
  const el = doc.querySelector<HTMLMetaElement>(selector);
  const content = el?.content?.trim();
  return content ? content : undefined;
}

export function extractOpenGraphProduct(doc: Document = document): OpenGraphProduct {
  const priceAmountRaw =
    metaContent(doc, 'meta[property="product:price:amount"]') ??
    metaContent(doc, 'meta[property="og:price:amount"]');
  const priceAmount = priceAmountRaw ? Number.parseFloat(priceAmountRaw.replace(",", ".")) : undefined;

  return {
    title: metaContent(doc, 'meta[property="og:title"]') ?? (doc.title || undefined),
    image: metaContent(doc, 'meta[property="og:image"]'),
    priceAmount: priceAmount !== undefined && !Number.isNaN(priceAmount) ? priceAmount : undefined,
    priceCurrency:
      metaContent(doc, 'meta[property="product:price:currency"]') ??
      metaContent(doc, 'meta[property="og:price:currency"]'),
    brand: metaContent(doc, 'meta[property="product:brand"]') ?? metaContent(doc, 'meta[property="og:brand"]'),
    gtin: metaContent(doc, 'meta[property="product:gtin"]') ?? metaContent(doc, 'meta[itemprop="gtin13"]'),
    mpn: metaContent(doc, 'meta[property="product:mfr_part_no"]'),
  };
}
