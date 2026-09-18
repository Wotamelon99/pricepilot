/**
 * Extracts schema.org Product data from <script type="application/ld+json">
 * blocks. This is the highest-priority, most structured signal a merchant
 * page can offer - when present and well-formed it beats OpenGraph tags
 * and visible-DOM selectors (see identity.ts for the merge order).
 */

export interface JsonLdProduct {
  // `T | undefined` (not just `T`) on every optional field: nodeToProduct()
  // below assigns each one directly from a ternary/helper call that can
  // itself evaluate to `undefined`, which `exactOptionalPropertyTypes`
  // rejects against a bare `field?: T`.
  readonly name?: string | undefined;
  readonly gtin?: string | undefined;
  readonly gtin8?: string | undefined;
  readonly gtin12?: string | undefined;
  readonly gtin13?: string | undefined;
  readonly gtin14?: string | undefined;
  readonly sku?: string | undefined;
  readonly mpn?: string | undefined;
  readonly brand?: string | undefined;
  readonly category?: string | undefined;
  readonly image?: string | undefined;
  readonly price?: number | undefined;
  readonly priceCurrency?: string | undefined;
}

function unwrapBrand(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value) {
    const name = (value as { name?: unknown }).name;
    return typeof name === "string" ? name : undefined;
  }
  return undefined;
}

function unwrapImage(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  if (value && typeof value === "object" && "url" in value) {
    const url = (value as { url?: unknown }).url;
    return typeof url === "string" ? url : undefined;
  }
  return undefined;
}

function extractOfferPrice(offers: unknown): { price?: number | undefined; currency?: string | undefined } {
  const offer = Array.isArray(offers) ? offers[0] : offers;
  if (!offer || typeof offer !== "object") return {};
  const o = offer as Record<string, unknown>;
  const priceRaw = o.price ?? (o.priceSpecification as Record<string, unknown> | undefined)?.price;
  const currencyRaw =
    o.priceCurrency ??
    (o.priceSpecification as Record<string, unknown> | undefined)?.priceCurrency;
  const price = typeof priceRaw === "string" ? Number.parseFloat(priceRaw) : priceRaw;
  return {
    price: typeof price === "number" && !Number.isNaN(price) ? price : undefined,
    currency: typeof currencyRaw === "string" ? currencyRaw : undefined,
  };
}

function nodeToProduct(node: Record<string, unknown>): JsonLdProduct | undefined {
  const type = node["@type"];
  const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
  if (!isProduct) return undefined;

  const { price, currency } = extractOfferPrice(node.offers);

  return {
    name: typeof node.name === "string" ? node.name : undefined,
    gtin: typeof node.gtin === "string" ? node.gtin : undefined,
    gtin8: typeof node.gtin8 === "string" ? node.gtin8 : undefined,
    gtin12: typeof node.gtin12 === "string" ? node.gtin12 : undefined,
    gtin13: typeof node.gtin13 === "string" ? node.gtin13 : undefined,
    gtin14: typeof node.gtin14 === "string" ? node.gtin14 : undefined,
    sku: typeof node.sku === "string" ? node.sku : undefined,
    mpn: typeof node.mpn === "string" ? node.mpn : undefined,
    brand: unwrapBrand(node.brand),
    category: typeof node.category === "string" ? node.category : undefined,
    image: unwrapImage(node.image),
    price,
    priceCurrency: currency,
  };
}

/** Recursively walks parsed JSON-LD (which may be an object, array, or @graph) looking for a Product node. */
function findProductNode(data: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findProductNode(item);
      if (found) return found;
    }
    return undefined;
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const type = obj["@type"];
    if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
      return obj;
    }
    if (Array.isArray(obj["@graph"])) {
      return findProductNode(obj["@graph"]);
    }
  }
  return undefined;
}

/** Scans the document for the first parseable JSON-LD Product block. */
export function extractJsonLdProduct(doc: Document = document): JsonLdProduct | undefined {
  const scripts = doc.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]');

  for (const script of scripts) {
    const raw = script.textContent?.trim();
    if (!raw) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue; // malformed JSON-LD is common in the wild; skip and keep looking
    }

    const productNode = findProductNode(parsed);
    if (productNode) {
      const product = nodeToProduct(productNode);
      if (product) return product;
    }
  }

  return undefined;
}
